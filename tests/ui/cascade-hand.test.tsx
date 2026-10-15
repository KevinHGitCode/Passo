// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { PracticeSession } from '@/core/application/practice-session';
import { handShape } from '@/core/domain/hand-shape';
import { roundConfigFor } from '@/core/domain/exercise';
import type { RoundConfig } from '@/core/domain/exercise';
import { createSeededRng } from '@/core/domain/rng';
import { targetOf } from '@/core/domain/target';
import type { CascadeBlock } from '@/ui/keyboard/cascade';
import {
  BLOCK_GAP,
  BLOCK_HEIGHT,
  CASCADE_HEIGHT,
  HAND_HEIGHT,
  WHITE_HEIGHT,
  layoutKeys,
  slotTop,
  viewBoxOf,
} from '@/ui/keyboard/geometry';
import { PianoKeyboard } from '@/ui/keyboard/piano-keyboard';
import { PracticeScreen } from '@/ui/practice/PracticeScreen';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';

afterEach(cleanup);

const FROM = 48;
const TO = 84;
const layout = layoutKeys(FROM, TO);
const keyOf = (midi: number) => {
  const key = layout.keys.find((item) => item.midi === midi);
  if (!key) throw new Error(`No hay tecla ${midi}`);
  return key;
};

function block(
  id: number,
  slot: number,
  notes: number[],
  fingers: (1 | 2 | 3 | 4 | 5)[],
): CascadeBlock {
  return { id, slot, notes, fingers };
}

function renderKeyboard(props: Partial<Parameters<typeof PianoKeyboard>[0]> = {}) {
  return render(
    <PianoKeyboard
      from={FROM}
      to={TO}
      ariaLabel="Teclado"
      blockLabel={(m) => `n${m}`}
      {...props}
    />,
  );
}

describe('viewBoxOf: una sola escala para teclas, cascada y mano', () => {
  it('sin cascada ni mano es el de siempre: un margen de 2 y 4 por debajo', () => {
    expect(viewBoxOf(0, 528)).toEqual({ x: 0, y: -2, width: 528, height: WHITE_HEIGHT + 6 });
  });

  it('con cascada se amplía por arriba y con mano por abajo, sin mover las teclas (siguen en y = 0)', () => {
    const both = viewBoxOf(10, 300, { cascade: true, hand: true });
    expect(both.y).toBe(-CASCADE_HEIGHT);
    expect(both.height).toBe(CASCADE_HEIGHT + WHITE_HEIGHT + 4 + HAND_HEIGHT);
    expect(both.x).toBe(10);
    expect(both.width).toBe(300);
    expect(viewBoxOf(0, 1, { cascade: true }).height).toBe(CASCADE_HEIGHT + WHITE_HEIGHT + 4);
    expect(viewBoxOf(0, 1, { hand: true }).height).toBe(2 + WHITE_HEIGHT + 4 + HAND_HEIGHT);
  });

  it('las filas de la cascada suben de BLOCK_HEIGHT + BLOCK_GAP en BLOCK_HEIGHT + BLOCK_GAP y caben en el margen', () => {
    expect(slotTop(1) - slotTop(0)).toBe(-(BLOCK_HEIGHT + BLOCK_GAP));
    expect(slotTop(0) + BLOCK_HEIGHT).toBeLessThanOrEqual(0);
    expect(slotTop(2)).toBeGreaterThanOrEqual(-CASCADE_HEIGHT);
  });
});

