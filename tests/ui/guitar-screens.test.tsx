// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { LessonFlow } from '@/core/application/lesson-flow';
import { PracticeSession } from '@/core/application/practice-session';
import { ProgressService } from '@/core/application/progress-service';
import { TunerService } from '@/core/application/tuner-service';
import { LEVEL_1_CONFIG } from '@/core/domain/exercise';
import type { PlayContext } from '@/core/domain/lessons';
import { PROGRESS_VERSION } from '@/core/domain/progress';
import { createSeededRng } from '@/core/domain/rng';
import { stringFrequency } from '@/core/domain/tuner';
import { CaminoScreen } from '@/ui/screens/CaminoScreen';
import { GuitarOffNote, LessonScreen } from '@/ui/screens/LessonScreen';
import { ProgressScreen } from '@/ui/screens/ProgressScreen';
import { TunerScreen } from '@/ui/screens/TunerScreen';
import { FakeCalendar } from '../fakes/fake-calendar';
import { FakeClock } from '../fakes/fake-clock';
import { FakeMicInput } from '../fakes/fake-mic-input';
import { FakeNoteInput } from '../fakes/fake-note-input';
import { FakePitch } from '../fakes/fake-pitch';
import { FakeProgressStore } from '../fakes/fake-progress-store';

const TODAY = '2026-10-29';
const MIC: PlayContext = { sources: ['microfono'], polyphonicMic: false };
const KEYBOARD: PlayContext = { sources: ['teclado-pc'], polyphonicMic: false };
/** Micrófono y teclado a la vez (modo de desarrollo): la lección se puede empezar y tocar. */
const BOTH: PlayContext = { sources: ['microfono', 'teclado-pc'], polyphonicMic: false };

afterEach(() => {
  cleanup();
  window.location.hash = '';
});
beforeEach(() => {
  window.location.hash = '#/';
});

function stored(options: {
  lessons?: Record<string, number>;
  keys?: Record<string, [number, number][]>;
  history?: { lesson: string; accuracy: number; rhythm: number }[];
}) {
  return {
    version: PROGRESS_VERSION,
    xp: 0,
    lessons: Object.fromEntries(
      Object.entries(options.lessons ?? {}).map(([id, stars]) => [
        id,
        { stars, accuracy: 900, rhythm: 200, plays: 1, day: TODAY },
      ]),
    ),
    keys: options.keys ?? {},
    daily: {},
    history: (options.history ?? []).map((entry) => ({ day: TODAY, ...entry })),
  };
}

function progressWith(seed: Parameters<typeof stored>[0] = {}) {
  const store = new FakeProgressStore(stored(seed));
  return { store, progress: new ProgressService(store, new FakeCalendar(TODAY)) };
}

const samples = (ok: number, miss: number): [number, number][] => [
  ...Array.from({ length: miss }, (): [number, number] => [0, 1500]),
  ...Array.from({ length: ok }, (): [number, number] => [1, 1500]),
];

