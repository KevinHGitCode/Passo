import { TunerService } from '@/core/application/tuner-service';
import type { TunerSnapshot } from '@/core/application/tuner-service';
import { stringFrequency } from '@/core/domain/tuner';
import { FakeClock } from '../fakes/fake-clock';
import { FakePitch } from '../fakes/fake-pitch';
import { FakeTone } from '../fakes/fake-tone';

function setup() {
  const pitch = new FakePitch();
  const clock = new FakeClock(0);
  const tuner = new TunerService({ pitch, clock });
  const snapshots: TunerSnapshot[] = [];
  tuner.subscribe(() => snapshots.push(tuner.getSnapshot()));
  /** Una lectura cada 20 ms, con la desviación en cents respecto a la cuerda elegida. */
  const play = (string: 1 | 2 | 3 | 4 | 5 | 6, cents: number, ms: number) => {
    const end = clock.now() + ms;
    while (clock.now() < end) {
      clock.advance(20);
      pitch.emit({
        frequency: stringFrequency(string) * 2 ** (cents / 1200),
        clarity: 0.95,
        at: clock.now(),
      });
    }
  };
  return { pitch, clock, tuner, snapshots, play };
}

describe('TunerService', () => {
  it('empieza cerrado, en la cuerda 1 y sin sonido', () => {
    const { tuner, pitch } = setup();
    expect(tuner.getSnapshot()).toMatchObject({
      string: 1,
      open: false,
      status: 'sin-sonido',
      cents: null,
      far: false,
      near: false,
      referenceHz: 440,
    });
    expect(Object.values(tuner.getSnapshot().strings)).toEqual(Array(6).fill('sin-afinar'));
    expect(pitch.searches).toEqual([]);
  });

  it('al abrir pide el tono dentro del intervalo de la cuerda y se suscribe', () => {
    const { tuner, pitch } = setup();
    tuner.open();
    expect(tuner.getSnapshot().open).toBe(true);
    expect(pitch.searches).toHaveLength(1);
    const range = pitch.searches[0];
    expect(range?.minHz).toBeLessThan(stringFrequency(1));
    expect(range?.maxHz).toBeGreaterThan(stringFrequency(1));
    expect(pitch.listeners).toBe(1);
    tuner.open();
    expect(pitch.listeners).toBe(1);
  });

  it('mide contra la cuerda elegida: floja, y luego afinada tras sostenerla', () => {
    const { tuner, play } = setup();
    tuner.open();
    tuner.selectString(5);
    play(5, -25, 500);
    expect(tuner.getSnapshot()).toMatchObject({ string: 5, status: 'baja', cents: -25 });
    play(5, 1, 400);
    expect(tuner.getSnapshot().status).toBe('afinando');
    play(5, 1, 700);
    expect(tuner.getSnapshot()).toMatchObject({ status: 'afinada', cents: 1 });
  });

  it('cambiar de cuerda empieza de cero y cambia el intervalo buscado', () => {
    const { tuner, pitch, play } = setup();
    tuner.open();
    play(1, -20, 500);
    expect(tuner.getSnapshot().status).toBe('baja');
    tuner.selectString(2);
    expect(tuner.getSnapshot()).toMatchObject({ string: 2, status: 'sin-sonido', cents: null });
    expect(pitch.searches).toHaveLength(2);
    const range = pitch.searches[1];
    expect(range?.minHz).toBeLessThan(stringFrequency(2));
    expect(range?.maxHz).toBeGreaterThan(stringFrequency(2));
  });

  it('elegir cuerda con el afinador cerrado no mide nada', () => {
    const { tuner, pitch } = setup();
    tuner.selectString(3);
    expect(tuner.getSnapshot()).toMatchObject({ string: 3, open: false });
    expect(pitch.searches).toEqual([]);
  });

  it('sin sonido durante medio segundo vuelve a «sin sonido»', () => {
    const { tuner, pitch, clock, play } = setup();
    tuner.open();
    play(1, 15, 500);
    expect(tuner.getSnapshot().status).toBe('alta');
    clock.advance(600);
    pitch.emit(null);
    expect(tuner.getSnapshot().status).toBe('sin-sonido');
  });

  it('si la cuerda se calla, los avisos de silencio seguidos devuelven a «sin sonido»', () => {
    const { tuner, pitch, clock, play } = setup();
    tuner.open();
    play(1, -20, 500);
    expect(tuner.getSnapshot().status).toBe('baja');
    for (let i = 0; i < 40; i++) {
      clock.advance(20);
      pitch.emit(null);
    }
    expect(tuner.getSnapshot()).toMatchObject({ status: 'sin-sonido', cents: null });
  });

  it('al cerrar deja de seguir, deja de medir y olvida lo medido', () => {
    const { tuner, pitch, play, snapshots } = setup();
    tuner.open();
    play(1, 15, 500);
    tuner.close();
    expect(tuner.getSnapshot()).toMatchObject({ open: false, status: 'sin-sonido', cents: null });
    expect(pitch.searches[pitch.searches.length - 1]).toBeNull();
    expect(pitch.listeners).toBe(0);
    const count = snapshots.length;
    pitch.emit({ frequency: 330, clarity: 1, at: 99999 });
    expect(snapshots).toHaveLength(count);
  });

  it('no avisa si nada cambió', () => {
    const { tuner, play, snapshots } = setup();
    tuner.open();
    play(1, -20, 400);
    const count = snapshots.length;
    play(1, -20, 200);
    expect(snapshots.length).toBe(count);
    tuner.selectString(1);
    expect(snapshots.length).toBe(count);
  });
});

