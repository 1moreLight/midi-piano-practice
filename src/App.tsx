import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardShortcuts, Piano } from 'react-piano';
import { usePiano } from './audio/usePiano.ts';
import { useMetronome } from './metronome/useMetronome.ts';
import { useWebMidi } from './midi/useWebMidi.ts';
import { requiredPitches, skipReason, type LoadedScore, type ScoreMoment } from './score/moments.ts';
import { ScoreView, type ScoreSource } from './score/ScoreView.tsx';
import {
  createSession,
  elapsedMs,
  eventLine,
  exportPayload,
  formatClock,
  makeDrillEvent,
  makeMark,
  makeNoteEvent,
  summaryText,
  withEvent,
  type NoteSource,
  type Session,
} from './session/log.ts';
import { loadPractice, loadSettings, saveSession, saveSettings, type DurationName, type Settings } from './session/storage.ts';
import { describeHeld, isBlack, jianpuText, KEYBOARD_FIRST, KEYBOARD_LAST, MIDDLE_C, noteName } from './theory/music.ts';

type HeldNote = { midi: number; velocity: number; source: NoteSource };
type Feedback = { kind: 'correct' } | { kind: 'wrong'; played: number } | { kind: 'done' } | null;

const SAMPLE_SOURCE: ScoreSource = {
  token: 0,
  kind: 'url',
  url: '/scores/zhongyang.xml',
  name: 'zhongyang.xml',
};