describe('el camino de guitarra', () => {
  function setup(play: PlayContext = MIC, seed: Parameters<typeof stored>[0] = {}) {
    const { progress } = progressWith(seed);
    render(
      <CaminoScreen
        instrument="guitarra"
        progress={progress}
        play={play}
        notation="latina"
        onOpenSettings={vi.fn()}
      />,
    );
  }
  const node = (id: string) => screen.getByTestId(`node-${id}`);

  it('muestra las tres unidades y las 14 lecciones de guitarra, y ninguna de piano', () => {
    setup();
    expect(document.querySelectorAll('.unit')).toHaveLength(3);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toContain('Cuerdas al aire');
    expect(headings).toContain('Primeras notas');
    expect(headings).toContain('Todas las cuerdas');
    expect(document.querySelectorAll('[data-testid^="node-"]')).toHaveLength(14);
    expect(screen.queryByTestId('node-u1-1')).toBeNull();
  });

  it('la primera lección es la actual, con «Empieza aquí»', () => {
    setup();
    expect(node('g1-1').getAttribute('data-state')).toBe('actual');
    expect(within(node('g1-1')).getByText('Empieza aquí')).toBeTruthy();
    expect(node('g1-2').getAttribute('data-state')).toBe('bloqueada');
    expect(node('g2-1').getAttribute('data-state')).toBe('bloqueada');
  });

  it('lleva a la lección de guitarra', () => {
    setup();
    expect(within(node('g1-1')).getByRole('link').getAttribute('href')).toBe('#/leccion/g1-1');
  });

  it('con otra entrada que no sea el micrófono las lecciones se bloquean y dicen por qué', () => {
    setup(KEYBOARD);
    expect(node('g1-1').getAttribute('data-state')).toBe('bloqueada-entrada');
    fireEvent.click(within(node('g1-1')).getByRole('button'));
    expect(screen.getByTestId('explicacion').textContent).toContain('micrófono');
    expect(screen.getByTestId('explicacion').textContent).not.toContain('piano MIDI');
  });

  it('ofrece el afinador y no los puntos débiles de piano', () => {
    setup(MIC, { keys: { '60': samples(1, 7), '62': samples(1, 7) } });
    const card = screen.getByTestId('card-afinar');
    expect(card.querySelector('a')?.getAttribute('href')).toBe('#/afinador');
    expect(screen.queryByTestId('card-debiles')).toBeNull();
  });

  it('los puntos débiles son de guitarra, sin octava y con su repaso', () => {
    setup(MIC, { keys: { 'g:64': samples(1, 7), 'g:59': samples(1, 7), '60': samples(1, 7) } });
    const card = screen.getByTestId('card-debiles');
    const names = Array.from(card.querySelectorAll('.weak__name')).map((n) => n.textContent);
    expect(names.sort()).toEqual(['Mi', 'Si']);
    expect(screen.getByTestId('practicar-debiles').getAttribute('href')).toBe(
      '#/leccion/repaso-debiles-guitarra',
    );
  });

  it('terminar la unidad 1 abre la 2 y la 3 a la vez', () => {
    setup(MIC, {
      lessons: { 'g1-1': 1, 'g1-2': 1, 'g1-3': 1, 'g1-4': 1, 'g1-5': 1, 'g1-6': 1 },
    });
    expect(node('g2-1').getAttribute('data-state')).toBe('actual');
    expect(node('g3-1').getAttribute('data-state')).toBe('abierta');
  });

  it('en piano el camino sigue siendo el de siempre', () => {
    const { progress } = progressWith();
    render(
      <CaminoScreen
        progress={progress}
        play={KEYBOARD}
        notation="latina"
        onOpenSettings={vi.fn()}
      />,
    );
    expect(document.querySelectorAll('.unit')).toHaveLength(6);
    expect(screen.queryByTestId('card-afinar')).toBeNull();
  });
});