describe('TunerService · lo que recuerda de cada cuerda', () => {
  it('una cuerda que queda afinada se recuerda aunque se pase a otra', () => {
    const { tuner, play } = setup();
    tuner.open();
    tuner.selectString(6);
    play(6, 1, 1500);
    expect(tuner.getSnapshot().status).toBe('afinada');
    expect(tuner.getSnapshot().strings[6]).toBe('afinada');
    tuner.selectString(5);
    expect(tuner.getSnapshot().strings[6]).toBe('afinada');
    expect(tuner.getSnapshot().strings[5]).toBe('sin-afinar');
    expect(tuner.getSnapshot().status).toBe('sin-sonido');
  });

  it('oír desafinarse una cuerda afinada la pasa a «revisar»', () => {
    const { tuner, play } = setup();
    tuner.open();
    tuner.selectString(4);
    play(4, 0, 1500);
    expect(tuner.getSnapshot().strings[4]).toBe('afinada');
    play(4, 30, 600);
    expect(tuner.getSnapshot()).toMatchObject({ status: 'alta' });
    expect(tuner.getSnapshot().strings[4]).toBe('revisar');
  });

  it('con la cuerda en la zona «casi» marca near y no la da por afinada', () => {
    const { tuner, play } = setup();
    tuner.open();
    play(1, -10, 600);
    expect(tuner.getSnapshot()).toMatchObject({ status: 'baja', near: true });
    expect(tuner.getSnapshot().strings[1]).toBe('sin-afinar');
  });

  it('a los 5 minutos refresh() la pasa a «revisar» y la identidad de las marcas solo cambia si algo cambió', () => {
    const { tuner, clock, play } = setup();
    tuner.open();
    tuner.selectString(3);
    play(3, 0, 1500);
    const before = tuner.getSnapshot().strings;
    tuner.refresh();
    expect(tuner.getSnapshot().strings).toBe(before);
    clock.advance(5 * 60_000);
    tuner.refresh();
    expect(tuner.getSnapshot().strings).not.toBe(before);
    expect(tuner.getSnapshot().strings[3]).toBe('revisar');
  });

  it('al abrir otra vez empieza con el tablero vacío', () => {
    const { tuner, play } = setup();
    tuner.open();
    play(1, 0, 1500);
    expect(tuner.getSnapshot().strings[1]).toBe('afinada');
    tuner.close();
    tuner.open();
    expect(tuner.getSnapshot().strings[1]).toBe('sin-afinar');
  });
});

