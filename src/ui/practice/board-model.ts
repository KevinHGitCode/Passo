import type {
  PracticeSession,
  SessionFeedback,
  SessionSnapshot,
} from '@/core/application/practice-session';
import type { ExerciseMode } from '@/core/domain/curriculum';
import { handShape } from '@/core/domain/hand-shape';
import type { HandShape } from '@/core/domain/hand-shape';
import { noteLabel } from '@/core/domain/instrument';
import { noteName, pitchName } from '@/core/domain/note';
import type { Midi } from '@/core/domain/note';
import type { Target } from '@/core/domain/target';
import type { InputMonitor, MonitorSnapshot } from '@/core/ports/input-monitor';
import type { InputStatus, NoteInput } from '@/core/ports/note-input';
import type { CascadeBlock } from '../keyboard/cascade';
import { windowAround } from '../keyboard/geometry';
import type { KeyVisual } from '../keyboard/piano-keyboard';
import { feedbackMessage } from './feedback-message';
import type { FeedbackMessage } from './feedback-message';
import {
  useInputStatus,
  useIsNarrow,
  useMonitor,
  useRecentFeedback,
  useSessionSnapshot,
} from './hooks';
import { buildKeyVisuals } from './key-visuals';
import { notesText, positionText } from './target-text';

/**
 * Lo que comparten la práctica libre y las lecciones para dibujar el tablero (teclado, cascada, mano,
 * mensaje de respuesta): se deriva del estado de la sesión y del micrófono. Aquí no hay diseño, solo
 * datos; cada pantalla decide cómo mostrarlos.
 */

/** Rango del teclado en pantalla: Do3 a Do6 (el nivel 1 usa Do4–Sol4). */
export const KEYBOARD_FROM = 48;
export const KEYBOARD_TO = 84;

/** En pantallas estrechas se muestran 9 teclas blancas (de Do a Re de la octava siguiente). */
const NARROW_SPAN_SEMITONES = 14;
export const NARROW_MAX_WIDTH = 899;

/** Texto para lectores de pantalla. Incluye el nº de errores para que dos errores iguales se anuncien. */
export function liveMessage(snapshot: SessionSnapshot): string {
  const { exercise, feedback, notation } = snapshot;
  if (snapshot.phase === 'pausada') return `Ronda en pausa. ${pauseText(snapshot)}`;
  if (!exercise) return '';
  const guitar = snapshot.instrument === 'guitarra';
  const position = exercise.target.positions[0];
  const target = guitar
    ? `${noteLabel(exercise.target.notes[0], notation, snapshot.instrument)}${
        snapshot.help && position ? `: ${positionText(position)}` : ''
      }`
    : notesText(exercise.target.notes, notation);
  if (!feedback) return `Toca ${target}`;
  const message = feedbackMessage(feedback.outcome, notation, snapshot.instrument);
  if (feedback.outcome.kind === 'acierto') return `${message.title} Ahora toca ${target}`;
  if (feedback.outcome.kind === 'dudoso') return `${message.title}. ${message.detail}`;
  if (feedback.outcome.kind === 'error') {
    return `${message.title}, error ${snapshot.errors}. ${message.detail}. Intenta de nuevo`;
  }
  if (feedback.outcome.kind === 'parcial') return `${message.title}. ${message.detail}`;
  return `${message.title} ${message.detail}`;
}

export function pauseText(snapshot: SessionSnapshot): string {
  if (snapshot.pauseReason !== 'desconexion') return 'Pulsa continuar cuando quieras.';
  return snapshot.pausedSource === 'microfono'
    ? 'Se perdió el micrófono. Reactívalo para seguir.'
    : 'Se desconectó el piano. Vuelve a conectarlo para seguir.';
}

export function transpositionText(semitones: number): string {
  const count = Math.abs(semitones);
  const amount = count === 12 ? 'una octava' : `${count} ${count === 1 ? 'semitono' : 'semitonos'}`;
  return `Parece que tu teclado está transpuesto ${amount} (${semitones > 0 ? 'más agudo' : 'más grave'}). Revisa «Transpose» en el piano.`;
}

