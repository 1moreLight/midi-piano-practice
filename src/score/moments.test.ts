import { describe, expect, it } from 'vitest';
import {
  collectMoments,
  midiFromOsmdHalfTone,
  momentFromNotes,
  requiredPitches,
  skipReason,
  type ReadNote,
} from './moments.ts';

function play(midi: number, extra: Partial<ReadNote> = {}): ReadNote {
  return { rest: false, midi, grace: false, tieContinuation: false, visible: true, ...extra };
}

const rest: ReadNote = { rest: true, midi: null, grace: false, tieContinuation: false, visible: true };

describe('midiFromOsmdHalfTone', () => {
  it('maps OpenSheetMusicDisplay half tones onto MIDI', () => {
    expect(midiFromOsmdHalfTone(48)).toBe(60);
    expect(midiFromOsmdHalfTone(57)).toBe(69);
    expect(midiFromOsmdHalfTone(9)).toBe(21);
    expect(midiFromOsmdHalfTone(96)).toBe(108);
    expect(midiFromOsmdHalfTone(54)).toBe(66);
  });
});

describe('momentFromNotes', () => {
  it('reads the pitches sounding together', () => {
    expect(momentFromNotes([play(60), play(64), play(67), play(48)])).toEqual({
      pitches: [48, 60, 64, 67],
      kind: 'play',
    });
  });

  it('treats a rest as a rest and ignores a rest beside an attack', () => {
    expect(momentFromNotes([rest])).toEqual({ pitches: [], kind: 'rest' });
    expect(momentFromNotes([rest, play(62)])).toEqual({ pitches: [62], kind: 'play' });
  });

  it('drops a grace note when the main note is in the same slice', () => {
    expect(momentFromNotes([play(61, { grace: true }), play(60)])).toEqual({ pitches: [60], kind: 'play' });
    expect(momentFromNotes([play(62, { grace: true })])).toEqual({ pitches: [62], kind: 'play' });
  });

  it('does not ask to restrike a tie', () => {
    expect(momentFromNotes([play(60, { tieContinuation: true })])).toEqual({ pitches: [], kind: 'hold' });
    expect(momentFromNotes([play(60, { tieContinuation: true }), play(64)])).toEqual({ pitches: [64], kind: 'play' });
  });

  it('skips notes that are not printed', () => {
    expect(momentFromNotes([play(60, { visible: false })])).toBeNull();
  });

  it('keeps the cursor step of each sounding moment', () => {
    const moments = collectMoments([[play(60)], [play(60, { tieContinuation: true })], []]);
    expect(moments.map((moment) => moment.step)).toEqual([0, 1]);
    expect(moments[1]?.kind).toBe('hold');
  });
});

describe('skipReason', () => {
  it('lets a white-key setting pass over a black key', () => {
    const black = { pitches: [66], kind: 'play' as const, step: 3 };
    expect(requiredPitches(black.pitches, true)).toEqual([]);
    expect(skipReason(black, true)).toBe('black');
    expect(skipReason(black, false)).toBeNull();
    expect(skipReason({ pitches: [60, 66], kind: 'play', step: 0 }, true)).toBeNull();
    expect(requiredPitches([60, 66], true)).toEqual([60]);
  });

  it('skips a pitch the 88-key keyboard does not have', () => {
    expect(skipReason({ pitches: [12], kind: 'play', step: 0 }, false)).toBe('range');
    expect(requiredPitches([60, 120], false)).toEqual([60]);
  });
});
