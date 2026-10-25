import type { InputSource } from '../domain/note-event';
import type { NoteInput, Unsubscribe } from '../ports/note-input';

/** Qué entrada está elegida y cuáles existen. Cambia de identidad solo cuando cambia la elección. */
export interface InputManagerSnapshot {
  readonly selected: InputSource;
  readonly available: readonly InputSource[];
}

/**
 * Entradas intercambiables y **exclusivas**: solo una escucha a la vez. Al elegir otra se apaga la
 * anterior (el micrófono suelta el dispositivo y su luz) y se enciende la nueva. El micrófono nunca
 * se enciende solo: necesita un gesto de la persona (`activate()` desde un botón).
 */
export class InputManager {
  private readonly inputs: readonly NoteInput[];
  private snapshot: InputManagerSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(inputs: readonly NoteInput[], initial: InputSource) {
    this.inputs = inputs;
    const available = inputs.map((input) => input.source);
    const selected = available.includes(initial) ? initial : (available[0] ?? initial);
    this.snapshot = { selected, available };
  }

  getSnapshot = (): InputManagerSnapshot => this.snapshot;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** La entrada elegida, o `undefined` si no hay ninguna. */
  getSelected(): NoteInput | undefined {
    return this.find(this.snapshot.selected);
  }

  /** Elige una entrada: apaga las demás y enciende esta (salvo el micrófono). Una fuente desconocida no hace nada. */
  select(source: InputSource): void {
    const chosen = this.find(source);
    if (!chosen) return;
    for (const input of this.inputs) if (input !== chosen) input.stop();
    if (this.snapshot.selected !== source) {
      this.snapshot = { ...this.snapshot, selected: source };
      this.listeners.forEach((listener) => listener());
    }
    // Los adaptadores informan por su estado y no rechazan; si alguno lo hiciera, no debe romper la elección.
    if (source !== 'microfono' && !isRunning(chosen)) void chosen.start().catch(() => undefined);
  }

  /** Enciende la entrada elegida (el micrófono solo desde un gesto: un botón). */
  activate(): Promise<void> {
    return this.getSelected()?.start() ?? Promise.resolve();
  }

  /** Apaga todas las entradas (al cerrar la página). */
  stopAll(): void {
    this.inputs.forEach((input) => input.stop());
  }

  private find(source: InputSource): NoteInput | undefined {
    return this.inputs.find((input) => input.source === source);
  }
}

function isRunning(input: NoteInput): boolean {
  const { kind } = input.getStatus();
  return kind === 'conectado' || kind === 'iniciando';
}
