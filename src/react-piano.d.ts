declare module 'react-piano' {
  import type { ComponentType, ReactNode } from 'react';

  export type KeyboardShortcut = {
    key: string;
    midiNumber: number;
  };

  export type NoteLabelProps = {
    keyboardShortcut?: string | null;
    midiNumber: number;
    isActive: boolean;
    isAccidental: boolean;
  };

  export const Piano: ComponentType<{
    noteRange: { first: number; last: number };
    activeNotes?: number[];
    playNote: (midiNumber: number) => void;
    stopNote: (midiNumber: number) => void;
    onPlayNoteInput?: (midiNumber: number) => void;
    onStopNoteInput?: (midiNumber: number) => void;
    renderNoteLabel?: (props: NoteLabelProps) => ReactNode;
    className?: string;
    disabled?: boolean;
    width?: number;
    keyWidthToHeight?: number;
    keyboardShortcuts?: KeyboardShortcut[];
  }>;

  export const KeyboardShortcuts: {
    create: (options: {
      firstNote: number;
      lastNote: number;
      keyboardConfig: Array<{ natural: string; flat: string; sharp: string }>;
    }) => KeyboardShortcut[];
    HOME_ROW: Array<{ natural: string; flat: string; sharp: string }>;
  };

  export const MidiNumbers: {
    fromNote: (note: string) => number;
  };
}