describe('TunerService · la nota de referencia', () => {
  function withTone() {
    const pitch = new FakePitch();
    const clock = new FakeClock(0);
    const tone = new FakeTone();
    const tuner = new TunerService({ pitch, clock, tone });
    const play = (string: 1 | 2 | 3 | 4 | 5 | 6, cents: number, ms: number) => {
      const end = clock.now() + ms;
      while (clock.now() < end) {
        clock.advance(20);
        pitch.emit({
          frequency: stringFrequency(string) * 2 ** (cents / 1200),
          clarity: 0.95,
          at: clock.now(),
        });
      }
    };
    return { pitch, clock, tone, tuner, play };
  }

  it('sin salida de tono no hay referencia y pedirla no hace nada', () => {
    const { tuner } = setup();
    tuner.open();
    expect(tuner.getSnapshot().canReference).toBe(false);
    tuner.playReference();
    expect(tuner.getSnapshot().tone).toBe(false);
  });

  it('suena la nota de la cuerda elegida con su frecuencia y su timbre', () => {
    const { tuner, tone } = withTone();
    tuner.open();
    tuner.selectString(6);
    expect(tuner.getSnapshot().canReference).toBe(true);
    tuner.playReference();
    expect(tuner.getSnapshot().tone).toBe(true);
    expect(tone.played).toHaveLength(1);
    expect(tone.played[0]?.frequency).toBeCloseTo(stringFrequency(6), 6);
    expect(tone.played[0]?.durationMs).toBe(2500);
    // Cuerdas graves: más peso en los armónicos que en la fundamental.
    expect(tone.played[0]?.harmonics).toHaveLength(6);
    expect(tone.played[0]?.harmonics[0]).toBeLessThan(tone.played[0]?.harmonics[1] ?? 0);
  });

  it('las cuerdas agudas llevan menos armónicos y la fundamental manda', () => {
    const { tuner, tone } = withTone();
    tuner.open();
    tuner.selectString(2);
    tuner.playReference();
    expect(tone.played[0]?.harmonics).toEqual([1, 0.5, 0.3, 0.2]);
  });

  it('con el afinador cerrado no suena', () => {
    const { tuner, tone } = withTone();
    tuner.playReference();
    expect(tone.played).toHaveLength(0);
    expect(tuner.getSnapshot().tone).toBe(false);
  });

  it('mientras suena no mide, aunque el micrófono oiga la propia nota', () => {
    const { tuner, play, tone } = withTone();
    tuner.open();
    tuner.selectString(5);
    tuner.playReference();
    play(5, 0, 2000);
    expect(tuner.getSnapshot()).toMatchObject({ status: 'sin-sonido', tone: true });
    expect(tuner.getSnapshot().strings[5]).toBe('sin-afinar');
    tone.finish();
    expect(tuner.getSnapshot().tone).toBe(false);
  });

  it('tras acabar sigue sin medir 500 ms (la cola de la sala) y luego mide con normalidad', () => {
    const { tuner, play, tone, clock } = withTone();
    tuner.open();
    tuner.selectString(5);
    tuner.playReference();
    tone.finish();
    play(5, 0, 480);
    expect(tuner.getSnapshot().status).toBe('sin-sonido');
    clock.advance(40);
    play(5, -25, 600);
    expect(tuner.getSnapshot()).toMatchObject({ status: 'baja', cents: -25, tone: false });
  });

  it('lo medido antes de la referencia se olvida: no queda «afinada» de la nota que suena', () => {
    const { tuner, play, tone } = withTone();
    tuner.open();
    tuner.selectString(4);
    play(4, -20, 600);
    expect(tuner.getSnapshot().status).toBe('baja');
    tuner.playReference();
    expect(tuner.getSnapshot()).toMatchObject({ status: 'sin-sonido', cents: null });
    tone.finish();
    expect(tuner.getSnapshot()).toMatchObject({ status: 'sin-sonido', cents: null });
  });

  it('stopReference la corta y deja la medición en pausa un momento', () => {
    const { tuner, tone, play } = withTone();
    tuner.open();
    tuner.playReference();
    tuner.stopReference();
    expect(tone.stops).toBe(1);
    expect(tuner.getSnapshot().tone).toBe(false);
    play(1, 0, 400);
    expect(tuner.getSnapshot().status).toBe('sin-sonido');
  });

  it('cambiar de cuerda o cerrar corta la referencia', () => {
    const { tuner, tone } = withTone();
    tuner.open();
    tuner.playReference();
    tuner.selectString(3);
    expect(tone.stops).toBe(1);
    expect(tuner.getSnapshot()).toMatchObject({ tone: false, string: 3 });
    tuner.playReference();
    tuner.close();
    expect(tone.stops).toBe(2);
    expect(tuner.getSnapshot()).toMatchObject({ tone: false, open: false });
  });

  it('pedirla mientras suena no la repite; que termine un tono viejo no corta el nuevo', () => {
    const { tuner, tone } = withTone();
    tuner.open();
    tuner.playReference();
    tuner.playReference();
    expect(tone.played).toHaveLength(1);
    tuner.stopReference();
    tuner.playReference();
    expect(tone.played).toHaveLength(2);
    tone.finish();
    expect(tuner.getSnapshot().tone).toBe(false);
  });
});