describe('una lección de guitarra', () => {
  function setup(
    options: { lessonId?: string; play?: PlayContext; seed?: Parameters<typeof stored>[0] } = {},
  ) {
    const pc = new FakeNoteInput('teclado-pc');
    const mic = new FakeMicInput();
    const clock = new FakeClock(1000);
    const session = new PracticeSession({
      inputs: [mic, pc],
      audio: { noteOn: () => undefined, noteOff: () => undefined },
      clock,
      rng: createSeededRng(5),
      config: LEVEL_1_CONFIG,
    });
    const { store, progress } = progressWith(options.seed);
    const play = options.play ?? BOTH;
    const flow = new LessonFlow({ session, progress, playContext: () => play });
    window.location.hash = `#/leccion/${options.lessonId ?? 'g1-1'}`;
    render(
      <LessonScreen
        lessonId={options.lessonId ?? 'g1-1'}
        flow={flow}
        session={session}
        progress={progress}
        play={play}
        microphone={play.sources.includes('microfono') ? mic : undefined}
        canStartWithoutMic={play.sources.some((source) => source !== 'microfono')}
        gear={<button type="button">Ajustes</button>}
        onOpenSettings={vi.fn()}
      />,
    );
    const start = () => fireEvent.click(screen.getByTestId('start'));
    /** Toca el objetivo con la octava que toque: exacta, una abajo o una arriba. */
    const playTarget = (turn: number) =>
      act(() => {
        const target = session.getSnapshot().exercise?.target.notes[0] ?? 64;
        clock.advance(1200);
        const played = [target, target - 12, target + 12][turn % 3] as number;
        pc.press(played, clock.now());
        pc.release(played, clock.now() + 5);
      });
    return { pc, mic, session, store, progress, flow, clock, start, playTarget };
  }

  it('la presentación da el consejo de la guitarra y no el de las notas graves del piano', () => {
    setup({ play: MIC });
    // La entrada es solo el micrófono: no hace falta repetirlo en la cabecera.
    expect(screen.queryByTestId('input-chip')).toBeNull();
    expect(screen.getByTestId('tip-guitar').textContent).toContain('afínala');
    expect(screen.queryByTestId('tip-low')).toBeNull();
    expect(screen.getByTestId('instrument-tag').textContent).toContain('Guitarra');
  });

  it('con el teclado del PC la lección no se puede empezar y dice que hace falta el micrófono', () => {
    setup({ play: KEYBOARD });
    const blocked = screen.getByTestId('lesson-blocked');
    expect(blocked.textContent).toContain('micrófono');
    expect(blocked.textContent).not.toContain('piano MIDI');
  });

  it('al empezar muestra el mástil con la nota de ahora y su nombre sin octava', () => {
    setup();
    fireEvent.click(screen.getByTestId('start'));
    expect(screen.getByTestId('guitar-board')).toBeTruthy();
    expect(document.querySelector('.piano')).toBeNull();
    expect(screen.getByTestId('fretboard').querySelectorAll('[data-kind="now"]')).toHaveLength(1);
    expect(screen.getByTestId('target-note').textContent).toMatch(/^(Mi|Si|Sol)$/);
    expect(screen.getByTestId('target-detail').textContent).toMatch(/^Cuerda [123] .*al aire$/);
  });

  it('tocar la nota en otra octava es acierto y el mensaje no lleva octava', () => {
    const { playTarget, session } = setup();
    fireEvent.click(screen.getByTestId('start'));
    playTarget(1);
    expect(session.getSnapshot().hits).toBe(1);
    expect(session.getSnapshot().errors).toBe(0);
    const feedback = screen.getByTestId('feedback');
    expect(feedback.getAttribute('data-tone')).toBe('ok');
    expect(feedback.textContent).toMatch(/Mi|Si|Sol/);
    expect(feedback.textContent).not.toMatch(/\d/);
  });

  it('el resultado ofrece el repaso de guitarra cuando hay notas de guitarra flojas, no el de piano', () => {
    const { playTarget, session } = setup({
      seed: { keys: { 'g:50': samples(0, 9), 'g:45': samples(0, 9) } },
    });
    fireEvent.click(screen.getByTestId('start'));
    let turn = 0;
    while (session.getSnapshot().phase === 'en-curso' && turn < 40) playTarget(turn++);
    expect(screen.getByTestId('result-review').getAttribute('href')).toBe(
      '#/leccion/repaso-debiles-guitarra',
    );
  });

  it('el resultado no ofrece repaso si las notas flojas son solo de piano', () => {
    const { playTarget, session } = setup({
      seed: { keys: { '60': samples(0, 9), '62': samples(0, 9) } },
    });
    fireEvent.click(screen.getByTestId('start'));
    let turn = 0;
    while (session.getSnapshot().phase === 'en-curso' && turn < 40) playTarget(turn++);
    expect(screen.getByTestId('result')).toBeTruthy();
    expect(screen.queryByTestId('result-review')).toBeNull();
  });

  it('«lo que más costó» sale sin octava', () => {
    const { playTarget, session, pc, clock } = setup();
    fireEvent.click(screen.getByTestId('start'));
    // Un error a propósito (otro nombre) y luego se termina bien.
    act(() => {
      clock.advance(1000);
      pc.press((session.getSnapshot().exercise?.target.notes[0] ?? 64) + 1, clock.now());
    });
    let turn = 0;
    while (session.getSnapshot().phase === 'en-curso' && turn < 40) playTarget(turn++);
    const hard = screen.getByTestId('result-hard').textContent ?? '';
    expect(hard).toMatch(/Lo que más costó: (Mi|Si|Sol)/);
    expect(hard).not.toMatch(/(Mi|Si|Sol)\d/);
  });

  it('terminar la ronda guarda la lección y las claves de guitarra', () => {
    const { playTarget, session, store } = setup();
    fireEvent.click(screen.getByTestId('start'));
    let turn = 0;
    while (session.getSnapshot().phase === 'en-curso' && turn < 40) playTarget(turn++);
    const saved = store.stored as { lessons: Record<string, { stars: number }>; keys: object };
    expect(saved.lessons['g1-1']?.stars).toBeGreaterThanOrEqual(1);
    expect(Object.keys(saved.keys).sort()).toEqual(['g:55', 'g:59', 'g:64']);
  });
});

