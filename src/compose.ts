import { WebAudioOutput } from '@/adapters/audio/web-audio-output';
import type { AudioContextLike } from '@/adapters/audio/web-audio-output';
import { ComputerKeyboardInput } from '@/adapters/keyboard/computer-keyboard-input';
import type { KeyEventTarget } from '@/adapters/keyboard/computer-keyboard-input';
import { MidiNoteInput } from '@/adapters/midi/midi-input';
import type { MidiAccessLike } from '@/adapters/midi/midi-types';
import { PracticeSession } from '@/core/application/practice-session';
import { createSeededRng } from '@/core/domain/rng';
import type { Rng } from '@/core/domain/rng';
import type { Clock } from '@/core/ports/clock';

/** Raíz de composición: el único lugar que conoce las implementaciones concretas. */
export function composeApp(search: string = window.location.search) {
  const params = new URLSearchParams(search);
  const seed = params.get('seed');
  const rng: Rng = seed === null ? Math.random : createSeededRng(Number(seed));
  const debug = params.has('debug');

  const clock: Clock = { now: () => performance.now() };

  const keyTarget: KeyEventTarget = {
    addEventListener: (type, listener) => window.addEventListener(type, listener as EventListener),
    removeEventListener: (type, listener) =>
      window.removeEventListener(type, listener as EventListener),
  };
  const keyboard = new ComputerKeyboardInput(keyTarget);

  const midi = new MidiNoteInput(
    typeof navigator.requestMIDIAccess === 'function'
      ? () => navigator.requestMIDIAccess({ sysex: false }) as unknown as Promise<MidiAccessLike>
      : undefined,
  );

  const audio = new WebAudioOutput(() =>
    typeof AudioContext === 'undefined'
      ? undefined
      : (new AudioContext({ latencyHint: 'interactive' }) as unknown as AudioContextLike),
  );
  // Los navegadores solo dejan sonar tras un gesto: el primer clic (al terminar, para no mover
  // la pantalla a mitad de un clic) o la primera tecla activa el sonido.
  const unlockOnGesture = () => {
    void audio
      .unlock()
      .then(() => {
        if (audio.getStatus() === 'listo') {
          window.removeEventListener('click', unlockOnGesture);
          window.removeEventListener('keydown', unlockOnGesture);
        }
      })
      .catch(() => undefined);
  };
  window.addEventListener('click', unlockOnGesture);
  window.addEventListener('keydown', unlockOnGesture);

  const inputs = [keyboard, midi] as const;
  const session = new PracticeSession({ inputs, audio, clock, rng });
  void keyboard.start();
  void midi.start();

  return { session, inputs, audio, debug };
}
