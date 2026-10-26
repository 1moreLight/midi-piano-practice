import { isBlack, KEYBOARD_FIRST, KEYBOARD_LAST } from '../theory/music.ts';

/** One note as read from an imported score, already translated to MIDI. */
export type ReadNote = {
  rest: boolean;
  midi: number | null;
  grace: boolean;
  tieContinuation: boolean;
  visible: boolean;
};

export type MomentKind = 'play' | 'rest' | 'hold';

export type ScoreMoment = {
  pitches: number[];
  kind: MomentKind;
  /** How many cursor steps from the start of the score land on this moment. */
  step: number;
};

export type LoadedScore = {
  title: string;
  composer: string;
  sourceName: string;
  moments: ScoreMoment[];
};

/**
 * OSMD's halfTone is twelve below MIDI.
 * Middle C is 48 there and 60 on the keyboard. A4 is 57 there and 69 here.
 */
export function midiFromOsmdHalfTone(halfTone: number): number {
  return Math.round(halfTone) + 12;
}

export function momentFromNotes(notes: ReadNote[]): { pitches: number[]; kind: MomentKind } | null {
  const visible = notes.filter((note) => note.visible);
  if (visible.length === 0) return null;
  const sounding = visible.filter((note) => !note.rest && note.midi !== null);
  const principal = sounding.some((note) => !note.grace) ? sounding.filter((note) => !note.grace) : sounding;
  const attacks = principal.filter((note) => !note.tieContinuation);
  const pitches = [...new Set(attacks.map((note) => note.midi).filter((midi): midi is number => midi !== null))].sort(
    (left, right) => left - right,
  );
  if (pitches.length > 0) return { pitches, kind: 'play' };
  if (principal.length > 0) return { pitches: [], kind: 'hold' };
  if (visible.some((note) => note.rest)) return { pitches: [], kind: 'rest' };
  return null;
}

export function collectMoments(slices: ReadNote[][]): ScoreMoment[] {
  const moments: ScoreMoment[] = [];
  slices.forEach((notes, step) => {
    const built = momentFromNotes(notes);
    if (built) moments.push({ ...built, step });
  });
  return moments;
}

/** Pitches the student is asked to play on this keyboard. */
export function requiredPitches(pitches: number[], naturalsOnly: boolean): number[] {
  return pitches.filter(
    (midi) => midi >= KEYBOARD_FIRST && midi <= KEYBOARD_LAST && (!naturalsOnly || !isBlack(midi)),
  );
}

export function skipReason(moment: ScoreMoment, naturalsOnly: boolean): 'rest' | 'hold' | 'black' | 'range' | null {
  if (moment.kind === 'rest') return 'rest';
  if (moment.kind === 'hold') return 'hold';
  const asked = requiredPitches(moment.pitches, naturalsOnly);
  if (asked.length > 0) return null;
  const playable = requiredPitches(moment.pitches, false);
  if (playable.length === 0 && moment.pitches.length > 0) return 'range';
  if (moment.pitches.length > 0) return 'black';
  return 'rest';
}