describe('el progreso de guitarra', () => {
  function setup(seed: Parameters<typeof stored>[0]) {
    const { progress } = progressWith(seed);
    render(<ProgressScreen progress={progress} notation="latina" instrument="guitarra" />);
  }

  it('cuenta las lecciones de guitarra y usa solo su historial para las medias', () => {
    setup({
      lessons: { 'g1-1': 3, 'g1-2': 2, 'u1-1': 3 },
      history: [
        { lesson: 'g1-1', accuracy: 800, rhythm: 0 },
        { lesson: 'u1-1', accuracy: 1000, rhythm: 300 },
      ],
    });
    expect(screen.getByText('Guitarra: 2 de 14 lecciones hechas')).toBeTruthy();
    expect(screen.getByTestId('kpi-accuracy').textContent).toBe('80 %');
  });

  it('en lugar del mapa del teclado muestra las notas que más cuestan, sin octava', () => {
    setup({
      lessons: { 'g1-1': 1 },
      keys: { 'g:64': samples(2, 6), 'g:59': samples(7, 1), '60': samples(0, 8) },
    });
    expect(screen.getByRole('heading', { name: 'Notas que más cuestan' })).toBeTruthy();
    const list = screen.getByTestId('guitarra-notas');
    const names = Array.from(list.querySelectorAll('.weak__name')).map((n) => n.textContent);
    const values = Array.from(list.querySelectorAll('.weak__value')).map((n) => n.textContent);
    // De la más floja a la menos: Mi (2 de 8) antes que Si (7 de 8), cada una con su cuerda.
    expect(names).toEqual(['Mi · cuerda 1', 'Si · cuerda 2']);
    expect(values.every((value) => / % a la primera$/.test(value ?? ''))).toBe(true);
    expect(screen.queryByText('Mapa de tu teclado')).toBeNull();
  });

  it('sin intentos suficientes lo explica', () => {
    setup({ lessons: { 'g1-1': 1 }, keys: { 'g:64': samples(1, 1) } });
    expect(screen.getByTestId('guitarra-sin-datos')).toBeTruthy();
  });
});

