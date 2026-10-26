import { createSession, type Session } from './log.ts';

export type DurationName = 'w' | 'h' | 'q';

const SETTINGS_KEY = 'qinfang-settings';
const SESSION_KEY = 'qinfang-session';
const ARCHIVE_KEY = 'qinfang-session-archive';
const SIX_HOURS = 6 * 60 * 60 * 1000;

export type Settings = {
  bpm: number;
  volume: number;
  metronome: boolean;
  naturalsOnly: boolean;
  showName: boolean;
  showKeyHint: boolean;
  follow: boolean;
  duration: DurationName;
};

export const defaultSettings: Settings = {
  bpm: 72,
  volume: 0.8,
  metronome: false,
  naturalsOnly: true,
  showName: true,
  showKeyHint: true,
  follow: true,
  duration: 'h',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const duration = parsed.duration === 'w' || parsed.duration === 'h' || parsed.duration === 'q' ? parsed.duration : 'h';
    return {
      ...defaultSettings,
      ...parsed,
      duration,
      bpm: clamp(typeof parsed.bpm === 'number' ? parsed.bpm : defaultSettings.bpm, 40, 168),
      volume: clamp(typeof parsed.volume === 'number' ? parsed.volume : defaultSettings.volume, 0, 1),
    };
  } catch {
    return defaultSettings;
  }
}

export function loadPractice(bpm: number, naturalsOnly: boolean): { session: Session; restored: boolean; archive: string | null } {
  const existingArchive = localStorage.getItem(ARCHIVE_KEY);
  const raw = localStorage.getItem(SESSION_KEY);
  const saved = parseSession(raw, bpm, naturalsOnly);
  if (!saved) return { session: createSession(bpm, naturalsOnly), restored: false, archive: existingArchive };
  const last = saved.events.at(-1);
  const lastWall = Date.parse(saved.startedAt) + (last?.t ?? 0);
  if (saved.events.length > 0 && Number.isFinite(lastWall) && Date.now() - lastWall > SIX_HOURS) {
    if (raw) localStorage.setItem(ARCHIVE_KEY, raw);
    return { session: createSession(bpm, naturalsOnly), restored: false, archive: raw };
  }
  return { session: saved, restored: saved.events.length > 0, archive: existingArchive };
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function parseSession(raw: string | null, bpm: number, naturalsOnly: boolean): Session | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed || typeof parsed.startedAt !== 'string' || !Array.isArray(parsed.events)) return null;
    const fresh = createSession(bpm, naturalsOnly);
    const events = parsed.events.filter((event) => {
      if (!event || typeof event !== 'object') return false;
      return typeof event.t === 'number' && typeof event.type === 'string';
    });
    return {
      ...fresh,
      id: typeof parsed.id === 'string' ? parsed.id : fresh.id,
      startedAt: parsed.startedAt,
      bpm: typeof parsed.bpm === 'number' ? parsed.bpm : bpm,
      recording: parsed.recording !== false,
      events,
      drill: { ...fresh.drill, ...parsed.drill, range: [55, 65] },
    };
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
