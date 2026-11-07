import { describe, expect, it } from 'vitest';
import { SongService } from '@/core/application/song-service';
import { StrumListener } from '@/core/application/strum-listener';
import { findSong } from '@/core/domain/songs';
import { FakeFrameSource } from '../fakes/fake-frame-source';
import { FakeNoteInput } from '../fakes/fake-note-input';
import { strum } from '../support/strum';

const G = [43, 47, 50, 55, 59, 67];
const C = [48, 52, 55, 60, 64];
const D7 = [50, 57, 60, 66];

const BEAT = 60000 / 70;
/** «↓ ↓↑ ↑↓↑»: en qué pulso va cada golpe y hacia dónde. */
const PATTERN: readonly { beat: number; down: boolean }[] = [
  { beat: 0, down: true },
  { beat: 1, down: true },
  { beat: 1.5, down: false },
  { beat: 2.5, down: false },
  { beat: 3, down: true },
  { beat: 3.5, down: false },
];

interface Stroke {
  readonly at: number;
  readonly notes: readonly number[];
  readonly down: boolean;
}

/** El compás de un acorde: sus golpes desde `start` (ms), con los de arriba un poco más suaves. */
function bar(
  notes: readonly number[],
  start: number,
  options: { only?: readonly number[]; allDown?: boolean } = {},
): Stroke[] {
  return PATTERN.flatMap((item, index) =>
    options.only && !options.only.includes(index)
      ? []
      : [{ at: start + item.beat * BEAT, notes, down: options.allDown ? true : item.down }],
  );
}

function signal(strokes: readonly Stroke[]): Float32Array {
  const total = Math.max(...strokes.map((s) => s.at)) + 1600;
  const out = new Float32Array(Math.round((total / 1000) * 48000));
  for (const stroke of strokes) {
    const ordered = stroke.down ? stroke.notes : [...stroke.notes].reverse();
    const sound = strum(ordered, {
      spacingMs: 9,
      ms: 1400,
      amplitude: stroke.down ? 0.18 : 0.14,
      t60: 2,
    });
    const start = Math.round((stroke.at / 1000) * 48000);
    for (let i = 0; i < sound.length && start + i < out.length; i++) {
      out[start + i] = (out[start + i] as number) + (sound[i] as number);
    }
  }
  return out;
}

function setup() {
  const frames = new FakeFrameSource();
  const strums = new StrumListener({ frames });
  const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
  const schedule = (run: () => void, ms: number) => {
    const item = { run, ms, cancelled: false };
    timers.push(item);
    return () => {
      item.cancelled = true;
    };
  };
  const songs = new SongService({ input: new FakeNoteInput('microfono'), strums, schedule });
  const song = findSong('de-colores');
  if (!song) throw new Error('falta la canción');
  songs.open(song);
  const closeBar = () => {
    for (const timer of timers.splice(0)) if (!timer.cancelled) timer.run();
  };
  return { frames, songs, song, closeBar, timers };
}

