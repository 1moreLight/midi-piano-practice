import { useEffect, useRef, useState } from 'react';
import { WebMidi } from 'webmidi';
import type { NoteMessageEvent } from 'webmidi';

export type MidiPort = { id: string; name: string };
export type MidiStatus = 'idle' | 'ready' | 'unsupported' | 'denied';

export function useWebMidi(
  onNoteOn: (midi: number, velocity: number) => void,
  onNoteOff: (midi: number) => void,
) {
  const onNoteOnRef = useRef(onNoteOn);
  const onNoteOffRef = useRef(onNoteOff);

  useEffect(() => {
    onNoteOnRef.current = onNoteOn;
    onNoteOffRef.current = onNoteOff;
  }, [onNoteOn, onNoteOff]);

  const [status, setStatus] = useState<MidiStatus>('idle');
  const [inputs, setInputs] = useState<MidiPort[]>([]);
  const [inputId, setInputId] = useState('');
  const [message, setMessage] = useState('还没连接。用 Chrome 或 Edge，点下面的按钮允许 MIDI。');

  function refresh() {
    if (!WebMidi.enabled) return;
    const list = WebMidi.inputs.map((input) => ({
      id: input.id,
      name: input.name || 'MIDI 键盘',
    }));
    setInputs(list);
    setInputId((current) => (current && list.some((item) => item.id === current) ? current : (list[0]?.id ?? '')));
    if (list.length === 0) setMessage('已经允许 MIDI，但没看到键盘。插上以后点「刷新设备」。');
  }

  async function connect() {
    if (!('requestMIDIAccess' in navigator)) {
      setStatus('unsupported');
      setMessage('这个浏览器没有 Web MIDI。请换 Chrome 或 Edge。');
      return;
    }
    try {
      await WebMidi.enable();
      setStatus('ready');
      refresh();
    } catch {
      setStatus('denied');
      setMessage('没有拿到 MIDI 权限。可以在地址栏旁边重新允许。');
    }
  }

  useEffect(() => {
    if (status !== 'ready') return;
    const onChange = () => refresh();
    WebMidi.addListener('connected', onChange);
    WebMidi.addListener('disconnected', onChange);
    return () => {
      WebMidi.removeListener('connected', onChange);
      WebMidi.removeListener('disconnected', onChange);
    };
  }, [status]);

  useEffect(() => {
    if (status !== 'ready' || !WebMidi.enabled || !inputId) return;
    const input = WebMidi.getInputById(inputId);
    if (!input) return;
    const handleOn = (event: NoteMessageEvent) => {
      if (event.note.rawAttack <= 0) onNoteOffRef.current(event.note.number);
      else onNoteOnRef.current(event.note.number, event.note.rawAttack);
    };
    const handleOff = (event: NoteMessageEvent) => {
      onNoteOffRef.current(event.note.number);
    };
    input.addListener('noteon', handleOn);
    input.addListener('noteoff', handleOff);
    return () => {
      input.removeListener('noteon', handleOn);
      input.removeListener('noteoff', handleOff);
    };
  }, [inputId, status]);

  const selected = inputs.find((item) => item.id === inputId);
  const statusText =
    status === 'ready'
      ? selected
        ? `正在听 ${selected.name}`
        : '已经允许 MIDI，但没看到键盘。插上以后点「刷新设备」。'
      : message;

  return { status, inputs, inputId, setInputId, connect, refresh, message: statusText };
}
