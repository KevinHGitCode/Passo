import { InputManager } from '@/core/application/input-manager';
import { bindInputsToPreferences } from '@/core/application/input-sync';
import { PracticeSession } from '@/core/application/practice-session';
import { PreferencesService } from '@/core/application/preferences-service';
import { createSeededRng } from '@/core/domain/rng';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';
import { FakePreferencesStore } from '../fakes/fake-preferences-store';

function inputs() {
  return {
    mic: new FakeNoteInput('microfono'),
    midi: new FakeNoteInput('midi'),
    pc: new FakeNoteInput('teclado-pc'),
  };
}

describe('InputManager', () => {
  it('parte de la entrada elegida y conoce cuáles existen; no enciende nada por sí solo', () => {
    const { mic, midi, pc } = inputs();
    const manager = new InputManager([mic, midi, pc], 'midi');
    expect(manager.getSnapshot()).toEqual({
      selected: 'midi',
      available: ['microfono', 'midi', 'teclado-pc'],
    });
    expect([mic, midi, pc].map((input) => input.startCalls)).toEqual([0, 0, 0]);
  });

  it('si la entrada pedida no existe, parte de la primera disponible', () => {
    const { mic, pc } = inputs();
    expect(new InputManager([mic, pc], 'midi').getSnapshot().selected).toBe('microfono');
  });

  it('elegir una entrada apaga las demás y enciende la elegida', () => {
    const { mic, midi, pc } = inputs();
    const manager = new InputManager([mic, midi, pc], 'microfono');
    manager.select('teclado-pc');
    expect(pc.startCalls).toBe(1);
    expect(pc.getStatus().kind).toBe('conectado');
    expect(mic.stopCalls).toBe(1);
    expect(midi.stopCalls).toBe(1);
    expect(manager.getSnapshot().selected).toBe('teclado-pc');
    expect(manager.getSelected()).toBe(pc);
  });

  it('el micrófono nunca se enciende al elegirlo: lo enciende un gesto (activate)', async () => {
    const { mic, midi, pc } = inputs();
    const manager = new InputManager([mic, midi, pc], 'teclado-pc');
    manager.select('microfono');
    expect(mic.startCalls).toBe(0);
    expect(manager.getSnapshot().selected).toBe('microfono');
    expect(pc.stopCalls).toBe(1);
    await manager.activate();
    expect(mic.startCalls).toBe(1);
    expect(mic.getStatus().kind).toBe('conectado');
  });

  it('al dejar el micrófono se apaga (se suelta el dispositivo)', async () => {
    const { mic, pc } = inputs();
    const manager = new InputManager([mic, pc], 'microfono');
    await manager.activate();
    manager.select('teclado-pc');
    expect(mic.getStatus().kind).toBe('inactivo');
  });

  it('elegir lo que ya está elegido y encendido no lo reinicia ni avisa', () => {
    const { mic, pc } = inputs();
    const manager = new InputManager([mic, pc], 'teclado-pc');
    const listener = vi.fn();
    manager.subscribe(listener);
    manager.select('teclado-pc');
    manager.select('teclado-pc');
    expect(pc.startCalls).toBe(1);
    expect(listener).toHaveBeenCalledTimes(0);
    manager.select('microfono');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('una fuente desconocida no hace nada', () => {
    const { mic, pc } = inputs();
    const manager = new InputManager([mic, pc], 'microfono');
    manager.select('midi');
    expect(manager.getSnapshot().selected).toBe('microfono');
    expect(mic.stopCalls + pc.stopCalls).toBe(0);
  });

  it('si la entrada elegida no está funcionando (sin dispositivo), elegirla de nuevo la reintenta', () => {
    const { midi, pc } = inputs();
    const manager = new InputManager([midi, pc], 'midi');
    manager.select('midi');
    midi.setStatus({ kind: 'sin-dispositivo' });
    manager.select('midi');
    expect(midi.startCalls).toBe(2);
  });

  it('stopAll apaga todas', () => {
    const { mic, midi, pc } = inputs();
    const manager = new InputManager([mic, midi, pc], 'teclado-pc');
    manager.select('teclado-pc');
    manager.stopAll();
    expect([mic, midi, pc].map((input) => input.stopCalls)).toEqual([2, 2, 1]);
    expect(pc.getStatus().kind).toBe('inactivo');
  });
});

describe('bindInputsToPreferences', () => {
  function build(stored: unknown = null) {
    const { mic, midi, pc } = inputs();
    const manager = new InputManager([mic, midi, pc], 'microfono');
    const preferences = new PreferencesService(new FakePreferencesStore(stored));
    const session = new PracticeSession({
      inputs: [mic, midi, pc],
      audio: { noteOn: () => undefined, noteOff: () => undefined },
      clock: new FakeClock(0),
      rng: createSeededRng(1),
    });
    const unbind = bindInputsToPreferences(manager, session, preferences);
    return { mic, midi, pc, manager, preferences, session, unbind };
  }

  it('al empezar se elige la entrada de las preferencias (por defecto, el micrófono, apagado)', () => {
    const { mic, pc, manager } = build();
    expect(manager.getSnapshot().selected).toBe('microfono');
    expect(mic.startCalls).toBe(0);
    expect(pc.startCalls).toBe(0);
  });

  it('una preferencia guardada enciende esa entrada al arrancar', () => {
    const { pc, manager } = build({ version: 1, input: 'teclado-pc' });
    expect(manager.getSnapshot().selected).toBe('teclado-pc');
    expect(pc.getStatus().kind).toBe('conectado');
  });

  it('cambiar la preferencia cambia la entrada; otros cambios no la reinician', () => {
    const { pc, midi, manager, preferences } = build({ version: 1, input: 'midi' });
    expect(midi.startCalls).toBe(1);
    preferences.update({ theme: 'oscuro' });
    preferences.update({ notation: 'americana' });
    expect(midi.startCalls).toBe(1);
    preferences.update({ input: 'teclado-pc' });
    expect(manager.getSnapshot().selected).toBe('teclado-pc');
    expect(pc.startCalls).toBe(1);
    expect(midi.getStatus().kind).toBe('inactivo');
  });

  it('si la ronda estaba en pausa por perder el micrófono, pasar al teclado la reanuda', () => {
    const { mic, session, preferences } = build();
    session.start();
    mic.setStatus({ kind: 'conectado', deviceName: 'Micrófono' });
    mic.setStatus({ kind: 'desconectado', deviceName: 'Micrófono' });
    expect(session.getSnapshot()).toMatchObject({ phase: 'pausada', pausedSource: 'microfono' });
    preferences.update({ input: 'teclado-pc' });
    expect(session.getSnapshot().phase).toBe('en-curso');
  });

  it('tras cambiar de entrada ya no se vigila la anterior', () => {
    const { mic, pc, session, preferences } = build({ version: 1, input: 'teclado-pc' });
    session.start();
    mic.emitEvent({
      type: 'on',
      note: 60,
      velocity: 70,
      at: 10,
      source: 'microfono',
      confidence: 'alta',
    });
    preferences.update({ input: 'midi' });
    pc.setStatus({ kind: 'desconectado', deviceName: 'Teclado del PC' });
    expect(session.getSnapshot().phase).toBe('en-curso');
  });

  it('pasar al micrófono con una ronda empezada vuelve a la bienvenida (hay que activarlo)', () => {
    const { session, preferences, mic } = build({ version: 1, input: 'teclado-pc' });
    session.start();
    preferences.update({ input: 'microfono' });
    expect(session.getSnapshot()).toMatchObject({ phase: 'inactiva', exercise: null, hits: 0 });
    expect(mic.startCalls).toBe(0);
  });

  it('pasar a otra entrada deja la ronda como estaba', () => {
    const { session, preferences } = build({ version: 1, input: 'teclado-pc' });
    session.start();
    preferences.update({ input: 'midi' });
    expect(session.getSnapshot().phase).toBe('en-curso');
  });

  it('al arrancar con el micrófono elegido no se reinicia nada', () => {
    const { session } = build();
    session.start();
    expect(session.getSnapshot().phase).toBe('en-curso');
  });

  it('al soltar el puente las preferencias dejan de mandar', () => {
    const { pc, manager, preferences, unbind } = build();
    unbind();
    preferences.update({ input: 'teclado-pc' });
    expect(manager.getSnapshot().selected).toBe('microfono');
    expect(pc.startCalls).toBe(0);
  });
});
