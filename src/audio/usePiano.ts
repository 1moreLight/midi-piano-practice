import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { noteName } from '../theory/music.ts';

type Voice = { stop: (when?: number) => void };

type SamplePlayer = {
  play: (
    note: string,
    when?: number,
    options?: { gain?: number; duration?: number },
  ) => Voice | undefined;
};

export type PianoStatus = 'loading' | 'sampled' | 'synth';

export type PianoEngine = {
  status: PianoStatus;
  resume: () => void;
  noteOn: (midi: number, velocity: number) => void;
  noteOff: (midi: number) => void;
  preview: (midi: number) => void;
};

export function usePiano(volume: number): PianoEngine {
  const [status, setStatus] = useState<PianoStatus>('loading');
  const engineRef = useRef<InternalEngine | null>(null);
  const volumeRef = useRef(volume);

  useEffect(() => {
    const { context, master, sampled: loading } = sharedPiano(volumeRef.current);
    const voices = new Map<number, Voice>();
    let previewVoice: Voice | null = null;
    let sampled: SamplePlayer | null = null;
    let dead = false;

    const engine: InternalEngine = {
      resume() {
        void context.resume();
      },
      setVolume(next: number) {
        master.gain.setTargetAtTime(Math.max(0, Math.min(1, next)), context.currentTime, 0.02);
      },
      noteOn(midi: number, velocity: number) {
        void context.resume();
        voices.get(midi)?.stop(context.currentTime);
        const gain = Math.max(0.04, Math.min(1, velocity / 127));
        const sampledVoice = sampled ? playSample(sampled, context, midi, gain) : undefined;
        if (sampledVoice) {
          voices.set(midi, sampledVoice);
          return;
        }
        voices.set(midi, startSynth(context, master, midi, gain));
      },
      noteOff(midi: number) {
        voices.get(midi)?.stop(context.currentTime);
        voices.delete(midi);
      },
      preview(midi: number) {
        void context.resume();
        previewVoice?.stop(context.currentTime);
        const voice = sampled ? playSample(sampled, context, midi, 0.75) : startSynth(context, master, midi, 0.75);
        if (!voice) return;
        previewVoice = voice;
        window.setTimeout(() => {
          if (previewVoice === voice) {
            voice.stop(context.currentTime);
            previewVoice = null;
          }
        }, 700);
      },
    };
    engineRef.current = engine;

    void loading.then((player) => {
      if (dead) return;
      sampled = player;
      setStatus(player ? 'sampled' : 'synth');
    });

    return () => {
      dead = true;
      voices.forEach((voice) => voice.stop());
      previewVoice?.stop();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setVolume(volume);
  }, [volume]);

  const resume = useCallback(() => engineRef.current?.resume(), []);
  const noteOn = useCallback((midi: number, velocity: number) => engineRef.current?.noteOn(midi, velocity), []);
  const noteOff = useCallback((midi: number) => engineRef.current?.noteOff(midi), []);
  const preview = useCallback((midi: number) => engineRef.current?.preview(midi), []);

  return useMemo(
    () => ({ status, resume, noteOn, noteOff, preview }),
    [status, resume, noteOn, noteOff, preview],
  );
}

let shared: { context: AudioContext; master: GainNode; sampled: Promise<SamplePlayer | null> } | null = null;

function sharedPiano(volume: number) {
  if (shared && shared.context.state !== 'closed') return shared;
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = volume;
  master.connect(context.destination);
  const notes: string[] = [];
  for (let midi = 21; midi <= 108; midi += 1) notes.push(noteName(midi));
  const sampled = import('soundfont-player')
    .then((mod) => {
      const api = mod as unknown as {
        default: {
          instrument: (ac: AudioContext, name: string, options?: Record<string, unknown>) => Promise<SamplePlayer>;
        };
      };
      return api.default.instrument(context, 'acoustic_grand_piano', {
        soundfont: 'MusyngKite',
        format: 'mp3',
        destination: master,
        notes,
        attack: 0.008,
        decay: 0.2,
        sustain: 0.85,
        release: 0.4,
      });
    })
    .catch(() => null);
  shared = { context, master, sampled };
  return shared;
}

type InternalEngine = {
  resume: () => void;
  setVolume: (volume: number) => void;
  noteOn: (midi: number, velocity: number) => void;
  noteOff: (midi: number) => void;
  preview: (midi: number) => void;
};

function playSample(player: SamplePlayer, context: AudioContext, midi: number, gain: number): Voice | undefined {
  try {
    return player.play(noteName(midi), context.currentTime, { gain });
  } catch {
    return undefined;
  }
}

function startSynth(context: AudioContext, destination: AudioNode, midi: number, gain: number): Voice {
  const fundamental = context.createOscillator();
  const overtone = context.createOscillator();
  const amp = context.createGain();
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  fundamental.type = 'triangle';
  fundamental.frequency.value = frequency;
  overtone.type = 'sine';
  overtone.frequency.value = frequency * 2;
  const peak = gain * 0.22;
  const now = context.currentTime;
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
  fundamental.connect(amp);
  overtone.connect(amp);
  amp.connect(destination);
  fundamental.start(now);
  overtone.start(now);
  fundamental.stop(now + 2);
  overtone.stop(now + 2);
  return {
    stop(when = context.currentTime) {
      amp.gain.cancelScheduledValues(when);
      amp.gain.setValueAtTime(Math.max(amp.gain.value, 0.0001), when);
      amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
      fundamental.stop(when + 0.2);
      overtone.stop(when + 0.2);
    },
  };
}
