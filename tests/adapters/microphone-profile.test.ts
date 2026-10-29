import { MicrophoneInput } from '@/adapters/microphone/microphone-input';
import type { NoteEvent } from '@/core/domain/note-event';
import { MicHarness } from '../fakes/fake-microphone';
import { concat, guitarNote, pianoNote, silence } from '../support/synth';

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

const ons = (events: readonly NoteEvent[]) =>
  events.filter((event) => event.type === 'on').map((event) => event.note);

describe('MicrophoneInput · perfil de escucha', () => {
  it('con el perfil de piano, un Mi2 de guitarra queda fuera del rango', async () => {
    const { h, mic, events } = build();
    await mic.start();
    h.context.analyser.signal = concat(silence(1300), guitarNote(40), silence(1200));
    h.advance(3200);
    expect(ons(events)).toEqual([]);
  });

  it('el perfil de guitarra puesto antes de encender se aplica al encender', async () => {
    const { h, mic, events } = build();
    mic.setProfile('guitarra');
    await mic.start();
    h.context.analyser.signal = concat(silence(1300), guitarNote(40), silence(1200));
    h.advance(3200);
    expect(ons(events)).toEqual([40]);
  });

  it('cambiar al perfil de guitarra con el micrófono encendido no vuelve a calibrar', async () => {
    const { h, mic, events } = build();
    await mic.start();
    h.context.analyser.signal = concat(silence(2500), guitarNote(40), silence(1200));
    h.advance(2200);
    expect(mic.getMonitor().phase).toBe('escuchando');
    mic.setProfile('guitarra');
    expect(mic.getMonitor().phase).toBe('escuchando');
    h.advance(2000);
    expect(ons(events)).toEqual([40]);
  });

  it('cambiar de perfil con una nota sonando la suelta con un off', async () => {
    const { h, mic, events } = build();
    await mic.start();
    h.context.analyser.signal = concat(silence(1300), pianoNote(64, { ms: 3000 }));
    h.advance(2100);
    expect(ons(events)).toEqual([64]);
    mic.setProfile('guitarra');
    expect(events.filter((event) => event.type === 'off')).toHaveLength(1);
  });

  it('repetir el mismo perfil no hace nada', async () => {
    const { h, mic, events } = build();
    await mic.start();
    h.advance(1500);
    const before = events.length;
    mic.setProfile('piano');
    expect(events).toHaveLength(before);
  });
});
