import { jianpuText, noteName } from '../theory/music.ts';

export type NoteSource = 'midi' | 'screen';

export type NoteEvent = {
  t: number;
  type: 'note-on' | 'note-off';
  midi: number;
  name: string;
  jianpu: string;
  velocity: number;
  source: NoteSource;
};

export type DrillEvent = {
  t: number;
  type: 'drill';
  lineId: string;
  lineTitle: string;
  index: number;
  target: number;
  targetName: string;
  played: number | null;
  playedName: string | null;
  result: 'correct' | 'wrong' | 'skip';
};

export type MarkEvent = {
  t: number;
  type: 'mark';
  label: string;
};

export type SessionEvent = NoteEvent | DrillEvent | MarkEvent;

export type DrillStats = {
  range: [number, number];
  naturalsOnly: boolean;
  correct: number;
  wrong: number;
  skips: number;
  streak: number;
  bestStreak: number;
};

export type Session = {
  id: string;
  startedAt: string;
  bpm: number;
  recording: boolean;
  events: SessionEvent[];
  drill: DrillStats;
};

const EVENT_CAP = 2000;

export function createSession(bpm: number, naturalsOnly: boolean, now = Date.now()): Session {
  return {
    id: crypto.randomUUID(),
    startedAt: new Date(now).toISOString(),
    bpm,
    recording: true,
    events: [],
    drill: {
      range: [55, 65],
      naturalsOnly,
      correct: 0,
      wrong: 0,
      skips: 0,
      streak: 0,
      bestStreak: 0,
    },
  };
}

export function elapsedMs(session: Session, now = Date.now()): number {
  const started = Date.parse(session.startedAt);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, now - started);
}

export function withEvent(session: Session, event: SessionEvent): Session {
  const events = [...session.events, event];
  return {
    ...session,
    events: events.length > EVENT_CAP ? events.slice(events.length - EVENT_CAP) : events,
  };
}

export function makeNoteEvent(
  session: Session,
  input: { type: 'note-on' | 'note-off'; midi: number; velocity: number; source: NoteSource },
  now = Date.now(),
): NoteEvent {
  return {
    t: elapsedMs(session, now),
    type: input.type,
    midi: input.midi,
    name: noteName(input.midi),
    jianpu: jianpuText(input.midi),
    velocity: input.velocity,
    source: input.source,
  };
}

export function makeDrillEvent(
  session: Session,
  input: {
    lineId: string;
    lineTitle: string;
    index: number;
    target: number;
    played: number | null;
    result: DrillEvent['result'];
  },
  now = Date.now(),
): DrillEvent {
  return {
    t: elapsedMs(session, now),
    type: 'drill',
    lineId: input.lineId,
    lineTitle: input.lineTitle,
    index: input.index,
    target: input.target,
    targetName: noteName(input.target),
    played: input.played,
    playedName: input.played === null ? null : noteName(input.played),
    result: input.result,
  };
}

export function makeMark(session: Session, label: string, now = Date.now()): MarkEvent {
  return { t: elapsedMs(session, now), type: 'mark', label };
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  if (hours > 0) return `${String(hours).padStart(2, '0')}:${clock}`;
  return clock;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}小时${minutes}分${seconds}秒`;
  if (minutes > 0) return `${minutes}分${seconds}秒`;
  return `${seconds}秒`;
}

export function formatEventTime(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const centi = Math.floor((total % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centi).padStart(2, '0')}`;
}

export function sourceLabel(source: NoteSource): string {
  return source === 'midi' ? 'MIDI' : '屏幕';
}

export function eventLine(event: SessionEvent): string {
  const time = formatEventTime(event.t);
  if (event.type === 'note-on') {
    return `${time}  按下  ${event.name}  ${event.jianpu}  MIDI ${event.midi}  力度 ${event.velocity}  ${sourceLabel(event.source)}`;
  }
  if (event.type === 'note-off') {
    return `${time}  松开  ${event.name}  MIDI ${event.midi}`;
  }
  if (event.type === 'drill') {
    if (event.result === 'correct') {
      return `${time}  跟谱对了  ${event.targetName}（${event.lineTitle} 第 ${event.index + 1} 音）`;
    }
    if (event.result === 'skip') return `${time}  跳过  ${event.targetName}`;
    return `${time}  跟谱弹错  弹了 ${event.playedName ?? '—'}，谱上是 ${event.targetName}`;
  }
  if (event.type === 'mark') return `${time}  ${event.label}`;
  return time;
}

export function summaryText(session: Session, now = Date.now()): string {
  const noteOns = session.events.filter((event): event is NoteEvent => event.type === 'note-on');
  const midiCount = noteOns.filter((event) => event.source === 'midi').length;
  const screenCount = noteOns.length - midiCount;
  const pitches = noteOns.map((event) => event.midi);
  const low = pitches.length ? Math.min(...pitches) : null;
  const high = pitches.length ? Math.max(...pitches) : null;
  const inRange = noteOns.filter((event) => event.midi >= 55 && event.midi <= 65).length;
  const rangeRatio = noteOns.length ? Math.round((inRange / noteOns.length) * 100) : 0;
  const counts = new Map<string, number>();
  for (const event of noteOns) counts.set(event.name, (counts.get(event.name) ?? 0) + 1);
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([name, count]) => `${name}×${count}`)
    .join('、');
  const recent = noteOns
    .slice(-8)
    .map((event) => event.name)
    .join(' ');
  const started = new Date(session.startedAt);
  const startedLabel = Number.isNaN(started.getTime())
    ? session.startedAt
    : started.toLocaleString('zh-CN', { hour12: false });

  return [
    '琴房练习摘要',
    `开始：${startedLabel}`,
    `时长：${formatDuration(elapsedMs(session, now))}`,
    `速度：${session.bpm}`,
    `记录：${session.recording ? '进行中' : '已暂停'}`,
    `跟谱：对 ${session.drill.correct}，错 ${session.drill.wrong}，跳过 ${session.drill.skips}，最佳连对 ${session.drill.bestStreak}`,
    `按下：${noteOns.length} 次（MIDI ${midiCount}，屏幕 ${screenCount}）`,
    low === null || high === null ? '音域：还没有音符' : `音域：${noteName(low)}–${noteName(high)}`,
    `落在 G3–F4：${rangeRatio}%`,
    top ? `出现最多：${top}` : '出现最多：—',
    recent ? `最近：${recent}` : '最近：—',
    '完整事件在 JSON 里。t 是从开始时间起的毫秒。中央 C 是 C4，MIDI 60。',
  ].join('\n');
}

export function exportPayload(session: Session, now = Date.now()) {
  return {
    app: 'qinfang',
    schemaVersion: 1,
    exportedAt: new Date(now).toISOString(),
    note: '对着五线谱练习的记录。中央 C 是 C4 / MIDI 60。t 为距 startedAt 的毫秒。屏幕音符没有力度传感器，力度记为 96。',
    session,
  };
}