export default function App() {
  const boot = useState(() => {
    const settings = loadSettings();
    return { settings, ...loadPractice(settings.bpm, settings.naturalsOnly) };
  })[0];

  const [bpm, setBpm] = useState(boot.settings.bpm);
  const [volume, setVolume] = useState(boot.settings.volume);
  const [metronomeOn, setMetronomeOn] = useState(boot.settings.metronome);
  const [naturalsOnly, setNaturalsOnly] = useState(boot.settings.naturalsOnly);
  const [showName, setShowName] = useState(boot.settings.showName);
  const [showKeyHint, setShowKeyHint] = useState(boot.settings.showKeyHint);
  const [follow, setFollow] = useState(boot.settings.follow);
  const [duration] = useState<DurationName>(boot.settings.duration);
  const [session, setSession] = useState<Session>(boot.session);
  const [scoreSource, setScoreSource] = useState<ScoreSource>(SAMPLE_SOURCE);
  const [score, setScore] = useState<LoadedScore | null>(null);
  const [scoreLoading, setScoreLoading] = useState(true);
  const [scoreError, setScoreError] = useState('');
  const [cursor, setCursor] = useState(0);
  const [matched, setMatched] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [wrong, setWrong] = useState(false);
  const [missMidi, setMissMidi] = useState<number | null>(null);
  const [held, setHeld] = useState<HeldNote[]>([]);
  const [lastHit, setLastHit] = useState<HeldNote | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);

  const piano = usePiano(volume);
  const beat = useMetronome(bpm, metronomeOn, volume);
  const keyboardRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lockRef = useRef(false);
  const cursorRef = useRef(0);
  const matchedRef = useRef<number[]>([]);
  const scoreRef = useRef<LoadedScore | null>(null);
  const followRef = useRef(follow);
  const naturalsRef = useRef(naturalsOnly);
  const sessionRef = useRef(session);
  const announceRef = useRef(false);

  useEffect(() => {
    cursorRef.current = cursor;
    scoreRef.current = score;
    followRef.current = follow;
    naturalsRef.current = naturalsOnly;
    sessionRef.current = session;
  });

  const shortcuts = useMemo(
    () =>
      KeyboardShortcuts.create({
        firstNote: MIDDLE_C,
        lastNote: KEYBOARD_LAST,
        keyboardConfig: KeyboardShortcuts.HOME_ROW,
      }),
    [],
  );

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const scroller = keyboardRef.current;
    if (!scroller) return;
    const centerMiddleC = () => {
      if (scroller.scrollWidth <= scroller.clientWidth + 2) {
        scroller.scrollLeft = 0;
        return;
      }
      const mark = scroller.querySelector('.middle-mark');
      if (!(mark instanceof HTMLElement)) return;
      const scrollerBox = scroller.getBoundingClientRect();
      const markBox = mark.getBoundingClientRect();
      scroller.scrollLeft += markBox.left - scrollerBox.left - scroller.clientWidth / 2 + markBox.width / 2;
    };
    centerMiddleC();
    const observer = new ResizeObserver(centerMiddleC);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const settings: Settings = { bpm, volume, metronome: metronomeOn, naturalsOnly, showName, showKeyHint, follow, duration };
    saveSettings(settings);
  }, [bpm, volume, metronomeOn, naturalsOnly, showName, showKeyHint, follow, duration]);

  useEffect(() => {
    const id = window.setTimeout(() => saveSession(session), 300);
    return () => window.clearTimeout(id);
  }, [session]);

  useEffect(() => {
    const unlock = () => piano.resume();
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, [piano]);

  useEffect(() => {
    if (!clearArmed) return;
    const id = window.setTimeout(() => setClearArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [clearArmed]);

  function recordNote(type: 'note-on' | 'note-off', midi: number, velocity: number, source: NoteSource) {
    setSession((current) => {
      if (!current.recording) return current;
      return withEvent(current, makeNoteEvent(current, { type, midi, velocity, source }));
    });
  }

  function recordAnswer(index: number, target: number, played: number | null, result: 'correct' | 'wrong' | 'skip') {
    const loaded = scoreRef.current;
    setSession((current) => {
      const drill = { ...current.drill };
      if (result === 'correct') {
        drill.correct += 1;
        drill.streak += 1;
        drill.bestStreak = Math.max(drill.bestStreak, drill.streak);
      } else if (result === 'wrong') {
        drill.wrong += 1;
        drill.streak = 0;
      } else {
        drill.skips += 1;
        drill.streak = 0;
      }
      const next = { ...current, drill };
      if (!current.recording) return next;
      return withEvent(
        next,
        makeDrillEvent(next, {
          lineId: loaded?.sourceName ?? 'score',
          lineTitle: loaded?.title ?? '谱',
          index,
          target,
          played,
          result,
        }),
      );
    });
  }

  function finishMoment(index: number, total: number, quiet = false) {
    const next = index + 1;
    cursorRef.current = next;
    matchedRef.current = [];
    setCursor(next);
    setMatched([]);
    setWrong(false);
    setMissMidi(null);
    if (next >= total) {
      setFeedback({ kind: 'done' });
      lockRef.current = false;
      return;
    }
    if (quiet) {
      setFeedback(null);
      lockRef.current = false;
      return;
    }
    lockRef.current = true;
    setFeedback({ kind: 'correct' });
    window.setTimeout(() => {
      lockRef.current = false;
      setFeedback((current) => (current?.kind === 'correct' ? null : current));
    }, 160);
  }

  function passSkip() {
    if (!followRef.current) return;
    lockRef.current = false;
    const loaded = scoreRef.current;
    const index = cursorRef.current;
    const moment = loaded?.moments[index];
    if (!loaded || !moment) return;
    const reason = skipReason(moment, naturalsRef.current);
    if (!reason) return;
    const label =
      reason === 'rest' ? '走过休止' : reason === 'hold' ? '延音保持' : reason === 'black' ? '跳过黑键' : '跳过超出键盘的音';
    setSession((current) => {
      const drill = { ...current.drill, skips: current.drill.skips + 1, streak: 0 };
      const next = { ...current, drill };
      return next.recording ? withEvent(next, makeMark(next, label)) : next;
    });
    finishMoment(index, loaded.moments.length, true);
  }

  function judge(midi: number) {
    if (!followRef.current || lockRef.current) return;
    const loaded = scoreRef.current;
    const index = cursorRef.current;
    const moment = loaded?.moments[index];
    if (!loaded || !moment) return;
    const asked = requiredPitches(moment.pitches, naturalsRef.current);
    if (skipReason(moment, naturalsRef.current)) {
      setWrong(true);
      setMissMidi(midi);
      setFeedback({ kind: 'wrong', played: midi });
      window.setTimeout(() => {
        setWrong(false);
        setMissMidi(null);
      }, 420);
      return;
    }
    const expected = asked.find((pitch) => !matchedRef.current.includes(pitch));
    if (expected === undefined || !asked.includes(midi) || matchedRef.current.includes(midi)) {
      setWrong(true);
      setMissMidi(midi);
      setFeedback({ kind: 'wrong', played: midi });
      if (expected !== undefined) recordAnswer(index, expected, midi, 'wrong');
      window.setTimeout(() => {
        setWrong(false);
        setMissMidi(null);
      }, 420);
      return;
    }
    const nextMatched = [...matchedRef.current, midi];
    recordAnswer(index, midi, midi, 'correct');
    if (nextMatched.length < asked.length) {
      matchedRef.current = nextMatched;
      setMatched(nextMatched);
      setWrong(false);
      setMissMidi(null);
      return;
    }
    finishMoment(index, loaded.moments.length);
  }

  function beginNote(midi: number, velocity: number, source: NoteSource) {
    let added = false;
    setHeld((current) => {
      if (current.some((note) => note.midi === midi)) return current;
      added = true;
      return [...current, { midi, velocity, source }];
    });
    if (!added) return;
    setLastHit({ midi, velocity, source });
    piano.noteOn(midi, velocity);
    recordNote('note-on', midi, velocity, source);
    judge(midi);
  }

  function endNote(midi: number) {
    let source: NoteSource = 'screen';
    let removed = false;
    setHeld((current) => {
      const found = current.find((note) => note.midi === midi);
      if (!found) return current;
      removed = true;
      source = found.source;
      return current.filter((note) => note.midi !== midi);
    });
    if (!removed) return;
    piano.noteOff(midi);
    recordNote('note-off', midi, 0, source);
  }

  const midi = useWebMidi(
    (midiNumber, velocity) => beginNote(midiNumber, velocity, 'midi'),
    (midiNumber) => endNote(midiNumber),
  );

  function resetCursor() {
    cursorRef.current = 0;
    matchedRef.current = [];
    setCursor(0);
    setMatched([]);
    setFeedback(null);
    setWrong(false);
    setMissMidi(null);
    lockRef.current = false;
  }

  function handleLoaded(loaded: LoadedScore) {
    scoreRef.current = loaded;
    setScore(loaded);
    setScoreError('');
    setScoreLoading(false);
    resetCursor();
    if (!announceRef.current) return;
    announceRef.current = false;
    setSession((current) => (current.recording ? withEvent(current, makeMark(current, `导入 ${loaded.title}`)) : current));
  }

  function handleScoreError(message: string) {
    scoreRef.current = null;
    setScore(null);
    setScoreError(message);
    setScoreLoading(false);
    resetCursor();
  }

  function openSample() {
    announceRef.current = true;
    setScoreError('');
    setScoreSource({ ...SAMPLE_SOURCE, token: Date.now() });
  }

  async function importFile(file: File) {
    announceRef.current = true;
    setScoreError('');
    const name = file.name || '导入的谱';
    if (name.toLowerCase().endsWith('.mxl')) {
      setScoreSource({ token: Date.now(), kind: 'blob', blob: file, name });
      return;
    }
    const text = await file.text();
    setScoreSource({ token: Date.now(), kind: 'text', text, name });
  }

  function restart() {
    setSession((current) => (current.recording ? withEvent(current, makeMark(current, '回到开头')) : current));
    resetCursor();
  }

  function changeNaturals(checked: boolean) {
    setNaturalsOnly(checked);
    naturalsRef.current = checked;
    matchedRef.current = [];
    setMatched([]);
    setSession((current) =>
      current.drill.naturalsOnly === checked ? current : { ...current, drill: { ...current.drill, naturalsOnly: checked } },
    );
  }

  function toggleRecording() {
    setSession((current) => {
      if (current.recording) {
        const marked = withEvent(current, makeMark(current, '暂停记录'));
        return { ...marked, recording: false };
      }
      const resumed = { ...current, recording: true };
      return withEvent(resumed, makeMark(resumed, '继续记录'));
    });
  }

  function clearLog() {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    setSession(createSession(bpm, naturalsOnly));
    setClearArmed(false);
  }

  async function copySummary() {
    const text = summaryText(sessionRef.current);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function downloadJson() {
    const payload = exportPayload(sessionRef.current);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = session.startedAt.replaceAll(':', '-');
    link.href = url;
    link.download = `qinfang-${stamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadArchive() {
    if (!boot.archive) return;
    const blob = new Blob([boot.archive], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'qinfang-previous.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  const moments = score?.moments ?? [];
  const moment = scoreLoading || cursor >= moments.length ? null : moments[cursor]!;
  const done = score !== null && !scoreLoading && cursor >= moments.length;
  const reason = moment ? skipReason(moment, naturalsOnly) : null;
  const asked = moment && !reason ? requiredPitches(moment.pitches, naturalsOnly) : [];
  const dropped = moment ? moment.pitches.filter((pitch) => !asked.includes(pitch)) : [];
  const remaining = asked.filter((pitch) => !matched.includes(pitch));
  const hasBlack = moments.some((item) => item.pitches.some((pitch) => isBlack(pitch)));
  const chord = describeHeld(held.map((note) => note.midi));
  const recent = [...session.events].reverse().slice(0, 8);
  const scoreClass = done ? 'is-done' : wrong ? 'is-wrong' : feedback?.kind === 'correct' ? 'is-correct' : '';
  const toneLabel = piano.status === 'sampled' ? '采样钢琴' : piano.status === 'synth' ? '简易音色' : '音色加载中';
  const named = asked.length > 0 ? asked : (moment?.pitches ?? []);
  const passLabel = reason === 'rest' ? '走过休止' : reason === 'hold' ? '保持，下一音' : reason === 'black' ? '跳过黑键' : '跳过';

  return (
    <div className="page">
      <div className="stage">
      <header className="top">
        <div>
          <p className="eyebrow">练琴</p>
          <h1>琴房</h1>
          <p className="lede">导入一份谱，对着这一页弹。弹对当前这一拍，再进下一拍。</p>
        </div>
        <div className="top-meta">
          <p className="clock">{formatClock(elapsedMs(session, now))}</p>
          <p className={session.recording ? 'pill pill-on' : 'pill'}>{session.recording ? '记录中' : '记录已暂停'}</p>
        </div>
      </header>

      <section className="midi-bar" aria-label="MIDI 键盘">
        <p>{midi.message}</p>
        <div className="row">
          {midi.status !== 'ready' ? (
            <button type="button" className="btn btn-primary" onClick={() => void midi.connect()}>
              连接 MIDI 键盘
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => midi.refresh()}>
              刷新设备
            </button>
          )}
          {midi.inputs.length > 1 ? (
            <label className="select-label">
              设备
              <select value={midi.inputId} onChange={(event) => midi.setInputId(event.target.value)}>
                {midi.inputs.map((input) => (
                  <option key={input.id} value={input.id}>
                    {input.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <span className="tone">{toneLabel}</span>
        </div>
      </section>

      <section className={`card score-card ${scoreClass}`} aria-label="琴谱">
        <div className="card-head">
          <div>
            <p className="kicker">琴谱</p>
            <h2>{score?.title ?? (scoreLoading ? '正在读谱' : '还没有谱')}</h2>
          </div>
          <p className="score-meta">
            {score ? `${score.composer ? `${score.composer} · ` : ''}${moments.length} 拍 · ${score.sourceName}` : 'MusicXML'}
            {naturalsOnly ? ' · 白键' : ''}
          </p>
        </div>
        <p className={scoreError ? 'score-error' : 'muted'}>
          {scoreLoading
            ? '正在读谱…'
            : scoreError || '绿色标出的是谱上现在这一拍。左右手同时写出来的音要按齐。休止和延音不用再按。'}
        </p>
        <ScoreView
          source={scoreSource}
          cursorStep={follow && moment ? moment.step : null}
          onLoaded={handleLoaded}
          onError={handleScoreError}
          onBusy={setScoreLoading}
        />
        <div className="score-status" aria-live="polite">
          <p className="progress">
            {scoreLoading ? '读谱中' : done ? '这一页弹完了' : moment ? stepLabel(moment, cursor, moments.length, naturalsOnly) : '还没有谱'}
            <span>连对 {session.drill.streak}</span>
            <span>最佳 {session.drill.bestStreak}</span>
          </p>
          <p className="feedback">
            {feedback?.kind === 'correct' ? '对了' : null}
            {feedback?.kind === 'wrong' ? wrongText(reason, feedback.played, asked, showName) : null}
            {feedback?.kind === 'done' ? '可以回到开头，或再导入一份。' : null}
            {feedback === null && follow && reason === 'rest' ? '这里是休止符，不用按键。' : null}
            {feedback === null && follow && reason === 'hold' ? '延音线连着，按住就好。' : null}
            {feedback === null && follow && reason === 'black' ? '这里是黑键。只练白键时可以跳过。' : null}
            {feedback === null && follow && reason === 'range' ? '这个音不在 88 键上，跳过即可。' : null}
            {feedback === null && follow && !done && !reason && moment ? '同时响的音要按齐。' : null}
            {feedback === null && !follow ? '跟谱暂停了，键盘可以随便试。' : null}
          </p>
          {showName && named.length > 0 ? (
            <p className="answer">
              <strong>{named.map((pitch) => noteName(pitch)).join(' ')}</strong>
              <span>简谱 {named.map((pitch) => jianpuText(pitch)).join(' ')}</span>
              {dropped.length > 0 && asked.length > 0 ? <span>这一拍先不要求 {dropped.map((pitch) => noteName(pitch)).join(' ')}</span> : null}
            </p>
          ) : null}
        </div>
        <div className="row wrap">
          <label className="btn btn-primary file-btn">
            导入谱子
            <input
              ref={fileRef}
              className="file"
              type="file"
              accept=".xml,.musicxml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importFile(file);
              }}
            />
          </label>
          <button type="button" className="btn" onClick={openSample}>
            示例谱
          </button>
          <button type="button" className={done ? 'btn btn-primary' : 'btn'} onClick={restart} disabled={!score}>
            回到开头
          </button>
          {follow && reason ? (
            <button type="button" className="btn" onClick={passSkip}>
              {passLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="btn"
            disabled={!moment || moment.pitches.length === 0}
            onClick={() => {
              if (!moment) return;
              moment.pitches.forEach((pitch) => piano.noteOn(pitch, 70));
              window.setTimeout(() => moment.pitches.forEach((pitch) => piano.noteOff(pitch)), 700);
            }}
          >
            听一下
          </button>
          <button type="button" className={follow ? 'btn btn-on' : 'btn'} onClick={() => setFollow((value) => !value)}>
            {follow ? '正在跟谱' : '先随便弹'}
          </button>
          <label className="check">
            <input type="checkbox" checked={naturalsOnly} onChange={(event) => changeNaturals(event.target.checked)} />
            只练白键
          </label>
          <label className="check">
            <input type="checkbox" checked={showName} onChange={(event) => setShowName(event.target.checked)} />
            显示音名
          </label>
          <label className="check">
            <input type="checkbox" checked={showKeyHint} onChange={(event) => setShowKeyHint(event.target.checked)} />
            在键盘上标出
          </label>
        </div>
        {hasBlack && naturalsOnly ? <p className="muted">这份谱里有黑键。勾着「只练白键」时，纯黑键的那一拍可以跳过。</p> : null}
      </section>

      <section className="card transport" aria-label="速度和音量">
        <label className="slider">
          <span>速度 {bpm}</span>
          <input
            type="range"
            min={40}
            max={168}
            value={bpm}
            onChange={(event) => {
              const next = Number(event.target.value);
              setBpm(next);
              setSession((current) => (current.bpm === next ? current : { ...current, bpm: next }));
            }}
          />
        </label>
        <button type="button" className={metronomeOn ? 'btn btn-on' : 'btn'} onClick={() => setMetronomeOn((value) => !value)}>
          {metronomeOn ? '节拍器开' : '节拍器'}
        </button>
        <div className="beats" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <i key={index} className={beat === index ? (index === 0 ? 'beat on accent' : 'beat on') : 'beat'} />
          ))}
        </div>
        <label className="slider">
          <span>音量 {Math.round(volume * 100)}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(event) => setVolume(Number(event.target.value) / 100)}
          />
        </label>
      </section>

      <section className="card held" aria-label="正在按的音">
        <div>
          <p className="kicker">正在按</p>
          {held.length === 0 ? (
            <p className="muted">{lastHit ? `刚刚 ${noteName(lastHit.midi)} · MIDI ${lastHit.midi} · 力度 ${lastHit.velocity}` : '还没有按键'}</p>
          ) : (
            <ul className="chips">
              {held.map((note) => (
                <li key={note.midi}>
                  <strong>{noteName(note.midi)}</strong>
                  <span>MIDI {note.midi}</span>
                  <span>力度 {note.velocity}</span>
                  <span>{note.source === 'midi' ? 'MIDI' : '屏幕'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="kicker">和弦</p>
          <p className="chord">{chord}</p>
        </div>
      </section>

      <section className="card log" aria-label="练习记录">
        <div className="card-head">
          <div>
            <p className="kicker">练习记录</p>
            <h2>给老师看的</h2>
          </div>
          <p className="score-meta">
            对 {session.drill.correct} · 错 {session.drill.wrong} · {session.events.length} 条
          </p>
        </div>
        {boot.restored ? <p className="muted">已恢复这台浏览器里上次的记录。</p> : null}
        {recent.length === 0 ? (
          <p className="muted">弹下去就会记在这里。下载 JSON 可以整段交给老师。</p>
        ) : (
          <ol className="event-list">
            {recent.map((event, index) => (
              <li key={`${event.t}-${event.type}-${index}`}>{eventLine(event)}</li>
            ))}
          </ol>
        )}
        <div className="row wrap">
          <button type="button" className="btn btn-primary" onClick={downloadJson}>
            下载 JSON
          </button>
          <button type="button" className="btn" onClick={() => void copySummary()}>
            {copied ? '已复制' : '复制摘要'}
          </button>
          <button type="button" className="btn" onClick={toggleRecording}>
            {session.recording ? '暂停记录' : '继续记录'}
          </button>
          <button type="button" className="btn" onClick={clearLog}>
            {clearArmed ? '确认清空' : '清空记录'}
          </button>
          {boot.archive ? (
            <button type="button" className="btn" onClick={downloadArchive}>
              下载上一段
            </button>
          ) : null}
        </div>
      </section>

      <footer className="credits">
        谱用 OpenSheetMusicDisplay，键盘用 react-piano，音色用 midi-js-soundfonts，MIDI 用 WebMidi.js，和弦用 tonal，节拍用 Tone.js。
      </footer>
      </div>

      <section className="keyboard-case" aria-label="钢琴键盘">
        <div className="keyboard-scroll" ref={keyboardRef}>
          <Piano
            noteRange={{ first: KEYBOARD_FIRST, last: KEYBOARD_LAST }}
            activeNotes={held.map((note) => note.midi)}
            playNote={() => undefined}
            stopNote={() => undefined}
            keyboardShortcuts={shortcuts}
            onPlayNoteInput={(midiNumber) => beginNote(midiNumber, 96, 'screen')}
            onStopNoteInput={(midiNumber) => endNote(midiNumber)}
            renderNoteLabel={({ midiNumber }) => {
              const hinted = showKeyHint && follow && remaining.includes(midiNumber);
              const missed = missMidi === midiNumber;
              const middle = midiNumber === MIDDLE_C;
              if (!hinted && !missed && !middle) return null;
              return (
                <span className="keyface">
                  {middle ? <span className="middle-mark">C</span> : null}
                  {hinted ? <span className="keytick keytick-target">{noteName(midiNumber)}</span> : null}
                  {missed && !hinted ? <span className="keytick keytick-miss">{noteName(midiNumber)}</span> : null}
                </span>
              );
            }}
          />
        </div>
        <p className="legend">88 键，从 A0 到 C8。标着 C 的白键是中央 C。绿色键位是谱上现在要弹的音。电脑键盘从 A 键起也是中央 C。</p>
      </section>
    </div>
  );
}

function stepLabel(moment: ScoreMoment, index: number, total: number, naturalsOnly: boolean): string {
  const reason = skipReason(moment, naturalsOnly);
  const head = reason === 'rest' ? '休止' : reason === 'hold' ? '延音' : reason === 'black' ? '黑键' : reason === 'range' ? '超出键盘' : '音符';
  return `${head} · 第 ${index + 1} / ${total}`;
}

function wrongText(
  reason: ReturnType<typeof skipReason>,
  played: number,
  asked: number[],
  showName: boolean,
): string {
  if (reason === 'rest') return '这里是休止，先别按键';
  if (reason === 'hold') return '这个音还连着，不用再弹';
  if (reason === 'black') return '只练白键时，这一拍先跳过';
  if (reason === 'range') return '这个音不在 88 键上';
  if (!showName) return '不是这个音，再看一次谱';
  return `弹成了 ${noteName(played)}，谱上是 ${asked.map((pitch) => noteName(pitch)).join('、')}`;
}
