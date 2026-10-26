import { Chord, Interval, Note } from 'tonal';

export const MIDDLE_C = 60;
export const DRILL_LOW = 55;
export const DRILL_HIGH = 65;
/** A0, the bottom key of an 88-key piano. */
export const KEYBOARD_FIRST = 21;
/** C8, the top key of an 88-key piano. */
export const KEYBOARD_LAST = 108;

const BLACK = new Set([1, 3, 6, 8, 10]);

const INTERVAL_LABELS: Record<string, string> = {
  '1P': '同度',
  '2m': '小二度',
  '2M': '大二度',
  '3m': '小三度',
  '3M': '大三度',
  '4P': '纯四度',
  '4A': '增四度',
  '5d': '减五度',
  '5P': '纯五度',
  '6m': '小六度',
  '6M': '大六度',
  '7m': '小七度',
  '7M': '大七度',
  '8P': '纯八度',
};

export function isBlack(midi: number): boolean {
  return BLACK.has(((midi % 12) + 12) % 12);
}

function countNaturals(first: number, last: number): number {
  let count = 0;
  for (let midi = first; midi <= last; midi += 1) {
    if (!isBlack(midi)) count += 1;
  }
  return count;
}

export const WHITE_KEY_COUNT = countNaturals(KEYBOARD_FIRST, KEYBOARD_LAST);

export function noteName(midi: number): string {
  return Note.fromMidiSharps(midi);
}

export function jianpuText(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const numeral = ['1', '1', '2', '2', '3', '4', '4', '5', '5', '6', '6', '7'][pc] ?? '?';
  const sharp = isBlack(midi) ? '#' : '';
  const dots = octave - 4;
  const arrow = dots > 0 ? '↑'.repeat(dots) : dots < 0 ? '↓'.repeat(-dots) : '';
  return `${sharp}${numeral}${arrow}`;
}

export function relationToMiddleC(midi: number): string {
  const diff = midi - MIDDLE_C;
  if (diff === 0) return '这就是中央 C';
  const direction = diff > 0 ? '高' : '低';
  return `比中央 C ${direction} ${Math.abs(diff)} 个半音`;
}

export function practicePool(naturalsOnly: boolean): number[] {
  const notes: number[] = [];
  for (let midi = DRILL_LOW; midi <= DRILL_HIGH; midi += 1) {
    if (naturalsOnly && isBlack(midi)) continue;
    notes.push(midi);
  }
  return notes;
}

export function formatChordSymbol(symbol: string): string {
  const head = symbol.split('/')[0] ?? symbol;
  const match = /^([A-G](?:#|b)?)(.*)$/.exec(head);
  if (!match) return symbol;
  const root = match[1] ?? symbol;
  const rest = match[2] ?? '';
  return `${root} ${qualityName(rest)}`;
}

export function describeHeld(midis: number[]): string {
  if (midis.length === 0) return '—';
  const names = [...midis].sort((a, b) => a - b).map((midi) => noteName(midi));
  if (names.length === 1) return '单音';
  if (names.length === 2) {
    const distance = Interval.distance(names[0]!, names[1]!);
    return INTERVAL_LABELS[distance] ?? '音程';
  }
  const found = Chord.detect(names);
  const symbol = found.find((item) => !item.includes('/')) ?? found[0];
  if (!symbol) return '未命名';
  return formatChordSymbol(symbol);
}

function qualityName(rest: string): string {
  const table: Array<[string, string]> = [
    ['maj7', '大七和弦'],
    ['m7b5', '半减七和弦'],
    ['m7', '小七和弦'],
    ['dim7', '减七和弦'],
    ['dim', '减三和弦'],
    ['aug', '增三和弦'],
    ['sus2', '挂二和弦'],
    ['sus4', '挂四和弦'],
    ['add9', '加九和弦'],
    ['maj', '大三和弦'],
    ['m', '小三和弦'],
    ['M', '大三和弦'],
    ['7', '属七和弦'],
    ['6', '六和弦'],
    ['9', '九和弦'],
    ['', '大三和弦'],
  ];
  for (const [prefix, label] of table) {
    if (rest === prefix) return label;
    if (prefix !== '' && rest.startsWith(prefix)) return label;
  }
  return '和弦';
}