export interface BoardModel {
  readonly snapshot: SessionSnapshot;
  /** El resultado reciente que todavía debe verse (se apaga solo a los pocos instantes). */
  readonly recent: SessionFeedback | null;
  readonly message: FeedbackMessage | null;
  readonly mode: ExerciseMode;
  readonly roundSize: number;
  /** Notas del objetivo actual, o `null` sin ronda. */
  readonly targetNotes: Target['notes'] | null;
  readonly micStatus: InputStatus | null;
  readonly monitor: MonitorSnapshot;
  /** El micrófono está conectado y escuchando. */
  readonly micReady: boolean;
  readonly micConnected: boolean;
  readonly visuals: Map<Midi, KeyVisual>;
  readonly labelFor: (midi: Midi) => string | undefined;
  /** Hay una ronda en marcha (o en pausa): se muestran la cola de notas y la mano. */
  readonly playing: boolean;
  readonly cascade: CascadeBlock[];
  readonly hand: HandShape | null;
  /** Ventana de teclas en pantallas estrechas; `undefined` con el teclado completo. */
  readonly viewWindow: ReturnType<typeof windowAround> | undefined;
  readonly narrow: boolean;
  /** Descripción del teclado para lectores de pantalla. */
  readonly keyboardLabel: string;
}

export function useBoardModel(
  session: PracticeSession,
  microphone?: (NoteInput & InputMonitor) | undefined,
): BoardModel {
  const snapshot = useSessionSnapshot(session);
  const recent = useRecentFeedback(snapshot.feedback);
  const narrow = useIsNarrow(NARROW_MAX_WIDTH);
  const micStatus = useInputStatus(microphone);
  const monitor = useMonitor(microphone);
  const micReady = micStatus?.kind === 'conectado' && monitor.phase === 'escuchando';
  const micConnected = micStatus?.kind === 'conectado';

  const { exercise, notation, phase, help } = snapshot;
  const targetNotes = exercise?.target.notes ?? null;
  const mode = exercise?.config.mode ?? snapshot.mode;
  const roundSize = exercise?.config.roundSize ?? 0;
  const message = recent ? feedbackMessage(recent.outcome, notation, snapshot.instrument) : null;

  // En la prueba rápida de la bienvenida se resalta el Do central.
  const onboardingTarget = phase === 'inactiva' && microphone && micReady ? [60] : [];
  const visuals = buildKeyVisuals({
    targets: phase === 'en-curso' ? (targetNotes ?? []) : onboardingTarget,
    heard: micConnected ? (monitor.heard?.midi ?? null) : null,
    help,
    pressed: snapshot.pressed,
    feedback: recent,
  });

  /**
   * Con ayuda: nombre en cada tecla blanca. Sin ayuda: solo los Do como punto de referencia.
   * Las teclas negras solo se rotulan cuando son parte de un resultado.
   */
  const labelFor = (midi: Midi): string | undefined => {
    const isC = midi % 12 === 0;
    const hasFeedback = visuals.get(midi)?.feedback !== undefined;
    const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
    if (hasFeedback || (isC && phase !== 'inactiva')) return noteName(midi, notation);
    if (help && phase !== 'inactiva' && !isBlack) return pitchName(midi, notation);
    return undefined;
  };

  // La cola de notas y la mano solo se ven con una ronda en marcha (o en pausa); el espacio se reserva siempre.
  const playing = exercise !== null && (phase === 'en-curso' || phase === 'pausada');
  const cascade: CascadeBlock[] = playing
    ? [exercise.target, ...exercise.upcoming].map((target, slot) => ({
        id: exercise.completedTargets + slot,
        slot,
        notes: target.notes,
        fingers: target.fingers,
      }))
    : [];
  const hand = playing ? handShape(exercise.target) : null;
  const viewWindow = narrow
    ? windowAround(
        targetNotes?.[0] ?? 60,
        KEYBOARD_FROM,
        KEYBOARD_TO,
        NARROW_SPAN_SEMITONES,
        targetNotes?.[targetNotes.length - 1],
      )
    : undefined;

  const keyboardRange = `Teclado de piano de ${noteName(KEYBOARD_FROM, notation)} a ${noteName(KEYBOARD_TO, notation)}`;
  const keyboardLabel =
    targetNotes !== null && phase === 'en-curso'
      ? `${keyboardRange}. ${targetNotes.length === 1 ? 'Nota' : 'Notas'} a tocar: ${notesText(targetNotes, notation)}`
      : keyboardRange;

  return {
    snapshot,
    recent,
    message,
    mode,
    roundSize,
    targetNotes,
    micStatus,
    monitor,
    micReady,
    micConnected,
    visuals,
    labelFor,
    playing,
    cascade,
    hand,
    viewWindow,
    narrow,
    keyboardLabel,
  };
}
