import type { Outcome } from '@/core/domain/exercise';
import { isBlackKey, noteName, pitchClass, pitchName, semitoneDistance } from '@/core/domain/note';
import type { Midi, NotationMode } from '@/core/domain/note';

/** Espacio duro: evita que «2 semitonos» se parta en dos líneas. */
const NBSP = ' ';

export type FeedbackTone = 'ok' | 'error' | 'done' | 'neutral';

export interface FeedbackMessage {
  readonly tone: FeedbackTone;
  readonly title: string;
  readonly detail: string;
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

/** "2 semitonos más agudo": positivo = se tocó más agudo que la nota pedida. */
export function describeSemitones(semitones: number): string {
  const count = Math.abs(semitones);
  const unit = count === 1 ? 'semitono' : 'semitonos';
  return `${count}${NBSP}${unit} más ${semitones > 0 ? 'agudo' : 'grave'}`;
}

function countWhiteKeysBetween(low: Midi, high: Midi): number {
  let count = 0;
  for (let midi = low + 1; midi <= high; midi++) if (!isBlackKey(midi)) count++;
  return count;
}

/**
 * Explica el error de la forma más útil para quien empieza:
 * - misma nota en otra octava → "Es Do, pero una octava más arriba";
 * - dos teclas blancas → cuántas teclas a la derecha/izquierda;
 * - en otro caso (teclas negras) → semitonos.
 */
export function describeMistake(target: Midi, played: Midi, notation: NotationMode): string {
  const semitones = semitoneDistance(target, played);
  if (pitchClass(target) === pitchClass(played)) {
    const octaves = Math.abs(semitones) / 12;
    const amount = octaves === 1 ? 'una octava' : `${octaves} octavas`;
    return `Es ${pitchName(target, notation)}, pero ${amount} más ${semitones > 0 ? 'arriba' : 'abajo'}`;
  }
  if (!isBlackKey(target) && !isBlackKey(played)) {
    const steps =
      semitones > 0 ? countWhiteKeysBetween(target, played) : countWhiteKeysBetween(played, target);
    const amount = steps === 1 ? 'una tecla' : `${steps}${NBSP}teclas`;
    return `${amount} a la ${semitones > 0 ? 'derecha' : 'izquierda'}`;
  }
  return describeSemitones(semitones);
}

export function feedbackMessage(
  outcome: Exclude<Outcome, { kind: 'ignorado' }>,
  notation: NotationMode,
): FeedbackMessage {
  const name = (midi: Midi) => noteName(midi, notation);
  switch (outcome.kind) {
    case 'acierto':
      return { tone: 'ok', title: '¡Correcto!', detail: name(outcome.attempt.targetMidi) };
    case 'error': {
      // Por micrófono la app infiere la nota: dice «oí», no «tocaste».
      const verb = outcome.attempt.inputSource === 'microfono' ? 'oí' : 'tocaste';
      return {
        tone: 'error',
        title: 'Incorrecto',
        detail: `Era ${name(outcome.attempt.targetMidi)}, ${verb} ${name(outcome.attempt.playedMidi)} · ${describeMistake(outcome.attempt.targetMidi, outcome.attempt.playedMidi, notation)}`,
      };
    }
    case 'dudoso':
      return {
        tone: 'neutral',
        title: 'No te oí bien',
        detail: `Oí algo como ${name(outcome.heardMidi)}. Toca una sola tecla y déjala sonar.`,
      };
    case 'ronda-completa':
      return {
        tone: 'done',
        title: '¡Ronda completa!',
        detail: `${outcome.summary.firstTryCorrect} de ${outcome.summary.totalTargets} a la primera`,
      };
  }
}
