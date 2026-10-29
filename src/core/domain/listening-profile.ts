import type { Instrument } from './instrument';
import type { TrackerConfig } from './note-tracker';

/**
 * Cómo escucha el micrófono según el instrumento. El rastreador de notas viene ajustado al piano (rango
 * Do3–Do6 y heurísticas de octava y de rebote pensadas para sus cuerdas); la guitarra suena en otro rango
 * y sus cuerdas graves vibran mucho más tiempo, así que usa su propio perfil.
 */
export type ListeningProfile = Instrument;

/** Piano: la configuración de siempre. */
const PIANO_CONFIG: Partial<TrackerConfig> = {};

/**
 * Guitarra:
 * - rango Re2–Sol5 (`minMidi` 38 deja margen a un Mi2 floja: se descartaría si pasara de 50 cents);
 * - el mismo nombre de nota no se vuelve a abrir antes de 1,2 s y un ataque pide más subida y más
 *   separación (las cuerdas graves de acero suenan 3 a 6 s y, con un micrófono que recorta los graves,
 *   producían 2 a 5 «ataques fantasma» por pulsación que contaban como errores);
 * - no aprende la «afinación del teclado»: una cuerda floja no es un instrumento desviado (para eso
 *   está el afinador).
 */
const GUITAR_CONFIG: Partial<TrackerConfig> = {
  minMidi: 38,
  maxMidi: 79,
  sameNoteRetriggerMs: 1200,
  onsetRatio: 1.8,
  refractoryMs: 250,
  learnTuning: false,
};

export function trackerConfigFor(profile: ListeningProfile): Partial<TrackerConfig> {
  return profile === 'guitarra' ? GUITAR_CONFIG : PIANO_CONFIG;
}
