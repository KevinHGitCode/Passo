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
 * Entrada principal: el micrófono (escucha activa). Opcionales, por la dirección:
 * `?pc` (teclado del PC como piano, para desarrollo), `?midi` (piano MIDI), `?mic=off` (sin
 * micrófono, para pruebas de las otras entradas), `?seed=N` (notas reproducibles), `?debug`
 * (panel de latencia) y `?modo=notas|terceras|acordes&nivel=N` (ejercicio inicial).
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

  const inputs: NoteInput[] = useMic ? [microphone] : [];

  if (usePc) {
    const keyTarget: KeyEventTarget = {
      addEventListener: (type, listener) =>
        window.addEventListener(type, listener as EventListener),
      removeEventListener: (type, listener) =>
        window.removeEventListener(type, listener as EventListener),
    };
    const keyboard = new ComputerKeyboardInput(keyTarget);
    inputs.push(keyboard);
    void keyboard.start();
  }

  if (useMidi) {
    const midi = new MidiNoteInput(
      typeof navigator.requestMIDIAccess === 'function'
        ? () => navigator.requestMIDIAccess({ sysex: false }) as unknown as Promise<MidiAccessLike>
        : undefined,
    );
    inputs.push(midi);
    void midi.start();
  }

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
  if (usePc) {
    window.addEventListener('click', unlockOnGesture);
    window.addEventListener('keydown', unlockOnGesture);
  }

  const session = new PracticeSession({
    inputs,
    audio,
    clock,
    rng,
    ...(config ? { config } : {}),
    ...(useMic ? { primarySource: 'microfono' as const } : {}),
  });

  // Notación, ayuda y ejercicio se recuerdan; `?modo=` fija el ejercicio sin guardarlo.
  bindSessionToPreferences(session, preferences, { exercise: config === undefined });

  return {
    session,
    preferences,
    inputs: inputs as readonly NoteInput[],
    microphone: useMic ? microphone : undefined,
    audio,
    debug,
    /** El teclado del PC es el único que hace sonar la app: solo entonces se muestra el estado del sonido. */
    showSound: usePc,
    pcKeysHint: usePc
      ? config?.pool[0]?.hand === 'izquierda'
        ? 'Teclado del PC: Z X C V B N M = Do3 Re3 Mi3 Fa3 Sol3 La3 Si3 · A S D F = Do4 Re4 Mi4 Fa4'
        : 'Teclado del PC: A S D F G H J K L ; = Do4 Re4 Mi4 Fa4 Sol4 La4 Si4 Do5 Re5 Mi5'
      : undefined,
  };
}
