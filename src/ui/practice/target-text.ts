import type { ExerciseMode } from '@/core/domain/curriculum';
import type { FretPosition, GuitarFinger } from '@/core/domain/instrument';
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

const FINGER_NAMES: Readonly<Record<GuitarFinger, string>> = {
  1: 'el índice',
  2: 'el medio',
  3: 'el anular',
  4: 'el meñique',
};

/** «Cuerda 1 (la más aguda) · traste 1 · dedo 1, el índice» / «Cuerda 3 · al aire». */
export function positionText(position: FretPosition): string {
  const string =
    position.string === 1
      ? 'Cuerda 1 (la más aguda)'
      : position.string === 6
        ? 'Cuerda 6 (la más grave)'
        : `Cuerda ${position.string}`;
  const fret = position.fret === 0 ? 'al aire' : `traste ${position.fret}`;
  const finger =
    position.finger === null ? null : `dedo ${position.finger}, ${FINGER_NAMES[position.finger]}`;
  return [string, fret, finger].filter((part) => part !== null).join(' · ');
}

/** Teclas del PC que hacen de piano: la fila de arriba (mano derecha) y la de abajo (mano izquierda). */
export function pcKeysText(hand: Hand): string {
  return hand === 'izquierda'
    ? 'Teclado del PC: Z X C V B N M = Do3 Re3 Mi3 Fa3 Sol3 La3 Si3 · A S D F = Do4 Re4 Mi4 Fa4'
    : 'Teclado del PC: A S D F G H J K L ; = Do4 Re4 Mi4 Fa4 Sol4 La4 Si4 Do5 Re5 Mi5';
}
