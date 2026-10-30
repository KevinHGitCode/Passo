import { MicrophoneInput } from '@/adapters/microphone/microphone-input';
import { centsFrom, searchRange, stringFrequency } from '@/core/domain/tuner';
import type { PitchReading } from '@/core/ports/pitch-monitor';
import { MicHarness } from '../fakes/fake-microphone';
import { concat, guitarNote, highpass, silence } from '../support/synth';

async function build() {
  const h = new MicHarness();
  const mic = new MicrophoneInput({
    mediaDevices: h.devices,
    createContext: h.createContext,
    clock: h.clock,
    timers: h.timers,
    visibility: h.visibility,
  });
  const readings: (PitchReading | null)[] = [];
  mic.subscribePitch((reading) => readings.push(reading));
  await mic.start();
  return { h, mic, readings };
}

/** Las desviaciones medidas contra la cuerda 6 en las lecturas con sonido. */
const centsOf = (readings: readonly (PitchReading | null)[], string: 1 | 2 | 3 | 4 | 5 | 6) =>
  readings
    .filter((reading): reading is PitchReading => reading !== null)
    .map((reading) => centsFrom(stringFrequency(string), reading.frequency));

describe('MicrophoneInput · tono continuo para el afinador', () => {
  it('sin intervalo pedido no mide nada', async () => {
    const { h, readings } = await build();
    h.context.analyser.signal = concat(silence(1300), guitarNote(40, { ms: 2000 }), silence(500));
    h.advance(3000);
    expect(readings).toEqual([]);
  });

  it('mide la cuerda 6 (Mi2) y su desviación', async () => {
    for (const offset of [0, -30, 25]) {
      const { h, mic, readings } = await build();
      mic.setPitchSearch(searchRange(6));
      h.context.analyser.signal = concat(
        silence(1300),
        guitarNote(40, { ms: 2200, cents: offset }),
        silence(600),
      );
      h.advance(3400);
      const cents = centsOf(readings, 6);
      expect(cents.length, `${offset} cents`).toBeGreaterThan(10);
      const late = cents.slice(Math.floor(cents.length / 2));
      const mean = late.reduce((total, value) => total + value, 0) / late.length;
      expect(mean, `${offset} cents`).toBeCloseTo(offset, -1);
      expect(Math.abs(mean - offset)).toBeLessThan(4);
    }
  });

  it('con un micrófono que recorta los graves también mide el Mi2 sin irse a la octava', async () => {
    const { h, mic, readings } = await build();
    mic.setPitchSearch(searchRange(6));
    h.context.analyser.signal = concat(
      silence(1300),
      highpass(guitarNote(40, { ms: 2200, cents: -15 }), 130),
      silence(600),
    );
    h.advance(3400);
    const cents = centsOf(readings, 6);
    expect(cents.length).toBeGreaterThan(10);
    for (const value of cents) expect(Math.abs(value)).toBeLessThanOrEqual(300);
    const late = cents.slice(Math.floor(cents.length / 2));
    const mean = late.reduce((total, value) => total + value, 0) / late.length;
    expect(Math.abs(mean + 15)).toBeLessThan(6);
  });

  it('una cuerda muy floja se lee como floja, no como la nota vecina', async () => {
    const { h, mic, readings } = await build();
    mic.setPitchSearch(searchRange(5));
    h.context.analyser.signal = concat(
      silence(1300),
      guitarNote(45, { ms: 2200, cents: -120 }),
      silence(600),
    );
    h.advance(3400);
    const cents = centsOf(readings, 5);
    const late = cents.slice(Math.floor(cents.length / 2));
    const mean = late.reduce((total, value) => total + value, 0) / late.length;
    expect(Math.abs(mean + 120)).toBeLessThan(8);
  });

  it('otra cuerda que no es la elegida no se toma por afinada', async () => {
    const { h, mic, readings } = await build();
    mic.setPitchSearch(searchRange(6));
    // Suena la cuerda 5 (La2, 500 cents por encima de la 6): queda fuera del intervalo.
    h.context.analyser.signal = concat(silence(1300), guitarNote(45, { ms: 2200 }), silence(600));
    h.advance(3400);
    for (const value of centsOf(readings, 6)) expect(Math.abs(value)).toBeGreaterThan(20);
  });

  it('una cuerda aguda tocada con la grave elegida no se lee como «afinada» (alias de submúltiplo)', async () => {
    // La cuerda 6 (Mi2) elegida y suena el Mi4 de la cuerda 1, cuatro veces más aguda.
    for (const note of [guitarNote(64, { ms: 2200 }), guitarNote(52, { ms: 2200 })]) {
      const { h, mic, readings } = await build();
      mic.setPitchSearch(searchRange(6));
      h.context.analyser.signal = concat(silence(1300), note, silence(600));
      h.advance(3400);
      for (const value of centsOf(readings, 6)) expect(Math.abs(value)).toBeGreaterThan(30);
    }
  });

  it('con null deja de medir y avisa de que ya no hay lectura', async () => {
    const { h, mic, readings } = await build();
    mic.setPitchSearch(searchRange(6));
    h.context.analyser.signal = concat(silence(1300), guitarNote(40, { ms: 3000 }));
    h.advance(2600);
    expect(mic.getPitch()).not.toBeNull();
    mic.setPitchSearch(null);
    expect(mic.getPitch()).toBeNull();
    expect(readings[readings.length - 1]).toBeNull();
    const count = readings.length;
    h.advance(500);
    expect(readings).toHaveLength(count);
  });

  it('mientras mide, el silencio se avisa en cada fotograma (no una sola vez)', async () => {
    const { h, mic, readings } = await build();
    mic.setPitchSearch(searchRange(6));
    h.context.analyser.signal = concat(silence(1300), guitarNote(40, { ms: 800 }), silence(3000));
    h.advance(3000);
    expect(mic.getPitch()).toBeNull();
    const nullsBefore = readings.filter((reading) => reading === null).length;
    h.advance(500);
    const nullsAfter = readings.filter((reading) => reading === null).length;
    expect(nullsAfter - nullsBefore).toBeGreaterThan(10);
  });

  it('al apagar el micrófono la lectura se borra', async () => {
    const { h, mic } = await build();
    mic.setPitchSearch(searchRange(6));
    h.context.analyser.signal = concat(silence(1300), guitarNote(40, { ms: 3000 }));
    h.advance(2600);
    expect(mic.getPitch()).not.toBeNull();
    mic.stop();
    expect(mic.getPitch()).toBeNull();
  });
});
