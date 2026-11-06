// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { TunerService } from '@/core/application/tuner-service';
import { stringFrequency } from '@/core/domain/tuner';
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

afterEach(cleanup);

function setup() {
  const pitch = new FakePitch();
  const clock = new FakeClock(0);
  const tuner = new TunerService({ pitch, clock });
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

  it('la regla coloca la aguja según los cents (−50…+50) y la esconde sin sonido', () => {
    const { play } = setup();
    const needle = () => document.querySelector<HTMLElement>('.tuner__needle');
    expect(needle()?.getAttribute('data-idle')).toBe('true');
    play(1, -20, 600);
    expect(needle()?.getAttribute('data-idle')).toBe('false');
    expect(needle()?.style.left).toBe('30%');
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
    const at = { string: 6 as const, ...base };
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
