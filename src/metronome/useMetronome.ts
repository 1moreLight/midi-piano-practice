import { useEffect, useRef, useState } from 'react';
import { Draw, Loop, Synth, Transport, start } from 'tone';

export function useMetronome(bpm: number, enabled: boolean, volume: number): number {
  const [beat, setBeat] = useState(-1);
  const volumeRef = useRef(volume);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    Transport.bpm.value = bpm;
  }, [bpm]);

  useEffect(() => {
    if (!enabled) return;

    let count = 0;
    const synth = new Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
    }).toDestination();
    synth.volume.value = toDb(volumeRef.current);

    const loop = new Loop((time) => {
      synth.volume.value = toDb(volumeRef.current);
      const accent = count % 4 === 0;
      synth.triggerAttackRelease(accent ? 'E6' : 'A5', '32n', time, accent ? 0.85 : 0.35);
      const shown = count % 4;
      Draw.schedule(() => setBeat(shown), time);
      count += 1;
    }, '4n');

    let stopped = false;
    void start()
      .then(() => {
        if (stopped) return;
        loop.start(0);
        Transport.start();
      })
      .catch(() => {
        setBeat(-1);
      });

    return () => {
      stopped = true;
      loop.dispose();
      synth.dispose();
      try {
        Transport.stop();
        Transport.seconds = 0;
      } catch {
        // The transport may not have started.
      }
      setBeat(-1);
    };
  }, [enabled]);

  return enabled ? beat : -1;
}

function toDb(volume: number): number {
  if (volume <= 0.001) return -48;
  return Math.max(-48, 20 * Math.log10(volume) - 10);
}
