import { describe, expect, it } from 'vitest';
import { describeHeld, formatChordSymbol, jianpuText, KEYBOARD_FIRST, KEYBOARD_LAST, noteName, practicePool, relationToMiddleC, WHITE_KEY_COUNT } from './music.ts';

describe('note names', () => {
  it('covers a full 88-key piano from A0 to C8', () => {
    expect(KEYBOARD_FIRST).toBe(21);
    expect(KEYBOARD_LAST).toBe(108);
    expect(KEYBOARD_LAST - KEYBOARD_FIRST + 1).toBe(88);
    expect(noteName(KEYBOARD_FIRST)).toBe('A0');
    expect(noteName(KEYBOARD_LAST)).toBe('C8');
    expect(WHITE_KEY_COUNT).toBe(52);
  });

  it('treats MIDI 60 as middle C', () => {
    expect(noteName(60)).toBe('C4');
    expect(jianpuText(60)).toBe('1');
    expect(relationToMiddleC(60)).toBe('这就是中央 C');
  });

  it('writes jianpu dots as octave arrows', () => {
    expect(jianpuText(48)).toBe('1↓');
    expect(jianpuText(55)).toBe('5↓');
    expect(jianpuText(61)).toBe('#1');
    expect(jianpuText(72)).toBe('1↑');
    expect(jianpuText(65)).toBe('4');
  });
});

describe('practice pool', () => {
  it('starts on white keys from G3 to F4', () => {
    expect(practicePool(true)).toEqual([55, 57, 59, 60, 62, 64, 65]);
  });

  it('includes the black keys in that range when asked', () => {
    expect(practicePool(false)).toContain(56);
    expect(practicePool(false)).toContain(61);
    expect(practicePool(false)).not.toContain(66);
  });
});

describe('chords', () => {
  it('names common triads in Chinese', () => {
    expect(formatChordSymbol('CM')).toBe('C 大三和弦');
    expect(formatChordSymbol('Cmaj7')).toBe('C 大七和弦');
    expect(formatChordSymbol('Dm')).toBe('D 小三和弦');
    expect(formatChordSymbol('F#dim')).toBe('F# 减三和弦');
    expect(describeHeld([60, 64, 67])).toBe('C 大三和弦');
    expect(describeHeld([60, 63, 67])).toBe('C 小三和弦');
    expect(describeHeld([60])).toBe('单音');
    expect(describeHeld([60, 64])).toBe('大三度');
    expect(describeHeld([])).toBe('—');
  });
});