describe('SongService · rasgueo de un acorde', () => {
  it('abrir una canción de acordes empieza a oír golpes; una melodía no', () => {
    const frames = new FakeFrameSource();
    const songs = new SongService({ strums: new StrumListener({ frames }) });
    const melody = findSong('cumpleanos-feliz');
    const chords = findSong('de-colores');
    if (!melody || !chords) throw new Error('falta');
    songs.open(melody);
    expect(frames.subscribers).toBe(0);
    songs.open(chords);
    expect(frames.subscribers).toBe(1);
    songs.close();
    expect(frames.subscribers).toBe(0);
  });

  it('un compás bien tocado: el acorde y los seis golpes, y pasa al siguiente acorde', () => {
    const { frames, songs } = setup();
    // El primer golpe del compás de Do (el siguiente acorde) llega a su hora.
    frames.play(signal([...bar(G, 500), { at: 500 + 4 * BEAT, notes: C, down: true }]));
    const snapshot = songs.getSnapshot();
    const first = snapshot.bars[0];
    expect(first?.chord?.status).toBe('bien');
    expect(first?.judgement).toMatchObject({ ok: 6, total: 6, extra: 0 });
    expect(snapshot.feedback?.text).toContain('Rasgueo perfecto');
    // Ya está en el compás de Do, con su primer golpe tocado.
    expect(snapshot.index).toBe(1);
    expect(snapshot.live?.strokes).toHaveLength(1);
    // Lo que tardó en llegar al cambio de acorde: a tiempo.
    expect(snapshot.results[1]).toBeNull();
  });

  it('el cambio de acorde se juzga por lo que tardó el primer golpe del siguiente', () => {
    const { frames, songs } = setup();
    // El Do llega 2 s tarde.
    frames.play(signal([...bar(G, 500), { at: 500 + 4 * BEAT + 2000, notes: C, down: true }]));
    expect(songs.getSnapshot().feedback?.text).toContain('Rasgueo perfecto');
    const result = songs.getSnapshot().results;
    expect(result[1]).toBeNull();
    // El juicio del cambio se dice al cerrar el compás de Do.
  });

  it('un acorde distinto del pedido se dice: «Oí C y pedía G»', () => {
    const { frames, songs } = setup();
    frames.play(signal([...bar(C, 500), { at: 500 + 4 * BEAT, notes: G, down: true }]));
    const first = songs.getSnapshot().bars[0];
    expect(first?.chord?.status).toBe('otro');
    expect(first?.chord?.heard).toBe('C');
    expect(songs.getSnapshot().feedback?.text).toContain('Oí C y pedía G');
  });

  it('un golpe que falta se dice (faltó el 4.º) y se cierra el compás por el temporizador', () => {
    const { frames, songs, closeBar } = setup();
    frames.play(signal(bar(G, 500, { only: [0, 1, 2, 4, 5] })));
    // Aún no hay seis golpes: el compás sigue abierto hasta que el temporizador lo cierra.
    expect(songs.getSnapshot().index).toBe(0);
    closeBar();
    const snapshot = songs.getSnapshot();
    expect(snapshot.bars[0]?.judgement.ok).toBe(5);
    expect(snapshot.bars[0]?.judgement.strokes[3]).toMatchObject({ ok: false, why: 'falta' });
    expect(snapshot.feedback?.text).toContain('5 de 6 golpes bien');
    expect(snapshot.feedback?.text).toContain('faltó el golpe 4');
    expect(snapshot.index).toBe(1);
  });

  it('un golpe en la dirección contraria se dice (todo hacia abajo: el 3.º debía ir hacia arriba)', () => {
    const { frames, songs, closeBar } = setup();
    frames.play(signal(bar(G, 500, { allDown: true })));
    closeBar();
    const judgement = songs.getSnapshot().bars[0]?.judgement;
    expect(judgement?.strokes[2]).toMatchObject({
      ok: false,
      why: 'direccion',
      expected: 'arriba',
    });
    expect(songs.getSnapshot().feedback?.text).toContain('el golpe 3 debía ir hacia arriba');
  });

  it('una nota suelta del micrófono no avanza un paso de acorde', () => {
    const frames = new FakeFrameSource();
    const input = new FakeNoteInput('microfono');
    const songs = new SongService({ input, strums: new StrumListener({ frames }) });
    const song = findSong('de-colores');
    if (!song) throw new Error('falta');
    songs.open(song);
    input.emitEvent({ type: 'on', note: 43, velocity: 80, at: 100, source: 'microfono' });
    expect(songs.getSnapshot().index).toBe(0);
  });

  it('el Re7 se reconoce (el acorde que fallaba antes)', () => {
    const { frames, songs, song, closeBar } = setup();
    // Se salta a un compás de Re7: se tocan G, C, G y luego D7.
    const steps = song.steps;
    expect(steps[3]?.kind === 'acorde' && steps[3].chord).toBe('D7');
    const start = 500;
    frames.play(
      signal([
        ...bar(G, start),
        ...bar(C, start + 4 * BEAT),
        ...bar(G, start + 8 * BEAT),
        ...bar(D7, start + 12 * BEAT),
      ]),
    );
    closeBar();
    const bars = songs.getSnapshot().bars;
    expect(bars[0]?.chord?.status).toBe('bien');
    expect(bars[1]?.chord?.status).toBe('bien');
    expect(bars[2]?.chord?.status).toBe('bien');
    expect(bars[3]?.chord?.status).toBe('bien');
  });
});
