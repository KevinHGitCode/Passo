/**
 * Lo mínimo que usamos de la Web MIDI API. Así el adaptador se prueba con un falso
 * y no depende de los tipos de DOM ni de que el navegador la tenga.
 */
export interface MidiMessageEventLike {
  readonly data: Uint8Array | null;
  /** Mismo origen de tiempo que `performance.now()`. */
  readonly timeStamp: number;
}

export interface MidiPortLike {
  readonly id: string;
  readonly name?: string | null;
  readonly type: string;
  readonly state: string;
  addEventListener(type: 'midimessage', listener: (event: MidiMessageEventLike) => void): void;
  removeEventListener(type: 'midimessage', listener: (event: MidiMessageEventLike) => void): void;
}

export interface MidiConnectionEventLike {
  readonly port: MidiPortLike | null;
}

export interface MidiAccessLike {
  readonly inputs: { values(): Iterable<MidiPortLike> };
  addEventListener(type: 'statechange', listener: (event: MidiConnectionEventLike) => void): void;
  removeEventListener(
    type: 'statechange',
    listener: (event: MidiConnectionEventLike) => void,
  ): void;
}

export type RequestMidiAccess = () => Promise<MidiAccessLike>;
