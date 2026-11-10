// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { TunerService } from '@/core/application/tuner-service';
import type { GuidedView } from '@/core/application/tuner-service';
import { stringFrequency } from '@/core/domain/tuner';
import { guidedAnnouncement } from '@/ui/screens/GuidedTuner';
import { TunerScreen } from '@/ui/screens/TunerScreen';
import {
  formatCents,
  formatHz,
  pegVisual,
  tunerChipText,
  tunerHint,
  tunerStatusText,
  tunerTone,
} from '@/ui/screens/tuner-messages';
import { FakeClock } from '../fakes/fake-clock';
import { FakeMicInput } from '../fakes/fake-mic-input';
import { FakePitch } from '../fakes/fake-pitch';
import { FakeTone } from '../fakes/fake-tone';

afterEach(cleanup);

function setup(options: { tone?: FakeTone } = {}) {
  const pitch = new FakePitch();
  const clock = new FakeClock(0);
  const tuner = new TunerService({
    pitch,
    clock,
    ...(options.tone ? { tone: options.tone } : {}),
  });
  const mic = new FakeMicInput();
  render(<TunerScreen tuner={tuner} microphone={mic} notation="latina" />);
  act(() => mic.makeReady());
  /** Una lectura cada 20 ms contra la cuerda dada, con la desviación en cents. */
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
  return { pitch, clock, tuner, mic, play };
}

const radio = (string: number): HTMLInputElement =>
  screen.getByTestId(`tuner-string-${string}`).querySelector('input') as HTMLInputElement;
const peg = (string: number) => screen.getByTestId(`tuner-string-${string}`);

