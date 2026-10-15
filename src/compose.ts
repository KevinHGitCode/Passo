import { WebAudioOutput } from '@/adapters/audio/web-audio-output';
import type { AudioContextLike } from '@/adapters/audio/web-audio-output';
import { ComputerKeyboardInput } from '@/adapters/keyboard/computer-keyboard-input';
import type { KeyEventTarget } from '@/adapters/keyboard/computer-keyboard-input';
import { MicrophoneInput } from '@/adapters/microphone/microphone-input';
import type {
  MediaDevicesLike,
  MicAudioContextLike,
  VisibilityLike,
} from '@/adapters/microphone/microphone-types';
import { MidiNoteInput } from '@/adapters/midi/midi-input';
import type { MidiAccessLike } from '@/adapters/midi/midi-types';
import {
  LocalStoragePreferencesStore,
  browserStorage,
} from '@/adapters/storage/local-storage-preferences-store';
import { InputManager } from '@/core/application/input-manager';
import { bindInputsToPreferences } from '@/core/application/input-sync';
import { PracticeSession } from '@/core/application/practice-session';
import { PreferencesService } from '@/core/application/preferences-service';
import { bindSessionToPreferences } from '@/core/application/preferences-sync';
import { isExerciseMode } from '@/core/domain/curriculum';
import { roundConfigFor } from '@/core/domain/exercise';
import { createSeededRng } from '@/core/domain/rng';
import type { Rng } from '@/core/domain/rng';
import type { Clock } from '@/core/ports/clock';
import type { NoteInput } from '@/core/ports/note-input';

/**
 * Raíz de composición: el único lugar que conoce las implementaciones concretas.
 *
 * Entradas: la persona elige una (micrófono, piano MIDI o teclado del PC) y solo esa escucha; la
 * elección se recuerda en las preferencias y el micrófono nunca se enciende solo.
 *
 * Modo de desarrollo: `?pc` (teclado del PC), `?midi` (piano MIDI) o `?mic=off` (sin micrófono)
 * activan esas entradas a la vez, como antes, sin gestor ni preferencias de entrada. También:
 * `?seed=N` (notas reproducibles), `?debug` (panel de latencia) y `?modo=notas|terceras|acordes&nivel=N`
 * (ejercicio inicial).
 */
export function composeApp(search: string = window.location.search) {
  const params = new URLSearchParams(search);
  const seed = params.get('seed');
  const rng: Rng = seed === null ? Math.random : createSeededRng(Number(seed));
  const debug = params.has('debug');
  const usePc = params.has('pc');
  const useMidi = params.has('midi');
  const useMic = params.get('mic') !== 'off';
  const modeParam = params.get('modo');
  const config = isExerciseMode(modeParam)
    ? (roundConfigFor(modeParam, Number(params.get('nivel') ?? 1)) ?? undefined)
    : undefined;

  const clock: Clock = { now: () => performance.now() };
  const preferences = new PreferencesService(new LocalStoragePreferencesStore(browserStorage()));

  const microphone = new MicrophoneInput({
    mediaDevices: navigator.mediaDevices as unknown as MediaDevicesLike | undefined,
    createContext: () =>
      typeof AudioContext === 'undefined'
        ? undefined
        : (new AudioContext({ latencyHint: 'interactive' }) as unknown as MicAudioContextLike),
    clock,
    timers: {
      setInterval: (callback, ms) => window.setInterval(callback, ms),
      clearInterval: (id) => window.clearInterval(id),
    },
    visibility: document as unknown as VisibilityLike,
  });
  // El micrófono se apaga al cerrar la página o al recargar el módulo (la luz del equipo no debe quedar encendida).
  window.addEventListener('pagehide', () => microphone.stop());
  import.meta.hot?.dispose(() => microphone.stop());

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

  const devMode = usePc || useMidi || !useMic;
  const inputs: NoteInput[] = devMode
    ? [...(useMic ? [microphone] : []), ...(usePc ? [keyboard] : []), ...(useMidi ? [midi] : [])]
    : [microphone, midi, keyboard];
  if (devMode) {
    if (usePc) void keyboard.start();
    if (useMidi) void midi.start();
  }

  const audio = new WebAudioOutput(() =>
    typeof AudioContext === 'undefined'
      ? undefined
      : (new AudioContext({ latencyHint: 'interactive' }) as unknown as AudioContextLike),
  );
  // Los navegadores solo dejan sonar tras un gesto: el primer clic (al terminar, para no mover
  // la pantalla a mitad de un clic) o la primera tecla activa el sonido.
  let unlockArmed = false;
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
  const armAudioUnlock = () => {
    if (unlockArmed) return;
    unlockArmed = true;
    window.addEventListener('click', unlockOnGesture);
    window.addEventListener('keydown', unlockOnGesture);
  };
  if (usePc) armAudioUnlock();

  const session = new PracticeSession({
    inputs,
    audio,
    clock,
    rng,
    ...(config ? { config } : {}),
    ...(devMode && useMic ? { primarySource: 'microfono' as const } : {}),
  });

  // Notación, ayuda y ejercicio se recuerdan; `?modo=` fija el ejercicio sin guardarlo.
  bindSessionToPreferences(session, preferences, { exercise: config === undefined });

  // Entrada elegida: solo esa escucha. Con el teclado del PC la app suena, y para eso hace falta un gesto.
  let inputManager: InputManager | undefined;
  if (!devMode) {
    const manager = new InputManager(inputs, preferences.getSnapshot().input);
    inputManager = manager;
    const armIfKeyboard = () => {
      if (manager.getSnapshot().selected === 'teclado-pc') armAudioUnlock();
    };
    manager.subscribe(armIfKeyboard);
    bindInputsToPreferences(manager, session, preferences);
    armIfKeyboard();
    window.addEventListener('pagehide', () => manager.stopAll());
  }

  return {
    session,
    preferences,
    inputs: inputs as readonly NoteInput[],
    /** `undefined` en el modo de desarrollo (`?pc`, `?midi`, `?mic=off`): allí valen las entradas pedidas. */
    inputManager,
    microphone: useMic ? microphone : undefined,
    audio,
    debug,
    /** En el modo de desarrollo, el sonido de la app solo se muestra con el teclado del PC. */
    devShowSound: usePc,
  };
}
