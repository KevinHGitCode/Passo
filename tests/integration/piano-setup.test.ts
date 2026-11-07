import { describe, expect, it } from 'vitest';
import { CorrectedNoteInput } from '@/core/application/corrected-note-input';
import { bindNoteLabelsToPreferences } from '@/core/application/note-labels-sync';
import { PianoSetupService } from '@/core/application/piano-setup-service';
import { PreferencesService } from '@/core/application/preferences-service';
import { noteName, setOctaveLabelShift } from '@/core/domain/note';
import { FakePreferencesStore } from '../fakes/fake-preferences-store';
import { FakeNoteInput } from '../fakes/fake-note-input';

const press = (input: FakeNoteInput, note: number, at: number) =>
  input.emitEvent({ type: 'on', note, velocity: 80, at, source: 'microfono' });

describe('PianoSetupService · la prueba del piano', () => {
  it('pide las notas una a una y compara lo que oye con lo pedido', () => {
    const input = new FakeNoteInput('microfono');
    const setup = new PianoSetupService({ input });
    setup.start(61);
    expect(setup.getSnapshot()).toMatchObject({ phase: 'probando', index: 0 });
    const notes = setup.getSnapshot().notes;
    expect(notes[0]).toBe(40);
    // La primera sale bien, la segunda una octava arriba.
    press(input, notes[0] as number, 1000);
    press(input, (notes[1] as number) + 12, 2000);
    expect(setup.getSnapshot().results).toEqual([
      { expected: 40, detected: 40 },
      { expected: 48, detected: 60 },
    ]);
    expect(setup.getSnapshot().lastHeard).toBe(60);
  });

  it('un mismo sonido oído dos veces seguidas no pasa a la siguiente nota', () => {
    const input = new FakeNoteInput('microfono');
    const setup = new PianoSetupService({ input });
    setup.start(61);
    press(input, 40, 1000);
    press(input, 40, 1100);
    expect(setup.getSnapshot().results).toHaveLength(1);
  });

  it('al terminar da las correcciones de octava y deja de escuchar', () => {
    const input = new FakeNoteInput('microfono');
    const setup = new PianoSetupService({ input });
    setup.start(25);
    const notes = setup.getSnapshot().notes;
    notes.forEach((note, index) => press(input, index < 2 ? note + 12 : note, 1000 + index * 1000));
    const snapshot = setup.getSnapshot();
    expect(snapshot.phase).toBe('terminada');
    expect(setup.fixes()).toEqual([
      { note: 48, shift: 12 },
      { note: 52, shift: 12 },
    ]);
    press(input, 60, 99_000);
    expect(setup.getSnapshot().results).toHaveLength(notes.length);
  });

  it('saltar una nota la deja sin oír, y parar vuelve al principio', () => {
    const input = new FakeNoteInput('microfono');
    const setup = new PianoSetupService({ input });
    setup.start(61);
    setup.skip();
    expect(setup.getSnapshot().results[0]).toEqual({ expected: 40, detected: null });
    setup.stop();
    expect(setup.getSnapshot().phase).toBe('inactiva');
  });

  it('avisa al micrófono de que escuche como un piano y lo suelta al acabar', () => {
    const calls: string[] = [];
    const setup = new PianoSetupService({
      input: new FakeNoteInput('microfono'),
      listening: { enter: () => calls.push('enter'), leave: () => calls.push('leave') },
    });
    setup.start(61);
    setup.start(61);
    setup.stop();
    setup.stop();
    expect(calls).toEqual(['enter', 'leave']);
  });
});

describe('CorrectedNoteInput · corregir el micrófono', () => {
  function setup(fixes: readonly { note: number; shift: number }[], enabled = true) {
    const raw = new FakeNoteInput('microfono');
    const expectations: (readonly number[] | null)[] = [];
    const corrected = new CorrectedNoteInput({
      input: Object.assign(raw, {
        setExpectation: (notes: readonly number[] | null) => expectations.push(notes),
      }),
      fixes: () => fixes,
      enabled: () => enabled,
    });
    const heard: number[] = [];
    corrected.subscribe((event) => heard.push(event.note));
    return { raw, corrected, heard, expectations };
  }

  it('una nota leída una octava arriba se entrega en la octava en que se tocó', () => {
    const { raw, heard } = setup([{ note: 52, shift: 12 }]);
    press(raw, 64, 1000);
    expect(heard).toEqual([52]);
  });

  it('lo demás pasa igual, y sin correcciones no toca nada', () => {
    const { raw, heard } = setup([{ note: 52, shift: 12 }]);
    press(raw, 72, 1000);
    expect(heard).toEqual([72]);
    const none = setup([]);
    press(none.raw, 64, 1000);
    expect(none.heard).toEqual([64]);
  });

  it('no corrige si no se toca el piano (guitarra) ni cuando se espera un acorde', () => {
    const off = setup([{ note: 52, shift: 12 }], false);
    press(off.raw, 64, 1000);
    expect(off.heard).toEqual([64]);
    const chord = setup([{ note: 52, shift: 12 }]);
    chord.corrected.setExpectation([48, 52, 55]);
    press(chord.raw, 64, 1000);
    expect(chord.heard).toEqual([64]);
    expect(chord.expectations[0]).toEqual([48, 52, 55]);
    chord.corrected.setExpectation(null);
    press(chord.raw, 64, 3000);
    expect(chord.heard).toEqual([64, 52]);
  });

  it('reenvía el estado y la fuente de la entrada', () => {
    const { corrected, raw } = setup([]);
    expect(corrected.source).toBe('microfono');
    expect(corrected.getStatus()).toEqual(raw.getStatus());
  });
});

describe('el nombre del Do central', () => {
  it('con Yamaha el Do central (60) se escribe Do3; con el estándar, Do4', () => {
    const preferences = new PreferencesService(new FakePreferencesStore(null));
    bindNoteLabelsToPreferences(preferences);
    expect(noteName(60, 'latina')).toBe('Do4');
    preferences.update({ pianoNaming: 'yamaha' });
    expect(noteName(60, 'latina')).toBe('Do3');
    expect(noteName(64, 'americana')).toBe('E3');
    preferences.update({ pianoNaming: 'estandar' });
    expect(noteName(60, 'latina')).toBe('Do4');
    setOctaveLabelShift(0);
  });

  it('las preferencias nuevas se validan y se guardan: teclas, nombre y correcciones', () => {
    const preferences = new PreferencesService(new FakePreferencesStore(null));
    preferences.update({
      pianoKeys: 88,
      pianoNaming: 'yamaha',
      micFixes: [{ note: 52, shift: 12 }],
    });
    expect(preferences.getSnapshot()).toMatchObject({
      pianoKeys: 88,
      pianoNaming: 'yamaha',
      micFixes: [{ note: 52, shift: 12 }],
    });
    // Un valor inválido se ignora.
    preferences.update({ pianoKeys: 60 as never, micFixes: [{ note: 52, shift: 5 }] });
    expect(preferences.getSnapshot().pianoKeys).toBe(88);
    expect(preferences.getSnapshot().micFixes).toEqual([]);
  });
});
