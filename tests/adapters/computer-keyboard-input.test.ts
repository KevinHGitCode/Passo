import { ComputerKeyboardInput } from '@/adapters/keyboard/computer-keyboard-input';
import type { KeyEventLike, KeyEventTarget } from '@/adapters/keyboard/computer-keyboard-input';
import { KEYBOARD_NOTE_MAP } from '@/adapters/keyboard/keyboard-map';
import { noteName } from '@/core/domain/note';
import type { NoteEvent } from '@/core/domain/note-event';

class FakeKeyTarget implements KeyEventTarget {
  private readonly listeners = new Map<string, Set<(event: never) => void>>();

  addEventListener(type: string, listener: (event: never) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: never) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  count(): number {
    let total = 0;
    this.listeners.forEach((set) => (total += set.size));
    return total;
  }

  key(type: 'keydown' | 'keyup', code: string, init: Partial<KeyEventLike> = {}): void {
    const event: KeyEventLike = {
      code,
      repeat: false,
      timeStamp: 0,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      ...init,
    };
    this.listeners.get(type)?.forEach((listener) => listener(event as never));
  }

  blur(timeStamp: number): void {
    this.listeners.get('blur')?.forEach((listener) => listener({ timeStamp } as never));
  }
}

async function setup() {
  const target = new FakeKeyTarget();
  const input = new ComputerKeyboardInput(target);
  const events: NoteEvent[] = [];
  input.subscribe((event) => events.push(event));
  await input.start();
  return { target, input, events };
}

describe('mapa del teclado del PC', () => {
  it('la tecla A es Do4 y las blancas siguen la escala de Do mayor', () => {
    expect(noteName(KEYBOARD_NOTE_MAP['KeyA'] as number, 'americana')).toBe('C4');
    const blancas = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK'];
    const nombres = blancas.map((code) => noteName(KEYBOARD_NOTE_MAP[code] as number, 'americana'));
    expect(nombres).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']);
  });

  it('no repite números MIDI', () => {
    const values = Object.values(KEYBOARD_NOTE_MAP);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('ComputerKeyboardInput', () => {
  it('emite on/off con el timestamp del evento y la fuente correcta', async () => {
    const { target, events } = await setup();
    target.key('keydown', 'KeyA', { timeStamp: 120.5 });
    target.key('keyup', 'KeyA', { timeStamp: 300 });
    expect(events).toEqual([
      { type: 'on', note: 60, velocity: 96, at: 120.5, source: 'teclado-pc' },
      { type: 'off', note: 60, velocity: 0, at: 300, source: 'teclado-pc' },
    ]);
  });

  it('ignora repeticiones del sistema, teclas fuera del mapa y combinaciones con modificadores', async () => {
    const { target, events } = await setup();
    target.key('keydown', 'KeyA', { repeat: true });
    target.key('keydown', 'KeyZ');
    target.key('keydown', 'KeyS', { ctrlKey: true });
    target.key('keydown', 'KeyD', { altKey: true });
    target.key('keydown', 'KeyF', { metaKey: true });
    expect(events).toEqual([]);
  });

  it('no emite dos on seguidos de la misma tecla ni un off sin on', async () => {
    const { target, events } = await setup();
    target.key('keyup', 'KeyA');
    target.key('keydown', 'KeyA');
    target.key('keydown', 'KeyA');
    expect(events.map((event) => event.type)).toEqual(['on']);
  });

  it('suelta todas las teclas si la ventana pierde el foco', async () => {
    const { target, events } = await setup();
    target.key('keydown', 'KeyA');
    target.key('keydown', 'KeyS');
    target.blur(900);
    expect(events.filter((event) => event.type === 'off').map((event) => event.note)).toEqual([
      60, 62,
    ]);
  });

  it('informa su estado y deja de escuchar al detenerse', async () => {
    const { target, input } = await setup();
    expect(input.getStatus()).toEqual({ kind: 'conectado', deviceName: 'Teclado del PC' });
    expect(target.count()).toBe(3);
    input.stop();
    expect(target.count()).toBe(0);
  });
});
