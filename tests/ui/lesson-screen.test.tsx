// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { LessonFlow } from '@/core/application/lesson-flow';
import { PracticeSession } from '@/core/application/practice-session';
import { ProgressService } from '@/core/application/progress-service';
import { LEVEL_1_CONFIG } from '@/core/domain/exercise';
import type { PlayContext } from '@/core/domain/lessons';
import { createSeededRng } from '@/core/domain/rng';
import { LessonScreen } from '@/ui/screens/LessonScreen';
import { FakeCalendar } from '../fakes/fake-calendar';
import { FakeClock } from '../fakes/fake-clock';
import { FakeMicInput } from '../fakes/fake-mic-input';
import { FakeNoteInput } from '../fakes/fake-note-input';
import { FakeProgressStore } from '../fakes/fake-progress-store';

const KEYBOARD: PlayContext = { sources: ['teclado-pc'], polyphonicMic: false };
const MIC: PlayContext = { sources: ['microfono'], polyphonicMic: false };

beforeEach(() => {
  window.location.hash = '#/leccion/u2-1';
});
afterEach(() => {
  cleanup();
  window.location.hash = '';
  // @ts-expect-error: se restaura el entorno de jsdom (sin matchMedia)
  delete window.matchMedia;
});

interface SetupOptions {
  lessonId?: string;
  play?: PlayContext;
  mic?: boolean;
  stored?: unknown;
}

function setup(options: SetupOptions = {}) {
  const pc = new FakeNoteInput('teclado-pc');
  const mic = options.mic ? new FakeMicInput() : undefined;
  const clock = new FakeClock(1000);
  const session = new PracticeSession({
    inputs: mic ? [mic, pc] : [pc],
    audio: { noteOn: () => undefined, noteOff: () => undefined },
    clock,
    rng: createSeededRng(3),
    config: LEVEL_1_CONFIG,
  });
  const store = new FakeProgressStore(options.stored ?? null);
  const progress = new ProgressService(store, new FakeCalendar('2026-10-26'));
  const play = options.play ?? KEYBOARD;
  const flow = new LessonFlow({ session, progress, playContext: () => play });
  const onOpenSettings = vi.fn();
  render(
    <LessonScreen
      lessonId={options.lessonId ?? 'u2-1'}
      flow={flow}
      session={session}
      progress={progress}
      play={play}
      microphone={mic}
      canStartWithoutMic={play.sources.some((source) => source !== 'microfono')}
      gear={<button type="button">Ajustes</button>}
      onOpenSettings={onOpenSettings}
    />,
  );
  /** Pulsa y suelta lo que pide el objetivo (bien), un objetivo por segundo. */
  const playCorrect = (ms = 1000) => {
    act(() => {
      const target = session.getSnapshot().exercise?.target.notes ?? [];
      clock.advance(ms);
      for (const note of target) pc.press(note, clock.now());
      for (const note of target) pc.release(note, clock.now() + 5);
    });
  };
  const playWrong = () => {
    act(() => {
      const target = session.getSnapshot().exercise?.target.notes[0] ?? 60;
      clock.advance(1000);
      pc.press(target === 77 ? 79 : 77, clock.now());
    });
  };
  const finishRound = (ms = 1000) => {
    while (session.getSnapshot().phase === 'en-curso') playCorrect(ms);
  };
  return {
    pc,
    mic,
    session,
    store,
    progress,
    flow,
    clock,
    onOpenSettings,
    playCorrect,
    playWrong,
    finishRound,
  };
}

