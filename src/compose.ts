import { ComputerKeyboardInput } from '@/adapters/keyboard/computer-keyboard-input';
import type { KeyEventTarget } from '@/adapters/keyboard/computer-keyboard-input';
import { PracticeSession } from '@/core/application/practice-session';
import { createSeededRng } from '@/core/domain/rng';
import type { Rng } from '@/core/domain/rng';
import type { AudioOutput } from '@/core/ports/audio-output';
import type { Clock } from '@/core/ports/clock';

/** Raíz de composición: el único lugar que conoce las implementaciones concretas. */
export function composeApp(search: string = window.location.search) {
  const params = new URLSearchParams(search);
  const seed = params.get('seed');
  const rng: Rng = seed === null ? Math.random : createSeededRng(Number(seed));

  const clock: Clock = { now: () => performance.now() };
  const silentAudio: AudioOutput = { noteOn: () => undefined, noteOff: () => undefined };
  const keyTarget: KeyEventTarget = {
    addEventListener: (type, listener) => window.addEventListener(type, listener as EventListener),
    removeEventListener: (type, listener) =>
      window.removeEventListener(type, listener as EventListener),
  };
  const keyboard = new ComputerKeyboardInput(keyTarget);

  const session = new PracticeSession({ inputs: [keyboard], audio: silentAudio, clock, rng });
  void keyboard.start();

  return { session, inputs: [keyboard] as const };
}