describe('PianoKeyboard con cascada y mano', () => {
  it('sin cascada ni mano el teclado queda como antes (sin capas y con el viewBox original)', () => {
    renderKeyboard();
    const svg = screen.getByTestId('piano');
    expect(svg.getAttribute('viewBox')).toBe(`0 -2 ${layout.width} ${WHITE_HEIGHT + 6}`);
    expect(screen.queryByTestId('cascade')).toBeNull();
    expect(screen.queryByTestId('hand')).toBeNull();
  });

  it('con una cascada vacía reserva las filas (no se mueve al empezar o terminar la ronda)', () => {
    const { rerender } = renderKeyboard({ cascade: [], hand: null });
    const reserved = screen.getByTestId('piano').getAttribute('viewBox');
    expect(reserved).toBe(
      `0 ${-CASCADE_HEIGHT} ${layout.width} ${CASCADE_HEIGHT + WHITE_HEIGHT + 4 + HAND_HEIGHT}`,
    );
    rerender(
      <PianoKeyboard
        from={FROM}
        to={TO}
        ariaLabel="Teclado"
        cascade={[block(0, 0, [60], [1])]}
        hand={handShape(targetOf([60], { fingers: [1], hand: 'derecha' }))}
      />,
    );
    expect(screen.getByTestId('piano').getAttribute('viewBox')).toBe(reserved);
  });

  it('cada bloque cae exactamente sobre su tecla: mismo x y mismo ancho (menos 1 de margen a cada lado)', () => {
    renderKeyboard({
      cascade: [block(0, 0, [60, 64, 67], [1, 3, 5]), block(1, 1, [65, 69, 72], [1, 3, 5])],
    });
    for (const rect of document.querySelectorAll('.cascade__note')) {
      const midi = Number(rect.getAttribute('data-midi'));
      const shape = rect.querySelector('rect') as SVGRectElement;
      expect(Number(shape.getAttribute('x')), `x de ${midi}`).toBe(keyOf(midi).x + 1);
      expect(Number(shape.getAttribute('width')), `ancho de ${midi}`).toBe(keyOf(midi).width - 2);
      expect(Number(shape.getAttribute('y'))).toBe(slotTop(0));
    }
  });

  it('la nota actual es sólida (now) y las siguientes esperan (next) una fila más arriba cada una', () => {
    renderKeyboard({
      cascade: [block(5, 0, [60], [1]), block(6, 1, [62], [2]), block(7, 2, [64], [3])],
    });
    const blocks = [...document.querySelectorAll<SVGGElement>('.cascade__block')];
    expect(blocks.map((item) => item.getAttribute('data-id'))).toEqual(['5', '6', '7']);
    expect(blocks.map((item) => item.classList.contains('cascade__block--now'))).toEqual([
      true,
      false,
      false,
    ]);
    expect(blocks.map((item) => item.style.transform)).toEqual([
      'translateY(0px)',
      `translateY(${-(BLOCK_HEIGHT + BLOCK_GAP)}px)`,
      `translateY(${-2 * (BLOCK_HEIGHT + BLOCK_GAP)}px)`,
    ]);
  });

  it('un grupo lleva su peine y un bloque de una nota no', () => {
    renderKeyboard({ cascade: [block(0, 0, [60, 64], [1, 3]), block(1, 1, [62], [2])] });
    const [group, single] = [...document.querySelectorAll('.cascade__block')];
    expect(group?.querySelector('.cascade__comb')).not.toBeNull();
    expect(single?.querySelector('.cascade__comb')).toBeNull();
  });

  it('muestra el nombre de cada nota y el dedo que la toca', () => {
    renderKeyboard({ cascade: [block(0, 0, [60, 64], [1, 3])] });
    const names = [...document.querySelectorAll('.cascade__name')].map((item) => item.textContent);
    expect(names).toEqual(['n60', 'n64']);
    const fingers = [...document.querySelectorAll('.cascade__finger text')].map(
      (item) => item.textContent,
    );
    expect(fingers).toEqual(['1', '3']);
  });

  it('al avanzar, el bloque que sigue conserva su nodo y solo cambia de fila (así se anima con CSS)', () => {
    const { rerender } = renderKeyboard({
      cascade: [block(0, 0, [60], [1]), block(1, 1, [62], [2]), block(2, 2, [64], [3])],
    });
    const second = document.querySelector('.cascade__block[data-id="1"]');
    expect(second?.getAttribute('data-slot')).toBe('1');
    rerender(
      <PianoKeyboard
        from={FROM}
        to={TO}
        ariaLabel="Teclado"
        blockLabel={(m) => `n${m}`}
        cascade={[block(1, 0, [62], [2]), block(2, 1, [64], [3]), block(3, 2, [65], [4])]}
      />,
    );
    const same = document.querySelector('.cascade__block[data-id="1"]');
    expect(same).toBe(second);
    expect(same?.getAttribute('data-slot')).toBe('0');
    expect(same?.classList.contains('cascade__block--now')).toBe(true);
    expect(document.querySelector('.cascade__block[data-id="0"]')).toBeNull();
    expect(document.querySelectorAll('.cascade__block')).toHaveLength(3);
  });

  it('la mano: cinco dedos bajo sus teclas, rellenos solo los que tocan', () => {
    const shape = handShape(targetOf([60, 64, 67], { fingers: [1, 3, 5], hand: 'derecha' }));
    renderKeyboard({ cascade: [], hand: shape });
    const hand = screen.getByTestId('hand');
    expect(hand.getAttribute('data-hand')).toBe('derecha');
    const fingers = [...hand.querySelectorAll<SVGGElement>('.hand__finger')];
    expect(fingers.map((item) => item.getAttribute('data-finger'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    expect(fingers.map((item) => item.classList.contains('hand__finger--used'))).toEqual([
      true,
      false,
      true,
      false,
      true,
    ]);
    for (const finger of fingers) {
      const midi = Number(finger.getAttribute('data-midi'));
      const shapeEl = finger.querySelector('rect') as SVGRectElement;
      const center = Number(shapeEl.getAttribute('x')) + Number(shapeEl.getAttribute('width')) / 2;
      expect(center, `dedo ${finger.getAttribute('data-finger')}`).toBeCloseTo(
        keyOf(midi).x + keyOf(midi).width / 2,
        6,
      );
      expect(Number(shapeEl.getAttribute('y'))).toBeGreaterThan(WHITE_HEIGHT);
    }
  });

  it('con la vista recortada (pantalla estrecha) no se dibujan las notas ni los dedos que quedan fuera', () => {
    renderKeyboard({
      viewWindow: { from: 60, to: 74 },
      cascade: [
        block(0, 0, [60, 64], [1, 3]),
        block(1, 1, [76, 79], [1, 3]),
        block(2, 2, [72, 77], [1, 5]),
      ],
      hand: handShape(targetOf([60, 64], { fingers: [1, 3], hand: 'derecha' })),
    });
    const drawn = [...document.querySelectorAll('.cascade__note')].map((item) =>
      Number(item.getAttribute('data-midi')),
    );
    expect(drawn).toEqual([60, 64, 72]);
    const fingers = [...document.querySelectorAll('.hand__finger')].map((item) =>
      Number(item.getAttribute('data-midi')),
    );
    expect(fingers).toEqual([60, 62, 64, 65, 67]);
  });

  it('la derecha usa cápsulas y la izquierda cuadrados redondeados (la forma distingue las manos)', () => {
    const right = handShape(targetOf([60], { fingers: [1], hand: 'derecha' }));
    const left = handShape(targetOf([55], { fingers: [5], hand: 'izquierda' }));
    const radius = (shape: typeof right) => {
      cleanup();
      renderKeyboard({ cascade: [], hand: shape });
      return Number(document.querySelector('.hand__finger rect')?.getAttribute('rx'));
    };
    expect(radius(right)).toBeGreaterThan(radius(left));
  });
});

describe('PracticeScreen · cascada y mano', () => {
  function setup(config: RoundConfig) {
    const input = new FakeNoteInput('teclado-pc');
    const session = new PracticeSession({
      inputs: [input],
      audio: { noteOn: () => undefined, noteOff: () => undefined },
      clock: new FakeClock(0),
      rng: createSeededRng(3),
      config: { ...config, roundSize: 4 },
    });
    render(<PracticeScreen session={session} />);
    return { session, input };
  }

  it('antes de empezar no hay bloques ni mano, pero el espacio ya está reservado', () => {
    setup(roundConfigFor('acordes', 1) as RoundConfig);
    const viewBox = screen.getByTestId('piano').getAttribute('viewBox');
    expect(screen.getByTestId('cascade').querySelectorAll('.cascade__block')).toHaveLength(0);
    expect(screen.queryByTestId('hand')).toBeNull();
    act(() => document.querySelector<HTMLButtonElement>('[data-testid=start]')?.click());
    expect(screen.getByTestId('piano').getAttribute('viewBox')).toBe(viewBox);
  });

  it('con la ronda en marcha muestra el objetivo y los dos siguientes, con la mano de ese objetivo', () => {
    const { session } = setup(roundConfigFor('acordes', 1) as RoundConfig);
    act(() => session.start());
    const exercise = session.getSnapshot().exercise;
    const blocks = [...screen.getByTestId('cascade').querySelectorAll('.cascade__block')];
    expect(blocks).toHaveLength(3);
    expect(blocks[0]?.querySelectorAll('.cascade__note')).toHaveLength(3);
    expect(blocks[0]?.querySelector('.cascade__note')?.getAttribute('data-midi')).toBe(
      String(exercise?.target.notes[0]),
    );
    expect(screen.getByTestId('hand').getAttribute('data-hand')).toBe('derecha');
    expect(screen.getByTestId('hand').querySelectorAll('.hand__finger--used')).toHaveLength(3);
  });

  it('acertar hace caer la cola: el que era el siguiente pasa a ser el actual, sin cambiar de nodo', () => {
    const { session, input } = setup(roundConfigFor('terceras', 1) as RoundConfig);
    act(() => session.start());
    const next = document.querySelector('.cascade__block[data-slot="1"]');
    const nextNotes = session.getSnapshot().exercise?.upcoming[0]?.notes ?? [];
    act(() => {
      for (const note of session.getSnapshot().exercise?.target.notes ?? []) input.press(note, 100);
    });
    const now = document.querySelector('.cascade__block[data-slot="0"]');
    expect(now).toBe(next);
    expect(session.getSnapshot().exercise?.target.notes).toEqual(nextNotes);
    expect(document.querySelectorAll('.cascade__block')).toHaveLength(3);
  });

  it('en la última nota de la ronda ya no hay siguientes', () => {
    const { session, input } = setup(roundConfigFor('terceras', 1) as RoundConfig);
    act(() => session.start());
    for (let i = 0; i < 3; i++) {
      act(() => {
        for (const note of session.getSnapshot().exercise?.target.notes ?? [])
          input.press(note, 100 + i);
        for (const note of session.getSnapshot().exercise?.target.notes ?? [])
          input.release(note, 150 + i);
      });
    }
    expect(session.getSnapshot().phase).toBe('en-curso');
    expect(document.querySelectorAll('.cascade__block')).toHaveLength(1);
  });

  it('al terminar la ronda desaparecen los bloques y la mano', () => {
    const { session, input } = setup(roundConfigFor('terceras', 1) as RoundConfig);
    act(() => session.start());
    for (let i = 0; i < 4; i++) {
      act(() => {
        for (const note of session.getSnapshot().exercise?.target.notes ?? [])
          input.press(note, 100 + i);
        for (const note of session.getSnapshot().exercise?.target.notes ?? [])
          input.release(note, 150 + i);
      });
    }
    expect(session.getSnapshot().phase).toBe('completada');
    expect(document.querySelectorAll('.cascade__block')).toHaveLength(0);
    expect(screen.queryByTestId('hand')).toBeNull();
  });

  it('en modo notas la mano muestra el dedo de la nota (posición de cinco dedos)', () => {
    const { session } = setup(roundConfigFor('notas', 1) as RoundConfig);
    act(() => session.start());
    expect(screen.getByTestId('hand').querySelectorAll('.hand__finger--used')).toHaveLength(1);
    expect(screen.getByTestId('hand').querySelectorAll('.hand__finger')).toHaveLength(5);
  });
});
