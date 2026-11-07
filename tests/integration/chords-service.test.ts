import { describe, expect, it } from 'vitest';
import { ChordsService } from '@/core/application/chords-service';
import { StrumListener } from '@/core/application/strum-listener';
import { chordSpanish, chordSymbol, diagnoseNotes, matchChords } from '@/core/domain/chords';
import { FakeFrameSource } from '../fakes/fake-frame-source';
import { strum } from '../support/strum';
import { concat, guitarNote, silence } from '../support/synth';

function setup() {
  const frames = new FakeFrameSource();
  const listener = new StrumListener({ frames });
  const chords = new ChordsService({ listener });
  return { frames, chords };
}

const G = [43, 47, 50, 55, 59, 67];

describe('ChordsService · rasgueo completo', () => {
  it('al abrir escucha y al cerrar deja de escuchar', () => {
    const { frames, chords } = setup();
    chords.open();
    expect(frames.subscribers).toBe(1);
    expect(chords.getSnapshot()).toMatchObject({ open: true, mode: 'rasgueo', matches: [] });
    chords.close();
    expect(frames.subscribers).toBe(0);
    expect(chords.getSnapshot().open).toBe(false);
  });

  it('dice el acorde, las notas que oye y cada golpe con su dirección', () => {
    const { frames, chords } = setup();
    chords.open();
    frames.play(concat(silence(400), strum(G, { ms: 1300, t60: 2 }), silence(300)));
    const snapshot = chords.getSnapshot();
    const top = snapshot.matches[0];
    expect(top ? chordSymbol(top.chord) : '').toBe('G');
    expect(top ? chordSpanish(top.chord) : '').toBe('Sol mayor');
    expect(snapshot.heard.length).toBeGreaterThanOrEqual(3);
    expect(snapshot.strokes.map((stroke) => stroke.direction)).toEqual(['abajo']);
    expect(snapshot.muddy).toBe(false);
  });

  it('clear borra lo medido', () => {
    const { frames, chords } = setup();
    chords.open();
    frames.play(concat(silence(400), strum(G, { ms: 1300, t60: 2 })));
    chords.clear();
    expect(chords.getSnapshot()).toMatchObject({ strokes: [], matches: [], heard: [] });
  });
});

describe('ChordsService · cuerda por cuerda', () => {
  const stringsOf = (notes: readonly { midi: number; cents?: number }[]) =>
    concat(
      silence(300),
      ...notes.flatMap((note) => [
        guitarNote(note.midi, { ms: 1000, cents: note.cents ?? 0, amplitude: 0.3 }),
        silence(250),
      ]),
    );

  it('cada cuerda se mide y se empareja con el acorde: Sol mayor tocado nota a nota', () => {
    const { frames, chords } = setup();
    chords.open('cuerda');
    frames.play(stringsOf([{ midi: 43 }, { midi: 47 }, { midi: 50 }, { midi: 55 }]));
    const snapshot = chords.getSnapshot();
    expect(snapshot.played).toHaveLength(4);
    expect(snapshot.played.every((item) => item.status === 'bien')).toBe(true);
    const top = snapshot.matches[0];
    expect(top ? chordSymbol(top.chord) : '').toBe('G');
  });

  it('una cuerda desafinada se marca con sus cents (un Si 35 cents bajo en Sol mayor)', () => {
    const { frames, chords } = setup();
    chords.open('cuerda');
    frames.play(stringsOf([{ midi: 43 }, { midi: 47, cents: -35 }, { midi: 50 }, { midi: 55 }]));
    const flagged = chords.getSnapshot().played.filter((item) => item.status === 'desafinada');
    expect(flagged).toHaveLength(1);
    expect((flagged[0]?.note.midi ?? 0) % 12).toBe(11);
    expect(flagged[0]?.note.cents).toBeLessThan(-25);
  });

  it('cambiar de modo borra lo anterior', () => {
    const { frames, chords } = setup();
    chords.open('cuerda');
    frames.play(stringsOf([{ midi: 43 }, { midi: 47 }]));
    expect(chords.getSnapshot().played.length).toBeGreaterThan(0);
    chords.setMode('rasgueo');
    expect(chords.getSnapshot()).toMatchObject({ mode: 'rasgueo', played: [] });
  });
});

describe('diagnoseNotes', () => {
  const notesOf = (list: readonly [number, number][]) =>
    list.map(([midi, cents]) => ({ midi, cents }));
  const match = (midis: number[]) =>
    matchChords(midis.map((midi) => ({ midi, cents: 0, strength: 1 })))[0] ?? null;

  it('una nota del acorde dentro de ±20 cents está bien; fuera, desafinada', () => {
    const g = match([43, 47, 50]);
    const result = diagnoseNotes(
      notesOf([
        [43, 5],
        [47, -25],
        [50, 0],
      ]),
      g,
    );
    expect(result.map((item) => item.status)).toEqual(['bien', 'desafinada', 'bien']);
  });

  it('una nota ajena es «de más» y, si cae cerca de una nota que falta, se sugiere cuál era', () => {
    const g = match([43, 50]);
    expect(g ? chordSymbol(g.chord) : '').toBeTruthy();
    // Sol mayor sin Si: un Do♯ a +45 cents… no; un La♯ (Si bemol) a +40 cents está a 60 de Si.
    const gMajor = match([43, 47, 50]);
    const partial = gMajor ? { ...gMajor, missing: [11], extra: [] } : null;
    const result = diagnoseNotes(notesOf([[46, 45]]), partial);
    expect(result[0]).toMatchObject({ status: 'de-mas', maybe: 11 });
  });

  it('sin acorde que encaje, todo queda «bien»', () => {
    expect(diagnoseNotes(notesOf([[43, 0]]), null)[0]?.status).toBe('bien');
  });
});
