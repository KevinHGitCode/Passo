import { WebAudioOutput } from '@/adapters/audio/web-audio-output';
import { midiToFrequency } from '@/core/domain/pitch';
import type { AudioStatus } from '@/core/ports/audio-control';
import { FakeAudioContext } from '../fakes/fake-audio-context';

function setup() {
  const context = new FakeAudioContext();
  const output = new WebAudioOutput(() => context);
  const statuses: AudioStatus[] = [];
  output.subscribeStatus((status) => statuses.push(status));
  return { context, output, statuses };
}

describe('midiToFrequency', () => {
  it('La4 = 440 Hz, Do4 ≈ 261,63 Hz y una octava duplica la frecuencia', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
    expect(midiToFrequency(81)).toBeCloseTo(880, 6);
  });
});

describe('WebAudioOutput', () => {
  it('empieza "bloqueado" y pasa a "listo" al desbloquear con un gesto', async () => {
    const { context, output, statuses } = setup();
    expect(output.getStatus()).toBe('bloqueado');
    await output.unlock();
    expect(context.resumeCalls).toBe(1);
    expect(output.getStatus()).toBe('listo');
    expect(statuses).toEqual(['listo']);
  });

  it('noteOn crea dos osciladores a la frecuencia correcta y los arranca', () => {
    const { context, output } = setup();
    output.noteOn(69, 100);
    expect(context.oscillators).toHaveLength(2);
    expect(context.oscillators.map((o) => o.frequency.value)).toEqual([440, 880]);
    expect(context.oscillators.every((o) => o.started !== null && o.connected)).toBe(true);
  });

  it('una velocidad mayor da más volumen', () => {
    const quiet = setup();
    quiet.output.noteOn(60, 20);
    const loud = setup();
    loud.output.noteOn(60, 120);
    const peak = (calls: string[]) => Number(/lin:([\d.]+)@/.exec(calls.join(' '))?.[1]);
    const quietGain = quiet.context.gains.at(-1)?.gain.calls ?? [];
    const loudGain = loud.context.gains.at(-1)?.gain.calls ?? [];
    expect(peak(loudGain)).toBeGreaterThan(peak(quietGain));
  });

  it('noteOff programa la liberación y detiene los osciladores', () => {
    const { context, output } = setup();
    output.noteOn(60, 90);
    context.currentTime = 1;
    output.noteOff(60);
    const oscillators = context.oscillators;
    expect(oscillators.every((o) => o.stopped !== null && o.stopped > 1)).toBe(true);
    oscillators.forEach((o) => o.onended?.());
    expect(oscillators.every((o) => !o.connected)).toBe(true);
  });

  it('volver a tocar la misma nota corta la anterior (no se acumulan voces)', () => {
    const { context, output } = setup();
    output.noteOn(60, 90);
    output.noteOn(60, 90);
    expect(context.oscillators).toHaveLength(4);
    expect(context.oscillators.slice(0, 2).every((o) => o.stopped !== null)).toBe(true);
  });

  it('noteOff de una nota que no suena no hace nada', () => {
    const { output } = setup();
    expect(() => output.noteOff(61)).not.toThrow();
  });

  it('sin Web Audio informa "sin-soporte" y no lanza al tocar', async () => {
    const output = new WebAudioOutput(() => undefined);
    expect(() => output.noteOn(60, 90)).not.toThrow();
    await output.unlock();
    expect(output.getStatus()).toBe('sin-soporte');
  });
});
