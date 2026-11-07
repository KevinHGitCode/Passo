import { MicrophoneInput } from '@/adapters/microphone/microphone-input';
import { StrumListener } from '@/core/application/strum-listener';
import type { StrumEvent } from '@/core/application/strum-listener';
import { chordSymbol, matchChords } from '@/core/domain/chords';
import { MicHarness } from '../fakes/fake-microphone';
import { strum } from '../support/strum';
import { concat, silence } from '../support/synth';

async function build(mode: Parameters<StrumListener['start']>[0]) {
  const h = new MicHarness();
  const mic = new MicrophoneInput({
    mediaDevices: h.devices,
    createContext: h.createContext,
    clock: h.clock,
    timers: h.timers,
    visibility: h.visibility,
  });
  const listener = new StrumListener({ frames: mic });
  const events: StrumEvent[] = [];
  listener.subscribe((event) => events.push(event));
  listener.start(mode);
  await mic.start();
  return { h, mic, listener, events };
}

describe('MicrophoneInput · sonido en bruto para los rasgueos', () => {
  it('sin nadie suscrito no entrega fotogramas', async () => {
    const h = new MicHarness();
    const mic = new MicrophoneInput({
      mediaDevices: h.devices,
      createContext: h.createContext,
      clock: h.clock,
      timers: h.timers,
      visibility: h.visibility,
    });
    await mic.start();
    h.context.analyser.signal = silence(2000);
    expect(() => h.advance(1500)).not.toThrow();
  });

  it('un rasgueo de Sol hacia abajo y otro de Do hacia arriba: se reconocen el acorde y la dirección', async () => {
    const { h, events } = await build('acorde');
    h.context.analyser.signal = concat(
      silence(1400),
      strum([43, 47, 50, 55, 59, 67], { ms: 1300, t60: 2 }),
      silence(300),
      strum([64, 60, 55, 52, 48].reverse().reverse(), { ms: 1300, t60: 2 }),
      silence(600),
    );
    h.advance(5200);
    const hits = events.flatMap((event) => (event.kind === 'golpe' ? [event] : []));
    const chords = events.flatMap((event) => (event.kind === 'acorde' ? [event] : []));
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0]?.direction).toBe('abajo');
    expect(chords.length).toBeGreaterThanOrEqual(1);
    const first = chords[0];
    expect(
      first
        ? chordSymbol((matchChords(first.notes)[0] as ReturnType<typeof matchChords>[number]).chord)
        : '',
    ).toBe('G');
  });
});
