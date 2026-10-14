import { noteName, pitchClass, pitchName } from '@/core/domain/note';
import type { Midi, NotationMode } from '@/core/domain/note';
import type { TrackerHint } from '@/core/domain/note-tracker';
import type { MonitorSnapshot } from '@/core/ports/input-monitor';
import { describeSemitones } from '../practice/feedback-message';

/** Aviso para quien toca: por qué no se oye bien. Prioridad: saturado > débil > confuso > ruidoso. */
export function hintText(hint: TrackerHint): string {
  switch (hint) {
    case 'saturado':
      return 'Suena muy fuerte y se distorsiona. Baja el volumen del piano o aleja el portátil.';
    case 'debil':
      return 'Casi no te oigo. Toca más fuerte o acerca el portátil al teclado.';
    case 'confuso':
      return 'Te oigo, pero no distingo la nota. Toca una sola tecla y déjala sonar un momento.';
    case 'ruidoso':
      return 'Hay bastante ruido; puede fallar. Busca un lugar más silencioso.';
  }
}

/** Otros avisos del micrófono que no son un «no te oí» puntual. */
export function monitorNotice(monitor: MonitorSnapshot): string | null {
  if (monitor.hint) return hintText(monitor.hint);
  if (monitor.degraded) {
    return 'Tu navegador aplica filtros de audio al micrófono; puede fallar con notas largas.';
  }
  if (monitor.tuningOffsetCents !== null && Math.abs(monitor.tuningOffsetCents) >= 25) {
    const sign = monitor.tuningOffsetCents > 0 ? '+' : '−';
    return `Tu teclado suena ~${sign}${Math.abs(monitor.tuningOffsetCents)} cents fuera de 440 Hz: revisa «Tuning» en el piano.`;
  }
  return null;
}

export type CheckTone = 'espera' | 'ok' | 'octava' | 'otra';

export interface CheckResult {
  readonly tone: CheckTone;
  readonly text: string;
}

/**
 * Prueba rápida de la bienvenida: ¿oye Passo el Do central? Si no, explica la causa probable
 * (octava distinta o teclado transpuesto) en lugar de culpar a quien toca.
 */
export function checkMessage(
  heard: Midi | null,
  notation: NotationMode,
  expected: Midi = 60,
): CheckResult {
  if (heard === null) {
    return {
      tone: 'espera',
      text: `Toca el ${pitchName(expected, notation)} central de tu piano y déjalo sonar un momento.`,
    };
  }
  const name = noteName(heard, notation);
  if (heard === expected) return { tone: 'ok', text: `✓ Te oigo bien: ${name}` };
  if (pitchClass(heard) === pitchClass(expected)) {
    const octaves = Math.abs(heard - expected) / 12;
    const amount = octaves === 1 ? 'una octava' : `${octaves} octavas`;
    return {
      tone: 'octava',
      text: `Oigo ${name}: es un ${pitchName(expected, notation)}, pero ${amount} más ${heard > expected ? 'arriba' : 'abajo'}. Si tocaste el Do central, repítelo.`,
    };
  }
  return {
    tone: 'otra',
    text: `Oigo ${name}, ${describeSemitones(heard - expected)} que el Do central. ¿Tu teclado está transpuesto? Revisa «Transpose» en el piano.`,
  };
}
