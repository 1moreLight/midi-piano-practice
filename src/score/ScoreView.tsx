import { useEffect, useRef, useState } from 'react';
import { CursorType, OpenSheetMusicDisplay, type Note } from 'opensheetmusicdisplay';
import { collectMoments, midiFromOsmdHalfTone, type LoadedScore } from './moments.ts';
import type { ReadNote } from './moments.ts';

export type ScoreSource = {
  token: number;
  name: string;
} & ({ kind: 'url'; url: string } | { kind: 'text'; text: string } | { kind: 'blob'; blob: Blob });

type ScoreViewProps = {
  source: ScoreSource;
  /** Cursor steps from the start. Null hides the cursor. */
  cursorStep: number | null;
  onLoaded: (score: LoadedScore) => void;
  onError: (message: string) => void;
  onBusy: (busy: boolean) => void;
};

const EMPTY_MESSAGE = '这份谱里没有找到要弹的音。';
const READ_MESSAGE = '这份谱没有读出来。请换一份 MusicXML（.xml、.musicxml）或 .mxl。';

export function ScoreView({ source, cursorStep, onLoaded, onError, onBusy }: ScoreViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const onLoadedRef = useRef(onLoaded);
  const onErrorRef = useRef(onError);
  const onBusyRef = useRef(onBusy);
  const cursorStepRef = useRef(cursorStep);
  const readyRef = useRef(false);
  const widthRef = useRef(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onLoadedRef.current = onLoaded;
    onErrorRef.current = onError;
    onBusyRef.current = onBusy;
    cursorStepRef.current = cursorStep;
  });

  useEffect(() => {
    const host = hostRef.current;
    const wrap = wrapRef.current;
    if (!host || !wrap) return;
    let cancelled = false;
    readyRef.current = false;
    setReady(false);
    onBusyRef.current(true);
    host.replaceChildren();

    const osmd = new OpenSheetMusicDisplay(host, {
      autoResize: false,
      backend: 'svg',
      drawTitle: true,
      drawComposer: true,
      drawPartNames: false,
      drawPartAbbreviations: false,
      drawMeasureNumbers: true,
      followCursor: false,
      cursorsOptions: [{ type: CursorType.Standard, color: '#1f6f5b', alpha: 0.5, follow: false }],
    });
    osmdRef.current = osmd;

    void (async () => {
      try {
        const content = source.kind === 'url' ? source.url : source.kind === 'text' ? source.text : source.blob;
        await osmd.load(content);
        if (cancelled) return;
        widthRef.current = Math.floor(wrap.clientWidth);
        osmd.render();
        const moments = collectMoments(slicesFromCursor(osmd));
        if (cancelled) return;
        if (moments.length === 0) throw new Error('empty');
        const title = osmd.Sheet.TitleString?.trim() || source.name.replace(/\.(xml|musicxml|mxl)$/i, '');
        const composer = osmd.Sheet.ComposerString?.trim() ?? '';
        onLoadedRef.current({ title, composer, sourceName: source.name, moments });
        placeCursor(osmd, 0);
        readyRef.current = true;
        setReady(true);
        onBusyRef.current(false);
      } catch (caught) {
        if (cancelled) return;
        console.error(caught);
        host.replaceChildren();
        readyRef.current = false;
        onErrorRef.current(caught instanceof Error && caught.message === 'empty' ? EMPTY_MESSAGE : READ_MESSAGE);
      }
    })();

    return () => {
      cancelled = true;
      readyRef.current = false;
      osmdRef.current = null;
      try {
        osmd.clear();
      } catch (caught) {
        console.error(caught);
      }
    };
  }, [source]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let timer = 0;
    const observer = new ResizeObserver(() => {
      const next = Math.floor(wrap.clientWidth);
      if (next < 280 || Math.abs(next - widthRef.current) < 12) return;
      widthRef.current = next;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const osmd = osmdRef.current;
        if (!osmd || !readyRef.current) return;
        try {
          osmd.render();
          placeCursor(osmd, cursorStepRef.current);
        } catch (caught) {
          console.error(caught);
        }
      }, 180);
    });
    observer.observe(wrap);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [source]);

  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || !ready) return;
    placeCursor(osmd, cursorStep);
  }, [cursorStep, ready]);

  return (
    <div ref={wrapRef} className="score-wrap">
      <div ref={hostRef} className="score-host" />
    </div>
  );
}

function slicesFromCursor(osmd: OpenSheetMusicDisplay): ReadNote[][] {
  const cursor = osmd.cursor;
  cursor.resetIterator();
  const slices: ReadNote[][] = [];
  let guard = 0;
  while (!cursor.Iterator.EndReached && guard < 4000) {
    slices.push(cursor.NotesUnderCursor().map(readNote));
    cursor.next();
    guard += 1;
  }
  if (!cursor.Iterator.EndReached) throw new Error('long');
  return slices;
}

function readNote(note: Note): ReadNote {
  const tie = note.NoteTie;
  const tieNotes = tie?.Notes ?? [];
  const tieIndex = tieNotes.indexOf(note);
  const tieContinuation = tieIndex > 0 || (tieIndex < 0 && Boolean(tie?.StartNote) && tie?.StartNote !== note);
  return {
    rest: note.isRest(),
    midi: note.isRest() || !note.Pitch ? null : midiFromOsmdHalfTone(note.halfTone),
    grace: Boolean(note.IsGraceNote),
    tieContinuation,
    visible: note.PrintObject !== false,
  };
}

function placeCursor(osmd: OpenSheetMusicDisplay, step: number | null): void {
  const cursor = osmd.cursor;
  if (step === null) {
    cursor.hide();
    return;
  }
  cursor.reset();
  for (let index = 0; index < step; index += 1) {
    if (cursor.Iterator.EndReached) break;
    cursor.next();
  }
  cursor.show();
  const marker = cursor.cursorElement;
  const frame = marker?.closest('.score-wrap');
  if (!(marker instanceof HTMLElement) || !(frame instanceof HTMLElement)) return;
  const markerBox = marker.getBoundingClientRect();
  const frameBox = frame.getBoundingClientRect();
  if (markerBox.top < frameBox.top) frame.scrollTop += markerBox.top - frameBox.top - 16;
  else if (markerBox.bottom > frameBox.bottom) frame.scrollTop += markerBox.bottom - frameBox.bottom + 16;
}
