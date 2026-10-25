// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { PracticeSession } from '@/core/application/practice-session';
import { roundConfigFor } from '@/core/domain/exercise';
import type { RoundConfig } from '@/core/domain/exercise';
import { createSeededRng } from '@/core/domain/rng';
import { PracticeScreen } from '@/ui/practice/PracticeScreen';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';

afterEach(cleanup);

function setup(config: RoundConfig, roundSize = 3) {
  const input = new FakeNoteInput('teclado-pc');
  const session = new PracticeSession({
    inputs: [input],
    audio: { noteOn: () => undefined, noteOff: () => undefined },
    clock: new FakeClock(0),
    rng: createSeededRng(3),
    config: { ...config, roundSize },
  });
  render(<PracticeScreen session={session} />);
  const press = (note: number, at = 100) => act(() => input.press(note, at));
  const release = (note: number, at = 200) => act(() => input.release(note, at));
  const start = () => fireEvent.click(screen.getByTestId('start'));
  const midis = () =>
    (screen.getByTestId('target-note').dataset['midis'] ?? '').split(',').map(Number);
  const key = (midi: number) => screen.getByTestId('piano').querySelector(`[data-midi="${midi}"]`);
  return { session, input, press, release, start, midis, key };
}

function config(mode: 'terceras' | 'acordes', level: number): RoundConfig {
  const found = roundConfigFor(mode, level);
  if (!found) throw new Error('nivel inexistente');
  return found;
}

describe('PracticeScreen · terceras', () => {
  it('la bienvenida habla de terceras y de su nivel', () => {
    setup(config('terceras', 1));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      'Toca la tercera que aparece',
    );
    expect(screen.getByTestId('welcome').textContent).toContain('Do–Mi, Re–Fa, Mi–Sol');
  });

  it('la bienvenida explica la tercera sin confundir y trae la leyenda de dedos y de lo punteado', () => {
    setup(config('terceras', 1));
    const text = screen.getByTestId('welcome').textContent ?? '';
    expect(text).toContain('una nota y la que está dos pasos más arriba');
    expect(text).not.toContain('sin saltarte');
    expect(text).toContain('1 (pulgar) al 5 (meñique)');
    expect(text).toContain('Lo punteado');
  });

  it('el tablero se anuncia según el ejercicio', () => {
    const { start } = setup(config('acordes', 1));
    start();
    expect(screen.getByLabelText('Práctica: toca este acorde')).toBeTruthy();
  });

  it('la tarjeta muestra las dos notas, la mano y los dedos, y las dos teclas resaltadas', () => {
    const { start, midis, key } = setup(config('terceras', 1));
    start();
    const notes = midis();
    expect(notes).toHaveLength(2);
    expect(screen.getByTestId('target').textContent).toContain('Toca esta tercera');
    expect(screen.getByTestId('target-detail').textContent).toMatch(
      /^mano derecha · dedos [1-5] · [1-5]$/,
    );
    expect(screen.getByTestId('counters').textContent).toContain('Terceras 0/3');
    for (const note of notes) expect(key(note)?.classList.contains('key--target')).toBe(true);
  });

  it('cada nota pulsada se marca y dice qué falta; la segunda completa la tercera', () => {
    const { start, press, midis } = setup(config('terceras', 1));
    start();
    const [low, high] = midis() as [number, number];
    press(low);
    const chips = screen.getByTestId('target-note').querySelectorAll('.target__chip');
    expect(chips[0]?.getAttribute('data-held')).toBe('true');
    expect(chips[1]?.getAttribute('data-held')).toBe('false');
    expect(screen.getByTestId('feedback').textContent).toContain('Casi');
    expect(screen.getByTestId('feedback').dataset['tone']).toBe('partial');
    expect(screen.getByTestId('feedback').textContent).toContain('Falta');
    press(high);
    expect(screen.getByTestId('feedback').dataset['tone']).toBe('ok');
    expect(screen.getByTestId('counters').textContent).toContain('Terceras 1/3');
  });

  it('una nota de más es un error que dice cuál sobró y qué tocar', () => {
    const { start, press, midis } = setup(config('terceras', 1));
    start();
    const notes = midis();
    const extra =
      [60, 61, 62, 63, 64, 65, 66, 67, 68, 69].find((note) => !notes.includes(note)) ?? 61;
    press(extra);
    const feedback = screen.getByTestId('feedback');
    expect(feedback.dataset['tone']).toBe('error');
    expect(feedback.textContent).toContain('Sobró');
    expect(feedback.textContent).toContain('Toca');
    expect(screen.getByTestId('counters').textContent).toContain('Errores 1');
  });

  it('soltar una tecla quita la marca de esa nota', () => {
    const { start, press, release, midis } = setup(config('terceras', 1));
    start();
    const [low] = midis() as [number];
    press(low);
    release(low);
    const chip = screen.getByTestId('target-note').querySelectorAll('.target__chip')[0];
    expect(chip?.getAttribute('data-held')).toBe('false');
  });

  it('el resumen nombra el objetivo completo, no solo su nota más grave', () => {
    const { start, press, midis } = setup(config('terceras', 1), 1);
    start();
    const [low, high] = midis() as [number, number];
    press(low);
    press(high);
    expect(screen.getByTestId('summary').textContent).toContain('Más lento');
    expect(screen.getByTestId('summary').textContent).toMatch(/(Do|Re|Mi)4 · (Mi|Fa|Sol)4/);
  });
});

describe('PracticeScreen · acordes', () => {
  it('muestra el nombre del acorde, la mano y los dedos 1 · 3 · 5', () => {
    const { start, midis } = setup(config('acordes', 1));
    start();
    expect(midis()).toHaveLength(3);
    expect(screen.getByTestId('target').textContent).toContain('Toca este acorde');
    expect(screen.getByTestId('target-detail').textContent).toMatch(
      /^(Do|Sol) mayor · mano derecha · dedos 1 · 3 · 5$/,
    );
  });

  it('con notación americana el acorde se llama «C major»', () => {
    const { start, session } = setup(config('acordes', 1));
    start();
    act(() => session.setNotation('americana'));
    expect(screen.getByTestId('target-detail').textContent).toMatch(/^(C|G) major · /);
  });

  it('la mano izquierda muestra los dedos al revés (5 · 3 · 1)', () => {
    const { start } = setup(config('acordes', 5));
    start();
    expect(screen.getByTestId('target-detail').textContent).toContain(
      'mano izquierda · dedos 5 · 3 · 1',
    );
  });
});

describe('PracticeScreen · modo notas sin cambios', () => {
  it('una sola nota sigue mostrándose grande, con su pista y sin marcas', () => {
    const { start } = setup(roundConfigFor('notas', 1) as RoundConfig);
    start();
    expect(screen.getByTestId('target').textContent).toContain('Toca esta nota');
    expect(screen.getByTestId('target-detail').textContent).toMatch(/^mano derecha · dedo [1-5]$/);
    expect(screen.getByTestId('target-note').querySelector('.target__chip')).toBeNull();
    expect(screen.getByTestId('counters').textContent).toContain('Notas 0/3');
  });
});
