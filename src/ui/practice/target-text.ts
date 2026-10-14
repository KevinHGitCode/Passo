import type { ExerciseMode } from '@/core/domain/curriculum';
import { noteName, pitchName } from '@/core/domain/note';
import type { Midi, NotationMode } from '@/core/domain/note';
import type { ChordInfo, Finger, Hand, Target } from '@/core/domain/target';

/** «Do4 · Mi4 · Sol4». */
export function notesText(notes: readonly Midi[], notation: NotationMode): string {
  return notes.map((note) => noteName(note, notation)).join(' · ');
}

/** «Do · Mi · Sol» (sin octava). */
export function pitchesText(notes: readonly Midi[], notation: NotationMode): string {
  return notes.map((note) => pitchName(note, notation)).join(' · ');
}

/** «Do mayor» / «C major». */
export function chordName(chord: ChordInfo, notation: NotationMode): string {
  const root = pitchName(chord.root, notation);
  if (notation === 'latina') return `${root} ${chord.quality}`;
  return `${root} ${chord.quality === 'mayor' ? 'major' : 'minor'}`;
}

export function handText(hand: Hand): string {
  return hand === 'derecha' ? 'mano derecha' : 'mano izquierda';
}

/** «dedo 3» / «dedos 1 · 3 · 5». */
export function fingersText(fingers: readonly Finger[]): string {
  return `${fingers.length === 1 ? 'dedo' : 'dedos'} ${fingers.join(' · ')}`;
}

const PROMPTS: Readonly<Record<ExerciseMode, string>> = {
  notas: 'Toca esta nota',
  terceras: 'Toca esta tercera',
  acordes: 'Toca este acorde',
};
export function promptText(mode: ExerciseMode): string {
  return PROMPTS[mode];
}

/** Lo que se cuenta en la ronda: «Notas 3/20», «Terceras 3/12», «Acordes 3/12». */
const COUNT_LABELS: Readonly<Record<ExerciseMode, string>> = {
  notas: 'Notas',
  terceras: 'Terceras',
  acordes: 'Acordes',
};
export function countLabel(mode: ExerciseMode): string {
  return COUNT_LABELS[mode];
}

/** Segunda línea de la tarjeta del objetivo: nombre del acorde, mano y dedos. */
export function targetDetail(target: Target, notation: NotationMode): string {
  const parts: string[] = [];
  if (target.chord) parts.push(chordName(target.chord, notation));
  if (target.hand) parts.push(handText(target.hand));
  if (target.fingers.length > 0) parts.push(fingersText(target.fingers));
  return parts.join(' · ');
}
