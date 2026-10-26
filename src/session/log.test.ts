import { describe, expect, it } from 'vitest';
import {
  createSession,
  eventLine,
  exportPayload,
  makeDrillEvent,
  makeNoteEvent,
  summaryText,
  withEvent,
} from './log.ts';

describe('session log', () => {
  it('records note names and a Chinese summary', () => {
    const started = Date.parse('2026-10-26T07:00:00.000Z');
    let session = createSession(72, true, started);
    session = withEvent(
      session,
      makeNoteEvent(session, { type: 'note-on', midi: 60, velocity: 80, source: 'midi' }, started + 1500),
    );
    session = withEvent(
      session,
      makeNoteEvent(session, { type: 'note-off', midi: 60, velocity: 0, source: 'midi' }, started + 2000),
    );
    session = {
      ...session,
      drill: { ...session.drill, correct: 1, bestStreak: 1, streak: 1 },
    };
    session = withEvent(
      session,
      makeDrillEvent(
        session,
        { lineId: 'middle', lineTitle: '中央 C 上下', index: 0, target: 60, played: 60, result: 'correct' },
        started + 1500,
      ),
    );

    const summary = summaryText(session, started + 5000);
    expect(summary).toContain('琴房练习摘要');
    expect(summary).toContain('跟谱：对 1');
    expect(summary).toContain('按下：1 次（MIDI 1，屏幕 0）');
    expect(summary).toContain('音域：C4–C4');
    expect(summary).toContain('最近：C4');
    expect(eventLine(session.events[0]!)).toContain('按下');
    expect(eventLine(session.events[0]!)).toContain('MIDI 60');
    expect(eventLine(session.events[0]!)).toContain('力度 80');
    expect(eventLine(session.events[2]!)).toContain('跟谱对了');

    const payload = exportPayload(session, started + 5000);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.session.events).toHaveLength(3);
  });
});