describe('el afinador', () => {
  function setup() {
    const pitch = new FakePitch();
    const clock = new FakeClock(0);
    const tuner = new TunerService({ pitch, clock });
    const mic = new FakeMicInput();
    const view = render(<TunerScreen tuner={tuner} microphone={mic} notation="latina" />);
    /** Una lectura cada 20 ms con la desviación dada, contra la cuerda elegida. */
    const play = (string: 1 | 2 | 3 | 4 | 5 | 6, cents: number, ms: number) =>
      act(() => {
        const end = clock.now() + ms;
        while (clock.now() < end) {
          clock.advance(20);
          pitch.emit({
            frequency: stringFrequency(string) * 2 ** (cents / 1200),
            clarity: 0.95,
            at: clock.now(),
          });
        }
      });
    return { pitch, clock, tuner, mic, view, play };
  }

  it('al entrar abre el afinador, con la cuerda 1 (Mi) y las seis para elegir', () => {
    const { pitch, tuner } = setup();
    expect(tuner.getSnapshot().open).toBe(true);
    expect(pitch.searches).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Afinador' })).toBeTruthy();
    expect(screen.getByTestId('tuner-target').textContent).toContain('Mi');
    for (let n = 1; n <= 6; n++) expect(screen.getByTestId(`tuner-string-${n}`)).toBeTruthy();
    expect(screen.getByTestId('tuner-string-1').getAttribute('aria-pressed')).toBe('true');
  });

  it('al salir deja de medir', () => {
    const { pitch, view, tuner } = setup();
    view.unmount();
    expect(tuner.getSnapshot().open).toBe(false);
    expect(pitch.searches[pitch.searches.length - 1]).toBeNull();
  });

  it('con el micrófono apagado pide activarlo y lo enciende', () => {
    const { mic } = setup();
    expect(screen.getByTestId('tuner-mic').textContent).toContain('Activa el micrófono');
    fireEvent.click(screen.getByTestId('tuner-activate'));
    expect(mic.starts).toBe(1);
  });

  it('mientras calibra pide silencio y ya no ofrece activar', () => {
    const { mic } = setup();
    act(() => {
      mic.setStatus({ kind: 'conectado', deviceName: 'Micrófono de prueba' });
      mic.setMonitor({ phase: 'calibrando', calibration: 0.4 });
    });
    expect(screen.getByTestId('tuner-mic').textContent).toContain('silencio');
    expect(screen.queryByTestId('tuner-activate')).toBeNull();
  });

  it('elegir otra cuerda cambia el nombre y marca el botón', () => {
    const { mic } = setup();
    act(() => mic.makeReady());
    fireEvent.click(screen.getByTestId('tuner-string-3'));
    expect(screen.getByTestId('tuner-string-3').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('tuner-string-1').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('tuner-target').textContent).toContain('Sol');
    expect(document.body.textContent).toContain('Toca la cuerda 3 (Sol) al aire');
  });

  it('dice «grave» con los cents, y luego «afinada» tras sostenerla', () => {
    const { mic, play } = setup();
    act(() => mic.makeReady());
    play(1, -20, 500);
    expect(screen.getByTestId('tuner-reading').textContent).toBe('Grave · 20 cents');
    expect(document.body.textContent).toContain('Aprieta un poco la clavija');
    play(1, 1, 1000);
    expect(screen.getByTestId('tuner-reading').textContent).toBe('Afinada');
  });

  it('dice «aguda» y «muy aguda»', () => {
    const { mic, play } = setup();
    act(() => mic.makeReady());
    play(1, 25, 500);
    expect(screen.getByTestId('tuner-reading').textContent).toBe('Aguda · 25 cents');
    expect(document.body.textContent).toContain('Afloja un poco la clavija');
    play(1, 90, 1000);
    expect(screen.getByTestId('tuner-reading').textContent).toContain('Muy aguda');
  });

  it('el lector de pantalla oye solo el estado, nunca los cents, y solo si se mantiene', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { mic, play } = setup();
      act(() => mic.makeReady());
      play(1, -20, 500);
      const live = screen.getByTestId('tuner-live');
      // Todavía no se mantuvo lo bastante: nada que anunciar.
      expect(live.textContent).toBe('');
      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(live.textContent).toBe('Grave, cuerda 1');
      play(1, -30, 200);
      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(live.textContent).toBe('Grave, cuerda 1');
      expect(live.textContent).not.toMatch(/\d{2}/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('al conectarse el micrófono el foco pasa a la cuerda elegida (no se pierde)', () => {
    const { mic } = setup();
    const activate = screen.getByTestId('tuner-activate');
    activate.focus();
    expect(document.activeElement).toBe(activate);
    act(() => mic.makeReady());
    expect(screen.queryByTestId('tuner-activate')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('tuner-string-1'));
  });
});

describe('la guitarra desafinada', () => {
  it('avisa de cuántos semitonos suenan mal y manda al afinador', () => {
    const { rerender } = render(<GuitarOffNote semitones={-1} />);
    expect(document.body.textContent).toContain('1 semitono más graves');
    expect(document.body.textContent).toContain('desafinada');
    expect(screen.getByRole('link', { name: 'Abre el afinador' }).getAttribute('href')).toBe(
      '#/afinador',
    );
    rerender(<GuitarOffNote semitones={2} />);
    expect(document.body.textContent).toContain('2 semitonos más agudos');
  });
});

describe('el afinador avisa si apenas se oye', () => {
  it('con el micrófono flojo, el aviso en vez de la indicación de tocar', () => {
    const pitch = new FakePitch();
    const tuner = new TunerService({ pitch, clock: new FakeClock(0) });
    const mic = new FakeMicInput();
    render(<TunerScreen tuner={tuner} microphone={mic} notation="latina" />);
    act(() => {
      mic.makeReady();
      mic.setMonitor({ hint: 'debil' });
    });
    expect(document.body.textContent).toContain('acerca');
    expect(document.body.textContent).not.toContain('al aire y déjala sonar');
  });
});
