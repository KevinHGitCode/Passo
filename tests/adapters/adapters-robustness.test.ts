import { WebAudioOutput } from '@/adapters/audio/web-audio-output';
import { MidiNoteInput, parseMidiMessage } from '@/adapters/midi/midi-input';
import type { NoteEvent } from '@/core/domain/note-event';
import { FakeAudioContext } from '../fakes/fake-audio-context';
import { FakeMidiAccess, FakeMidiPort } from '../fakes/fake-midi-access';

describe('MidiNoteInput · robustez', () => {
  async function setup() {
    const port = new FakeMidiPort('p1');
    const access = new FakeMidiAccess([port]);
    const input = new MidiNoteInput(() => Promise.resolve(access));
    const events: NoteEvent[] = [];
    input.subscribe((event) => events.push(event));
    await input.start();
    return { port, access, input, events };
  }

  it('si se desconecta el piano con teclas pulsadas, suelta esas notas (no quedan pegadas)', async () => {
    const { port, access, events } = await setup();
    port.send([0x90, 60, 90], 10);
    port.send([0x90, 64, 90], 20);
    port.send([0x80, 60, 0], 30);
    access.unplug(port);
    const offs = events.filter((event) => event.type === 'off').map((event) => event.note);
    expect(offs).toEqual([60, 64]);
  });

  it('stop() también suelta las teclas pulsadas', async () => {
    const { port, input, events } = await setup();
    port.send([0x90, 62, 90], 10);
    input.stop();
    expect(events.at(-1)).toMatchObject({ type: 'off', note: 62 });
  });

  it('ignora mensajes con un número de nota fuera de 0–127', () => {
    expect(parseMidiMessage({ data: Uint8Array.from([0x90, 200, 90]), timeStamp: 1 })).toBeNull();
  });

  it('una respuesta de permiso que llega tarde, después de stop(), se descarta', async () => {
    let release: (() => void) | undefined;
    const access = new FakeMidiAccess([new FakeMidiPort('p1')]);
    const input = new MidiNoteInput(
      () =>
        new Promise((resolve) => {
          release = () => resolve(access);
        }),
    );
    const pending = input.start();
    input.stop();
    release?.();
    await pending;
    expect(access.listenerCount()).toBe(0);
  });
});

describe('WebAudioOutput · robustez', () => {
  it('si crear el AudioContext lanza una excepción, queda "sin-soporte" y no rompe', async () => {
    const output = new WebAudioOutput(() => {
      throw new Error('no se puede');
    });
    expect(() => output.noteOn(60, 90)).not.toThrow();
    await output.unlock();
    expect(output.getStatus()).toBe('sin-soporte');
  });

  it('limita las voces simultáneas cortando la más antigua', () => {
    const context = new FakeAudioContext();
    const output = new WebAudioOutput(() => context);
    for (let note = 40; note < 55; note++) output.noteOn(note, 90);
    const stopped = context.oscillators.filter((oscillator) => oscillator.stopped !== null);
    expect(stopped.length).toBeGreaterThan(0);
    expect(context.oscillators.length - stopped.length).toBeLessThanOrEqual(20);
  });

  it('la latencia estimada es null si el navegador no la informa y no repite resume() si ya suena', async () => {
    const context = new FakeAudioContext();
    const output = new WebAudioOutput(() => context);
    expect(output.estimatedLatencyMs()).toBeNull();
    await output.unlock();
    expect(output.estimatedLatencyMs()).toBeNull();
    const before = context.resumeCalls;
    output.noteOn(60, 90);
    expect(context.resumeCalls).toBe(before);
  });
});