describe('lección · antes de empezar', () => {
  it('queda lista: presenta la lección y espera a «Empezar» (no arranca sola)', () => {
    const { session, flow } = setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Do · Si · La' })).toBeTruthy();
    const intro = screen.getByTestId('lesson-intro');
    expect(intro.textContent).toContain('Lección nueva');
    expect(intro.textContent).toContain('10 notas');
    expect(intro.textContent).toContain('3.ª estrella: 95 % y 12 notas/min');
    expect(screen.getByTestId('start')).toBeTruthy();
    expect(flow.getSnapshot().status).toBe('lista');
    expect(session.getSnapshot().phase).toBe('inactiva');
    expect(screen.queryByTestId('target')).toBeNull();
  });

  it('el foco entra en el título de la lección', () => {
    setup();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
  });

  it('la cabecera lleva la salida, el progreso en 0 de 10, la entrada y el engranaje', () => {
    setup();
    expect(screen.getByTestId('lesson-exit')).toBeTruthy();
    const bar = screen.getByTestId('lesson-progress');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('10');
    expect(bar.querySelectorAll('.lesson__segment')).toHaveLength(10);
    expect(screen.getByTestId('input-chip').textContent).toBe('Teclado del PC');
    expect(screen.getByRole('button', { name: 'Ajustes' })).toBeTruthy();
  });

  it('las marcas empiezan en «—» y muestran la meta de la 3.ª estrella', () => {
    setup();
    expect(screen.getByTestId('stat-accuracy').textContent).toContain('—');
    expect(screen.getByTestId('stat-rhythm').textContent).toContain('—');
    expect(screen.getByTestId('stat-goal').textContent).toContain('95 % y 12 notas/min');
  });

  it('con el teclado del PC dice qué teclas tocar (mano izquierda en esta lección)', () => {
    setup();
    expect(screen.getByTestId('pc-hint').textContent).toContain('Z X C V B N M');
  });

  it('una lección que no existe lo dice y vuelve al camino', () => {
    setup({ lessonId: 'u9-9' });
    expect(screen.getByRole('heading', { name: 'No encuentro esa lección' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver al camino' }).getAttribute('href')).toBe('#/');
  });

  it('el repaso de puntos débiles sin datos explica que todavía no hay nada', () => {
    setup({ lessonId: 'repaso-debiles' });
    expect(screen.getByText(/Todavía no hay nada que repasar/)).toBeTruthy();
  });
});

describe('lección · según la entrada', () => {
  it('terceras con micrófono sin la beta no se pueden empezar: explica y ofrece los ajustes', () => {
    const { onOpenSettings, flow } = setup({ lessonId: 'u6-1', play: MIC, mic: true });
    const block = screen.getByTestId('lesson-blocked');
    expect(block.textContent).toContain('piano MIDI o teclado del PC');
    expect(screen.queryByTestId('start')).toBeNull();
    fireEvent.click(within(block).getByRole('button', { name: 'Abrir ajustes' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(flow.begin()).toBe(false);
  });

  it('con micrófono, una lección de notas muestra el panel para activarlo', () => {
    const { mic } = setup({ play: MIC, mic: true });
    expect(screen.getByTestId('activate-mic')).toBeTruthy();
    expect(screen.queryByTestId('start')).toBeNull();
    fireEvent.click(screen.getByTestId('activate-mic'));
    expect(mic?.starts).toBe(1);
    expect(screen.getByTestId('input-chip').textContent).toBe('Micrófono');
  });

  it('con el micrófono listo se puede empezar desde su panel', () => {
    const { mic, flow } = setup({ play: MIC, mic: true });
    act(() => mic?.makeReady());
    fireEvent.click(screen.getByTestId('start'));
    expect(flow.getSnapshot().status).toBe('en-curso');
  });
});

describe('lección · la ronda', () => {
  it('«Empezar» arranca la ronda: aparece el objetivo y el teclado con su cascada', () => {
    const { flow } = setup();
    fireEvent.click(screen.getByTestId('start'));
    expect(flow.getSnapshot().status).toBe('en-curso');
    expect(screen.getByTestId('target')).toBeTruthy();
    expect(screen.getByTestId('target-note').getAttribute('data-midi')).toMatch(/^\d+$/);
    expect(screen.getByTestId('target-detail').textContent).toContain('mano izquierda');
    expect(screen.queryByTestId('lesson-intro')).toBeNull();
    expect(screen.getByTestId('stage-idle').textContent).toBe('Esperando tu nota…');
  });

  it('cada acierto llena un tramo de la barra y avanza al siguiente objetivo', () => {
    const { playCorrect } = setup();
    fireEvent.click(screen.getByTestId('start'));
    playCorrect();
    playCorrect();
    expect(screen.getByTestId('lesson-progress').getAttribute('aria-valuenow')).toBe('2');
    expect(
      screen.getByTestId('lesson-progress').querySelectorAll('[data-done="true"]'),
    ).toHaveLength(2);
    expect(screen.getByTestId('counters').textContent).toContain('Errores 0');
  });

  it('la precisión y el ritmo aparecen al tercer acierto', () => {
    const { playCorrect } = setup();
    fireEvent.click(screen.getByTestId('start'));
    playCorrect();
    playCorrect();
    expect(screen.getByTestId('stat-accuracy').textContent).toContain('—');
    playCorrect();
    expect(screen.getByTestId('stat-accuracy').textContent).toContain('100 %');
    expect(screen.getByTestId('stat-rhythm').textContent).toContain('60');
  });

  it('un error muestra la barra de respuesta en rojo y cuenta el error', () => {
    const { playWrong } = setup();
    fireEvent.click(screen.getByTestId('start'));
    playWrong();
    const feedback = screen.getByTestId('feedback');
    expect(feedback.getAttribute('data-tone')).toBe('error');
    expect(feedback.className).toContain('game-answer--error');
    expect(screen.getByTestId('counters').textContent).toContain('Errores 1');
  });

  it('un acierto muestra la barra en verde', () => {
    const { playCorrect } = setup();
    fireEvent.click(screen.getByTestId('start'));
    playCorrect();
    expect(screen.getByTestId('feedback').getAttribute('data-tone')).toBe('ok');
  });

  it('en pausa la barra avisa y ofrece continuar', () => {
    const { session } = setup();
    fireEvent.click(screen.getByTestId('start'));
    act(() => session.pause());
    expect(screen.getByTestId('paused').textContent).toContain('Ronda en pausa');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(session.getSnapshot().phase).toBe('en-curso');
  });

  it('un aviso para lectores de pantalla dice qué hay que tocar', () => {
    setup();
    fireEvent.click(screen.getByTestId('start'));
    expect(screen.getByTestId('live').textContent).toMatch(/^Toca /);
  });
});

describe('lección · salir', () => {
  it('sin aciertos, la X vuelve al camino directamente', () => {
    setup();
    fireEvent.click(screen.getByTestId('start'));
    window.location.hash = '#/leccion/u2-1';
    fireEvent.click(screen.getByTestId('lesson-exit'));
    expect(window.location.hash).toBe('#/');
    expect(screen.queryByTestId('exit-dialog')).toBeNull();
  });

  it('con la ronda a medias pregunta y la deja en pausa', () => {
    const { session, playCorrect } = setup();
    fireEvent.click(screen.getByTestId('start'));
    playCorrect();
    fireEvent.click(screen.getByTestId('lesson-exit'));
    const dialog = screen.getByTestId('exit-dialog');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(session.getSnapshot().phase).toBe('pausada');
    expect(document.activeElement).toBe(screen.getByTestId('exit-continue'));
    expect(window.location.hash).toBe('#/leccion/u2-1');
  });

  it('«Seguir» cierra el diálogo y reanuda la ronda', () => {
    const { session, playCorrect } = setup();
    fireEvent.click(screen.getByTestId('start'));
    playCorrect();
    fireEvent.click(screen.getByTestId('lesson-exit'));
    fireEvent.click(screen.getByTestId('exit-continue'));
    expect(screen.queryByTestId('exit-dialog')).toBeNull();
    expect(session.getSnapshot().phase).toBe('en-curso');
  });

  it('Esc equivale a seguir', () => {
    const { session, playCorrect } = setup();
    fireEvent.click(screen.getByTestId('start'));
    playCorrect();
    fireEvent.click(screen.getByTestId('lesson-exit'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('exit-dialog')).toBeNull();
    expect(session.getSnapshot().phase).toBe('en-curso');
  });

  it('«Salir sin guardar» lleva al camino y no se guarda nada', () => {
    const { store, playCorrect } = setup();
    fireEvent.click(screen.getByTestId('start'));
    playCorrect();
    fireEvent.click(screen.getByTestId('lesson-exit'));
    fireEvent.click(screen.getByTestId('exit-leave'));
    expect(window.location.hash).toBe('#/');
    expect(store.saves).toHaveLength(0);
  });

  it('el tabulador no sale del diálogo', () => {
    const { playCorrect } = setup();
    fireEvent.click(screen.getByTestId('start'));
    playCorrect();
    fireEvent.click(screen.getByTestId('lesson-exit'));
    const leave = screen.getByTestId('exit-leave');
    leave.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByTestId('exit-continue'));
  });
});

describe('lección · el resultado', () => {
  it('al terminar muestra el resultado con estrellas, marcas y experiencia', () => {
    const { finishRound, flow, store } = setup();
    fireEvent.click(screen.getByTestId('start'));
    finishRound();
    expect(flow.getSnapshot().status).toBe('resultado');
    expect(screen.getByTestId('result')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: '¡Lección completa!' })).toBeTruthy();
    expect(screen.getByRole('img', { name: '3 de 3 estrellas' })).toBeTruthy();
    expect(screen.getByTestId('result-accuracy').textContent).toBe('100 %');
    expect(screen.getByTestId('result-xp').textContent).toContain('+130');
    expect(screen.getByTestId('result-time').textContent).toBe('0:09');
    expect(store.saves).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
  });

  it('lo que más costó dice cuál fue (y sin fallos, que nada se atragantó)', () => {
    const { finishRound } = setup();
    fireEvent.click(screen.getByTestId('start'));
    finishRound();
    expect(screen.getByTestId('result-hard').textContent).toContain('Nada se te atragantó');
  });

  it('con un fallo, nombra la nota que más costó', () => {
    const { finishRound, playWrong, session } = setup();
    fireEvent.click(screen.getByTestId('start'));
    const failed = session.getSnapshot().exercise?.target.notes[0] ?? 0;
    playWrong();
    finishRound();
    const text = screen.getByTestId('result-hard').textContent ?? '';
    expect(text).toContain('Lo que más costó');
    expect(text).toContain('Fallaste 1 vez');
    expect(failed).toBeGreaterThan(0);
  });

  it('un anuncio único para lectores de pantalla resume estrellas, experiencia y racha', () => {
    const { finishRound } = setup();
    fireEvent.click(screen.getByTestId('start'));
    finishRound();
    const status = screen
      .getAllByRole('status')
      .find((el) => el.textContent?.includes('estrellas'));
    expect(status?.textContent).toContain('Conseguiste 3 de 3 estrellas.');
    expect(status?.textContent).toContain('Ganaste 130 puntos de experiencia.');
    expect(status?.textContent).toContain('Racha de 1 día.');
  });

  it('«Continuar» es un enlace al camino', () => {
    const { finishRound } = setup();
    fireEvent.click(screen.getByTestId('start'));
    finishRound();
    expect(screen.getByTestId('result-continue').getAttribute('href')).toBe('#/');
  });

  it('«Repetir para…» deja la lección lista otra vez; sin 3.ª estrella pide mejorar', () => {
    const { finishRound, flow } = setup();
    fireEvent.click(screen.getByTestId('start'));
    finishRound();
    // Con las 3 estrellas el botón solo dice «Repetir».
    expect(screen.getByTestId('result-retry').textContent).toBe('Repetir');
    fireEvent.click(screen.getByTestId('result-retry'));
    expect(flow.getSnapshot().status).toBe('lista');
    expect(screen.getByTestId('lesson-intro')).toBeTruthy();
  });

  it('con 2 estrellas el botón anima a la 3.ª y se ve cuánto falta', () => {
    const { finishRound, playWrong, playCorrect, session } = setup();
    fireEvent.click(screen.getByTestId('start'));
    // Dos fallos en objetivos distintos: 80 % (2 estrellas en una lección nueva).
    playWrong();
    playCorrect();
    playWrong();
    playCorrect();
    finishRound();
    expect(session.getSnapshot().phase).toBe('completada');
    expect(screen.getByRole('img', { name: '2 de 3 estrellas' })).toBeTruthy();
    expect(screen.getByTestId('result-retry').textContent).toBe('Repetir para la 3.ª ★');
    expect(screen.getByTestId('result').textContent).toContain('Para la 3.ª ★: 95 %');
  });

  it('el ritmo mejor se celebra solo si ya se había jugado antes', () => {
    const { finishRound, flow } = setup();
    fireEvent.click(screen.getByTestId('start'));
    finishRound(2000);
    expect(screen.queryByText('Tu mejor marca')).toBeNull();
    act(() => flow.retry());
    fireEvent.click(screen.getByTestId('start'));
    finishRound(1000);
    expect(screen.getByTestId('result').textContent).toContain('Tu mejor marca');
  });
});
