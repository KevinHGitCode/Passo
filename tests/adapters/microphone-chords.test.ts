import { MicrophoneInput } from '@/adapters/microphone/microphone-input';
import type { NoteEvent } from '@/core/domain/note-event';
import { MicHarness } from '../fakes/fake-microphone';
import { concat, mix, pianoNote, silence } from '../support/synth';

const DO_MAYOR = [60, 64, 67];

function chord(notes: readonly number[], ms = 1500, seed = 1) {
  return mix(
    notes.map((midi, i) => ({ signal: pianoNote(midi, { ms, amplitude: 0.2, seed: seed + i }) })),
  );
}

function build() {
  const h = new MicHarness();
  const mic = new MicrophoneInput({
    mediaDevices: h.devices,
    createContext: h.createContext,
    clock: h.clock,
    timers: h.timers,
    visibility: h.visibility,
  });
  const events: NoteEvent[] = [];
  mic.subscribe((event) => events.push(event));
  return { h, mic, events };
}

async function started() {
  const parts = build();
  await parts.mic.start();
  return parts;
}

const ons = (events: NoteEvent[]) =>
  events.filter((event) => event.type === 'on').map((event) => event.note);

describe('MicrophoneInput · acordes (beta)', () => {
  it('con un acorde esperado entrega un on por nota esperada, con la fuente y la hora del ataque', async () => {
    const { h, mic, events } = await started();
    mic.setExpectation(DO_MAYOR);
    h.context.analyser.signal = concat(silence(1400), chord(DO_MAYOR), silence(500));
    h.advance(3300);
    expect(ons(events)).toEqual(DO_MAYOR);
    expect(events.every((event) => event.source === 'microfono')).toBe(true);
    // El ataque está a 1400 ms de la señal; el reloj empezó en 1000.
    for (const event of events) expect(Math.abs(event.at - 2400)).toBeLessThanOrEqual(40);
  });

  it('con el acorde esperado, el seguimiento de una voz no mete notas sueltas', async () => {
    const { h, mic, events } = await started();
    mic.setExpectation(DO_MAYOR);
    h.context.analyser.signal = concat(silence(1400), chord(DO_MAYOR), silence(500));
    h.advance(3300);
    expect(events.filter((event) => event.type === 'on')).toHaveLength(3);
  });

  it('un acorde incompleto solo da las notas que suenan', async () => {
    const { h, mic, events } = await started();
    mic.setExpectation(DO_MAYOR);
    h.context.analyser.signal = concat(silence(1400), chord([60, 67]), silence(500));
    h.advance(3300);
    expect(ons(events)).toEqual([60, 67]);
  });

  it('sin acorde esperado todo sigue como antes (una voz)', async () => {
    const { h, events } = await started();
    h.context.analyser.signal = concat(silence(1400), pianoNote(64, { ms: 800 }), silence(900));
    h.advance(3300);
    expect(ons(events)).toEqual([64]);
  });

  it('quitar el acorde esperado devuelve el seguimiento de una voz', async () => {
    const { h, mic, events } = await started();
    mic.setExpectation(DO_MAYOR);
    mic.setExpectation(null);
    h.context.analyser.signal = concat(silence(1400), pianoNote(67, { ms: 800 }), silence(900));
    h.advance(3300);
    expect(ons(events)).toEqual([67]);
  });

  it('durante la calibración (aún no se conoce el ruido) no se mide nada', async () => {
    const { h, mic, events } = await started();
    mic.setExpectation(DO_MAYOR);
    h.context.analyser.signal = concat(silence(200), chord(DO_MAYOR, 900), silence(2500));
    h.advance(3300);
    expect(ons(events)).toEqual([]);
  });

  it('el acorde esperado puede fijarse antes de activar el micrófono', async () => {
    const { h, mic, events } = build();
    mic.setExpectation(DO_MAYOR);
    await mic.start();
    h.context.analyser.signal = concat(silence(1400), chord(DO_MAYOR), silence(500));
    h.advance(3300);
    expect(ons(events)).toEqual(DO_MAYOR);
  });

  it('apagar y volver a encender no arrastra lo anterior', async () => {
    const { h, mic, events } = await started();
    mic.setExpectation(DO_MAYOR);
    h.context.analyser.signal = concat(silence(1400), chord(DO_MAYOR), silence(500));
    h.advance(2000);
    mic.stop();
    events.length = 0;
    await mic.start();
    h.context.analyser.signal = concat(silence(1400), chord(DO_MAYOR, 1500, 9), silence(500));
    h.advance(3300);
    expect(ons(events)).toEqual(DO_MAYOR);
  });
});