describe('el clavijero', () => {
  it('es un grupo de seis botones de opción en el orden de la 6 a la 1', () => {
    setup();
    const group = screen.getByRole('radiogroup', { name: 'Cuerda que afinas' });
    const inputs = [...group.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(inputs.map((input) => input.value)).toEqual(['6', '5', '4', '3', '2', '1']);
    expect(new Set(inputs.map((input) => input.name)).size).toBe(1);
    expect(radio(1).checked).toBe(true);
  });

  it('cada clavija dice su número, su nota y su estado con texto (no solo con color)', () => {
    setup();
    expect(peg(6).textContent).toContain('Cuerda 6, Mi (la más grave), sin afinar');
    expect(peg(1).textContent).toContain('Cuerda 1, Mi (la más aguda), sin afinar');
    expect(peg(3).textContent).toContain('Cuerda 3, Sol, sin afinar');
  });

  it('cada clavija anuncia su tecla rápida', () => {
    setup();
    for (let n = 1; n <= 6; n++) expect(radio(n).getAttribute('aria-keyshortcuts')).toBe(String(n));
  });

  it('elegir una clavija cambia la cuerda y el clavijero marca la activa', () => {
    setup();
    fireEvent.click(radio(4));
    expect(radio(4).checked).toBe(true);
    expect(peg(4).className).toContain('peg--active');
    expect(peg(1).className).not.toContain('peg--active');
    expect(screen.getByTestId('tuner-target').textContent).toContain('Cuerda 4');
    expect(screen.getByTestId('tuner-target').textContent).toContain('Re');
  });

  it('la clavija de la cuerda que suena grave dice «grave: súbela» y la aguda «aguda: bájala»', () => {
    const { play } = setup();
    play(1, -25, 600);
    expect(peg(1).getAttribute('data-mark')).toBe('sube');
    expect(peg(1).textContent).toContain('grave: súbela');
    expect(peg(1).textContent).toContain('↑');
    play(1, 30, 800);
    expect(peg(1).getAttribute('data-mark')).toBe('baja');
    expect(peg(1).textContent).toContain('aguda: bájala');
    expect(peg(1).textContent).toContain('↓');
  });

  it('una cuerda que queda afinada se queda con su ✓ al pasar a otra', () => {
    const { play } = setup();
    fireEvent.click(radio(6));
    play(6, 1, 1500);
    expect(peg(6).getAttribute('data-mark')).toBe('listo');
    expect(peg(6).textContent).toContain('✓');
    fireEvent.click(radio(5));
    expect(peg(6).getAttribute('data-mark')).toBe('listo');
    expect(peg(6).textContent).toContain('afinada');
    expect(peg(5).getAttribute('data-mark')).toBe('pend');
  });

  it('pasados 5 minutos la ✓ pasa a «revisar» (la pantalla lo vuelve a mirar)', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    try {
      const { play, clock } = setup();
      fireEvent.click(radio(3));
      play(3, 0, 1500);
      expect(peg(3).getAttribute('data-mark')).toBe('listo');
      fireEvent.click(radio(2));
      clock.advance(5 * 60_000);
      act(() => {
        vi.advanceTimersByTime(31_000);
      });
      expect(peg(3).getAttribute('data-mark')).toBe('revisar');
      expect(peg(3).textContent).toContain('revisar');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('las teclas rápidas', () => {
  it('«3» dentro del afinador elige la cuerda 3 y le pasa el foco', () => {
    const { tuner } = setup();
    fireEvent.keyDown(radio(1), { key: '3' });
    expect(tuner.getSnapshot().string).toBe(3);
    expect(document.activeElement).toBe(radio(3));
  });

  it('con Ctrl, Alt o Mayús no hacen nada, ni otras teclas', () => {
    const { tuner } = setup();
    fireEvent.keyDown(radio(1), { key: '3', ctrlKey: true });
    fireEvent.keyDown(radio(1), { key: '3', altKey: true });
    fireEvent.keyDown(radio(1), { key: '3', shiftKey: true });
    fireEvent.keyDown(radio(1), { key: '7' });
    fireEvent.keyDown(radio(1), { key: ' ' });
    expect(tuner.getSnapshot().string).toBe(1);
  });

  it('fuera del afinador no se escuchan (no son atajos de toda la página)', () => {
    const { tuner } = setup();
    fireEvent.keyDown(document.body, { key: '4' });
    expect(tuner.getSnapshot().string).toBe(1);
  });
});

describe('el medidor', () => {
  it('muestra la meta en Hz y, al oír, lo que oye', () => {
    const { play } = setup();
    expect(screen.getByText(/Meta 329,6 Hz$/)).toBeTruthy();
    play(1, -20, 600);
    expect(document.body.textContent).toMatch(/Meta 329,6 Hz · oigo 325,8 Hz/);
  });

  it('los cents llevan signo y son cifras aparte de la palabra', () => {
    const { play } = setup();
    play(1, -20, 600);
    expect(screen.getByTestId('tuner-cents').textContent).toBe('−20');
    expect(screen.getByTestId('tuner-reading').textContent).toBe('Grave');
  });

  it('entre ±5 y ±15 es la zona «casi»: etiqueta «Casi», color ámbar y una instrucción suave', () => {
    const { play } = setup();
    play(1, -10, 600);
    expect(screen.getByTestId('tuner-reading').textContent).toBe('Casi');
    expect(screen.getByTestId('tuner-hint').textContent).toContain('Casi: sube un poquito');
    expect(screen.getByTestId('tuner-hint').getAttribute('data-tone')).toBe('near');
    expect(document.querySelector('.tuner__panel')?.getAttribute('data-tone')).toBe('near');
  });

  it('más allá de ±15 sigue siendo grave o aguda, con color de «fuera de tono»', () => {
    const { play } = setup();
    play(1, 30, 600);
    expect(document.querySelector('.tuner__panel')?.getAttribute('data-tone')).toBe('off');
    expect(screen.getByTestId('tuner-hint').textContent).toContain('Afloja un poco la clavija');
  });

  it('afinada: verde, con el ✓ en la clavija y una instrucción de que está lista', () => {
    const { play } = setup();
    play(1, 1, 1500);
    expect(document.querySelector('.tuner__panel')?.getAttribute('data-tone')).toBe('ok');
    expect(screen.getByTestId('tuner-reading').textContent).toBe('Afinada');
    expect(screen.getByTestId('tuner-hint').textContent).toContain('Lista');
  });

  it('el dial gira el puntero según los cents (−50…+50 en ±60°) y lo esconde sin sonido', () => {
    const { play } = setup();
    const needle = () => document.querySelector<SVGGElement>('.tuner__needle');
    expect(needle()?.getAttribute('data-idle')).toBe('true');
    play(1, -20, 600);
    expect(needle()?.getAttribute('data-idle')).toBe('false');
    // −20 cents de 50 son −24° de 60.
    expect(needle()?.getAttribute('data-angle')).toBe('-24');
  });

  it('trae el plegable «Cómo afinar bien» con consejos', () => {
    setup();
    const tips = document.querySelector('details.tuner__tips');
    expect(tips?.querySelector('summary')?.textContent).toBe('Cómo afinar bien');
    expect(tips?.querySelectorAll('li').length).toBeGreaterThanOrEqual(5);
  });
});

describe('textos del afinador', () => {
  const base = { far: false, near: false } as const;

  it('un solo vocabulario: grave y aguda, y la flecha dice qué hacer', () => {
    expect(tunerStatusText({ ...base, status: 'baja' })).toBe('Grave');
    expect(tunerStatusText({ ...base, status: 'alta' })).toBe('Aguda');
    expect(tunerStatusText({ ...base, far: true, status: 'baja' })).toBe('Muy grave');
    expect(tunerStatusText({ ...base, far: true, status: 'alta' })).toBe('Muy aguda');
    expect(tunerStatusText({ ...base, status: 'afinando' })).toBe('Afinando');
    expect(tunerStatusText({ ...base, status: 'afinada' })).toBe('Afinada');
    expect(tunerStatusText({ ...base, status: 'sin-sonido' })).toBe('');
    expect(tunerChipText({ ...base, near: true, status: 'baja' })).toBe('Casi');
    expect(tunerChipText({ ...base, status: 'baja' })).toBe('Grave');
  });

  it('el tono depende del estado', () => {
    expect(tunerTone({ near: false, status: 'sin-sonido' })).toBe('none');
    expect(tunerTone({ near: false, status: 'baja' })).toBe('off');
    expect(tunerTone({ near: true, status: 'alta' })).toBe('near');
    expect(tunerTone({ near: false, status: 'afinando' })).toBe('ok');
    expect(tunerTone({ near: false, status: 'afinada' })).toBe('ok');
  });

  it('las instrucciones: apretar si está grave, aflojar si está aguda', () => {
    const context = { name: 'Mi', listening: true, weakHint: null };
    const at = { string: 6 as const, tone: false, ...base };
    expect(tunerHint({ ...at, status: 'baja' }, context)).toEqual({
      text: 'Aprieta un poco la clavija.',
      icon: 'up',
    });
    expect(tunerHint({ ...at, far: true, status: 'baja' }, context).text).toContain('muy grave');
    expect(tunerHint({ ...at, status: 'alta' }, context).icon).toBe('down');
    expect(tunerHint({ ...at, status: 'sin-sonido' }, context).text).toBe(
      'Toca la cuerda 6 (Mi) al aire y déjala sonar.',
    );
    expect(tunerHint({ ...at, status: 'sin-sonido' }, { ...context, listening: false })).toEqual({
      text: '',
      icon: null,
    });
    expect(
      tunerHint({ ...at, status: 'sin-sonido' }, { ...context, weakHint: 'Acerca el micrófono' })
        .text,
    ).toBe('Acerca el micrófono');
  });

  it('las marcas de las clavijas salen de lo que se oye (la elegida) o de lo recordado', () => {
    const strings = {
      1: 'sin-afinar',
      2: 'afinada',
      3: 'revisar',
      4: 'sin-afinar',
      5: 'sin-afinar',
      6: 'sin-afinar',
    } as const;
    const snapshot = { status: 'sin-sonido', string: 1, strings } as const;
    expect(pegVisual(snapshot, 1).key).toBe('pend');
    expect(pegVisual(snapshot, 2).key).toBe('listo');
    expect(pegVisual(snapshot, 3).key).toBe('revisar');
    expect(pegVisual({ ...snapshot, status: 'baja' }, 1).key).toBe('sube');
    expect(pegVisual({ ...snapshot, status: 'baja' }, 2).key).toBe('listo');
    expect(pegVisual({ ...snapshot, status: 'afinando' }, 1).key).toBe('pend');
  });

  it('formatea los cents con el signo menos de verdad y los Hz con coma', () => {
    expect(formatCents(-22)).toBe('−22');
    expect(formatCents(3)).toBe('+3');
    expect(formatCents(0)).toBe('0');
    expect(formatHz(82.407)).toBe('82,4');
  });
});

describe('la nota de referencia', () => {
  const reference = () => screen.queryByTestId('tuner-reference');

  it('sin salida de tono no hay botón', () => {
    setup();
    expect(reference()).toBeNull();
  });

  it('«Escuchar la nota» hace sonar la cuerda elegida y pasa a «Detener la nota»', () => {
    const tone = new FakeTone();
    setup({ tone });
    fireEvent.click(radio(6));
    expect(reference()?.textContent).toBe('Escuchar la nota');
    fireEvent.click(reference() as HTMLElement);
    expect(tone.played).toHaveLength(1);
    expect(tone.played[0]?.frequency).toBeCloseTo(stringFrequency(6), 6);
    expect(reference()?.textContent).toBe('Detener la nota');
    expect(reference()?.getAttribute('data-playing')).toBe('true');
    expect(screen.getByTestId('tuner-hint').textContent).toContain('Suena la nota de referencia');
    fireEvent.click(reference() as HTMLElement);
    expect(tone.stops).toBe(1);
    expect(reference()?.textContent).toBe('Escuchar la nota');
  });

  it('al terminar el tono el botón vuelve solo', () => {
    const tone = new FakeTone();
    setup({ tone });
    fireEvent.click(reference() as HTMLElement);
    act(() => tone.finish());
    expect(reference()?.textContent).toBe('Escuchar la nota');
  });

  it('la tecla R dentro del afinador la enciende y la apaga; con Ctrl no', () => {
    const tone = new FakeTone();
    setup({ tone });
    fireEvent.keyDown(radio(1), { key: 'r' });
    expect(tone.played).toHaveLength(1);
    fireEvent.keyDown(radio(1), { key: 'R' });
    expect(tone.stops).toBe(1);
    fireEvent.keyDown(radio(1), { key: 'r', ctrlKey: true });
    expect(tone.played).toHaveLength(1);
    expect(reference()?.getAttribute('aria-keyshortcuts')).toBe('r');
  });

  it('elegir una clavija no suena (solo suena el botón)', () => {
    const tone = new FakeTone();
    setup({ tone });
    fireEvent.click(radio(4));
    fireEvent.keyDown(radio(4), { key: '2' });
    expect(tone.played).toHaveLength(0);
  });

  it('mientras suena, el lector de pantalla oye que suena la referencia', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const tone = new FakeTone();
      setup({ tone });
      fireEvent.click(reference() as HTMLElement);
      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(screen.getByTestId('tuner-live').textContent).toBe(
        'Suena la nota de referencia, cuerda 1',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('el modo guiado «Afinar las 6»', () => {
  type StringNumber = 1 | 2 | 3 | 4 | 5 | 6;
  const step = () => screen.queryByTestId('tuner-guide-step')?.textContent;
  const start = () => fireEvent.click(screen.getByTestId('tuner-guided-start'));

  /** Afina una cuerda: la sostiene bien afinada el tiempo de sobra para que la guía avance. */
  function tuneAll(
    play: (s: StringNumber, c: number, ms: number) => void,
    strings: StringNumber[],
  ) {
    for (const string of strings) play(string, 0, 2800);
  }

  it('«Afinar las 6» empieza por la cuerda 6 y muestra el paso, los seis segmentos y los controles', () => {
    setup();
    expect(screen.queryByTestId('tuner-guide')).toBeNull();
    start();
    expect(step()).toBe('Paso 1 de 6 · vuelta 1');
    expect(screen.getByTestId('tuner-target').textContent).toContain('Cuerda 6');
    expect(document.querySelectorAll('.tuner__steps-bar li')).toHaveLength(6);
    expect(screen.getByTestId('guided-skip').textContent).toBe('Siguiente cuerda');
    expect(screen.getByTestId('guided-pause').textContent).toBe('Pausar');
    expect(screen.getByTestId('guided-exit').textContent).toBe('Salir de la guía');
    expect(screen.queryByTestId('tuner-guided-start')).toBeNull();
    expect(radio(6).checked).toBe(true);
  });

  it('la clavija de la cuerda que viene después se marca con una flecha y con texto', () => {
    setup();
    start();
    expect(peg(5).getAttribute('data-mark')).toBe('sig');
    expect(peg(5).textContent).toContain('la siguiente');
    expect(peg(5).textContent).toContain('→');
    expect(document.querySelector('.tuner__legend')?.textContent).toContain('→ siguiente');
  });

  it('al afinar una cuerda pasa sola a la siguiente: su ✓ queda y el paso avanza', () => {
    const { play } = setup();
    start();
    play(6, 0, 2800);
    expect(step()).toBe('Paso 2 de 6 · vuelta 1');
    expect(screen.getByTestId('tuner-target').textContent).toContain('Cuerda 5');
    expect(peg(6).getAttribute('data-mark')).toBe('listo');
    expect(peg(4).getAttribute('data-mark')).toBe('sig');
    expect(document.querySelectorAll('.tuner__steps-bar li[data-state="hecha"]')).toHaveLength(1);
  });

  it('un solo aviso al lector de pantalla por paso y el foco no se mueve', () => {
    const { play } = setup();
    start();
    const guideLive = screen.getByTestId('tuner-guide-live');
    expect(guideLive.textContent).toBe('Modo guiado. Sigue la cuerda 6 (Mi)');
    radio(6).focus();
    play(6, 0, 2800);
    expect(guideLive.textContent).toBe('Mi afinada. Sigue la cuerda 5 (La)');
    expect(document.activeElement).toBe(radio(6));
  });

  it('«Siguiente cuerda» pasa sin afinar y lo dice distinto', () => {
    setup();
    start();
    fireEvent.click(screen.getByTestId('guided-skip'));
    expect(step()).toBe('Paso 2 de 6 · vuelta 1');
    expect(peg(6).getAttribute('data-mark')).toBe('pend');
    expect(screen.getByTestId('tuner-guide-live').textContent).toBe(
      'Pasas a la cuerda 5. Sigue la cuerda 5 (La)',
    );
  });

  it('«Pausar» detiene la guía y pide «Seguir»; en pausa no se mide', () => {
    const { play } = setup();
    start();
    fireEvent.click(screen.getByTestId('guided-pause'));
    expect(screen.getByTestId('guided-pause').textContent).toBe('Seguir');
    expect(screen.getByTestId('tuner-hint').textContent).toContain('Guía en pausa');
    play(6, 0, 4000);
    expect(step()).toBe('Paso 1 de 6 · vuelta 1');
    fireEvent.click(screen.getByTestId('guided-pause'));
    expect(screen.getByTestId('guided-pause').textContent).toBe('Pausar');
  });

  it('tocar una clavija salta a esa cuerda sin perder lo hecho', () => {
    const { play } = setup();
    start();
    play(6, 0, 2800);
    fireEvent.click(radio(2));
    expect(step()).toBe('Paso 5 de 6 · vuelta 1');
    expect(peg(6).getAttribute('data-mark')).toBe('listo');
  });

  it('«Salir de la guía» y la tecla Esc vuelven a afinar a mano', () => {
    setup();
    start();
    fireEvent.click(screen.getByTestId('guided-exit'));
    expect(screen.queryByTestId('tuner-guide')).toBeNull();
    expect(screen.getByTestId('tuner-guided-start')).toBeTruthy();
    start();
    fireEvent.keyDown(radio(6), { key: 'Escape' });
    expect(screen.queryByTestId('tuner-guide')).toBeNull();
    // Al cerrarla se avisa una vez, para quien no ve la pantalla.
    expect(screen.getByTestId('tuner-guide-live').textContent).toBe('Guía cerrada');
  });

  it('Esc fuera de la guía no hace nada', () => {
    const { tuner } = setup();
    fireEvent.keyDown(radio(1), { key: 'Escape' });
    expect(tuner.getSnapshot().guided).toBeNull();
  });

  it('al afinar las seis sale la pantalla final con cómo quedó cada una y qué hacer', () => {
    const { play } = setup();
    start();
    tuneAll(play, [6, 5, 4, 3, 2, 1]);
    expect(screen.queryByTestId('tuner-guide')).toBeNull();
    expect(screen.getByTestId('tuner-summary-title').textContent).toBe('Las 6 cuerdas, afinadas');
    expect(screen.getByTestId('tuner-summary').textContent).toContain(
      'Al tensar unas, otras se mueven. Repasa las 6 una vez más.',
    );
    const rows = document.querySelectorAll('.tuner__summary-list li');
    expect(rows).toHaveLength(6);
    expect(rows[0]?.textContent).toContain('Cuerda 6');
    expect(rows[0]?.textContent).toContain('✓ afinada');
    expect(screen.getByTestId('guided-repeat').textContent).toBe('Repasar las 6');
    expect(screen.getByTestId('guided-lessons').getAttribute('href')).toBe('#/guitarra');
    expect(screen.getByTestId('guided-exit').textContent).toBe('Seguir afinando');
    expect(screen.getByTestId('tuner-guide-live').textContent).toBe('Las 6 cuerdas, afinadas');
  });

  it('«Repasar las 6» empieza la vuelta 2 y al terminarla dice «Todo en su sitio»', () => {
    const { play } = setup();
    start();
    tuneAll(play, [6, 5, 4, 3, 2, 1]);
    fireEvent.click(screen.getByTestId('guided-repeat'));
    expect(step()).toBe('Paso 1 de 6 · vuelta 2');
    expect(peg(5).getAttribute('data-mark')).toBe('sig');
    tuneAll(play, [6, 5, 4, 3, 2, 1]);
    expect(screen.getByTestId('tuner-summary-title').textContent).toBe('Todo en su sitio');
    expect(screen.queryByTestId('guided-repeat')).toBeNull();
    expect(screen.getByTestId('guided-lessons')).toBeTruthy();
  });

  it('si se saltó alguna, la pantalla final dice cuáles faltan y ofrece seguir con ellas', () => {
    setup();
    start();
    for (let n = 0; n < 6; n++) fireEvent.click(screen.getByTestId('guided-skip'));
    expect(screen.getByTestId('tuner-summary-title').textContent).toBe('Faltan cuerdas por afinar');
    expect(screen.getByTestId('tuner-summary').textContent).toContain('Faltan: cuerda 6 (Mi)');
    expect(screen.getByTestId('tuner-summary').getAttribute('data-complete')).toBe('false');
    fireEvent.click(screen.getByTestId('guided-continue'));
    expect(step()).toBe('Paso 1 de 6 · vuelta 1');
  });

  it('«Seguir afinando» deja la cuerda elegida y las ✓ para seguir a mano', () => {
    const { play } = setup();
    start();
    tuneAll(play, [6, 5, 4, 3, 2, 1]);
    fireEvent.click(screen.getByTestId('guided-exit'));
    expect(screen.queryByTestId('tuner-summary')).toBeNull();
    expect(screen.getByTestId('tuner-target')).toBeTruthy();
    expect(peg(6).getAttribute('data-mark')).toBe('listo');
  });
});

describe('avisos de la guía', () => {
  const marks = {
    1: 'sin-afinar',
    2: 'sin-afinar',
    3: 'sin-afinar',
    4: 'sin-afinar',
    5: 'sin-afinar',
    6: 'afinada',
  } as const;
  const view = (index: number, lap: 1 | 2 = 1, extra: Partial<GuidedView> = {}): GuidedView => ({
    queue: [6, 5, 4, 3, 2, 1] as const,
    index,
    lap,
    paused: false,
    finished: false,
    complete: false,
    missing: [5, 4, 3, 2, 1] as const,
    next: null,
    last: null,
    finals: {},
    ...extra,
  });

  it('sin guía no dice nada; al cerrarla, que se cerró', () => {
    expect(guidedAnnouncement(null, null, marks, 'latina')).toBe('');
    expect(guidedAnnouncement(null, view(0), marks, 'latina')).toBe('Guía cerrada');
  });

  it('al empezar dice por dónde empieza', () => {
    expect(guidedAnnouncement(view(0), null, marks, 'latina')).toBe(
      'Modo guiado. Sigue la cuerda 6 (Mi)',
    );
  });

  it('al empezar el repaso también', () => {
    expect(guidedAnnouncement(view(0, 2), view(6, 1, { finished: true }), marks, 'latina')).toBe(
      'Modo guiado. Sigue la cuerda 6 (Mi)',
    );
  });

  it('con la cuerda anterior afinada dice «afinada», si no, que pasas', () => {
    expect(guidedAnnouncement(view(1, 1, { last: 'afinada' }), view(0), marks, 'latina')).toBe(
      'Mi afinada. Sigue la cuerda 5 (La)',
    );
    expect(guidedAnnouncement(view(2, 1, { last: 'saltada' }), view(1), marks, 'latina')).toBe(
      'Pasas a la cuerda 4. Sigue la cuerda 4 (Re)',
    );
    // Una clavija tocada no es «afinada»: se salta sin decir que la anterior quedó bien.
    expect(guidedAnnouncement(view(3, 1, { last: null }), view(0), marks, 'latina')).toBe(
      'Pasas a la cuerda 3. Sigue la cuerda 3 (Sol)',
    );
  });

  it('al terminar anuncia el resultado y, si no cambió el paso, nada', () => {
    expect(
      guidedAnnouncement(view(6, 1, { finished: true, complete: true }), view(5), marks, 'latina'),
    ).toBe('Las 6 cuerdas, afinadas');
    expect(guidedAnnouncement(view(6, 1, { finished: true }), view(5), marks, 'latina')).toBe(
      'Faltan cuerdas por afinar',
    );
    expect(guidedAnnouncement(view(1), view(1), marks, 'latina')).toBe('');
  });
});

describe('el La₄ de referencia', () => {
  // El «La₄ » del principio es solo para el lector de pantalla: lo que se ve es «440 Hz».
  const value = () => screen.getByTestId('tuner-ref-value').textContent?.replace(/^La₄ /, '');

  it('se ve «440 Hz» y los dos botones de uno en uno', () => {
    setup();
    expect(value()).toBe('440 Hz');
    expect(screen.getByRole('group', { name: 'La₄ de referencia' })).toBeTruthy();
    expect(screen.queryByTestId('tuner-ref-reset')).toBeNull();
    fireEvent.click(screen.getByTestId('tuner-ref-up'));
    fireEvent.click(screen.getByTestId('tuner-ref-up'));
    expect(value()).toBe('442 Hz');
    fireEvent.click(screen.getByTestId('tuner-ref-down'));
    expect(value()).toBe('441 Hz');
  });

  it('cambiarlo mueve la meta en Hz del medidor', () => {
    setup();
    act(() => undefined);
    fireEvent.click(screen.getByTestId('tuner-ref-up'));
    expect(document.body.textContent).toMatch(/Meta 330,4 Hz/);
  });

  it('«Volver a 440» aparece solo si es otro y lo devuelve', () => {
    setup();
    fireEvent.click(screen.getByTestId('tuner-ref-down'));
    expect(screen.getByTestId('tuner-ref-reset').textContent).toBe('Volver a 440');
    fireEvent.click(screen.getByTestId('tuner-ref-reset'));
    expect(value()).toBe('440 Hz');
    expect(screen.queryByTestId('tuner-ref-reset')).toBeNull();
  });

  it('en los extremos (430 y 450) el botón correspondiente se apaga', () => {
    const { tuner } = setup();
    act(() => tuner.setReferenceHz(430));
    expect((screen.getByTestId('tuner-ref-down') as HTMLButtonElement).disabled).toBe(true);
    act(() => tuner.setReferenceHz(450));
    expect((screen.getByTestId('tuner-ref-up') as HTMLButtonElement).disabled).toBe(true);
  });

  it('con la guía o la nota en marcha no se cambia y se explica', () => {
    const tone = new FakeTone();
    setup({ tone });
    fireEvent.click(screen.getByTestId('tuner-guided-start'));
    expect((screen.getByTestId('tuner-ref-up') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('.tuner__ref')?.textContent).toContain(
      'Se cambia con la guía y la nota paradas.',
    );
    fireEvent.click(screen.getByTestId('guided-exit'));
    expect((screen.getByTestId('tuner-ref-up') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId('tuner-reference'));
    expect((screen.getByTestId('tuner-ref-up') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('el foco al empezar, terminar y salir de la guía', () => {
  it('al pulsar «Afinar las 6» el foco pasa a la cuerda elegida (el botón desaparece)', () => {
    setup();
    const button = screen.getByTestId('tuner-guided-start');
    button.focus();
    fireEvent.click(button);
    expect(document.activeElement).toBe(radio(6));
    // Con el foco ahí, Esc sale de la guía.
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(screen.queryByTestId('tuner-guide')).toBeNull();
  });

  it('al salir con el botón, el foco también se queda dentro del afinador', () => {
    setup();
    fireEvent.click(screen.getByTestId('tuner-guided-start'));
    const exit = screen.getByTestId('guided-exit');
    exit.focus();
    fireEvent.click(exit);
    expect(document.activeElement).toBe(radio(6));
  });

  it('no roba el foco a quien ya lo tiene en otro sitio', () => {
    setup();
    const other = document.createElement('button');
    document.body.append(other);
    other.focus();
    fireEvent.click(screen.getByTestId('tuner-guided-start'));
    expect(document.activeElement).toBe(other);
    other.remove();
  });
});
