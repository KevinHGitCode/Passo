import { TunerService } from '@/core/application/tuner-service';
import type { TunerSnapshot } from '@/core/application/tuner-service';
import { stringFrequency } from '@/core/domain/tuner';
import { FakeClock } from '../fakes/fake-clock';
import { FakePitch } from '../fakes/fake-pitch';

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
    expect(tuner.getSnapshot()).toEqual({
      string: 1,
      open: false,
      status: 'sin-sonido',
      cents: null,
      far: false,
    });
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
    play(5, -25, 300);
    expect(tuner.getSnapshot()).toMatchObject({ string: 5, status: 'baja', cents: -25 });
    play(5, 1, 400);
    expect(tuner.getSnapshot().status).toBe('casi');
    play(5, 1, 700);
    expect(tuner.getSnapshot()).toMatchObject({ status: 'afinada', cents: 1 });
  });

  it('cambiar de cuerda empieza de cero y cambia el intervalo buscado', () => {
    const { tuner, pitch, play } = setup();
    tuner.open();
    play(1, -20, 300);
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
    play(1, 15, 300);
    expect(tuner.getSnapshot().status).toBe('alta');
    clock.advance(600);
    pitch.emit(null);
    expect(tuner.getSnapshot().status).toBe('sin-sonido');
  });

  it('si la cuerda se calla, los avisos de silencio seguidos devuelven a «sin sonido»', () => {
    const { tuner, pitch, clock, play } = setup();
    tuner.open();
    play(1, -20, 300);
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
    play(1, 15, 300);
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
    play(1, -20, 200);
    const count = snapshots.length;
    play(1, -20, 200);
    expect(snapshots.length).toBe(count);
    tuner.selectString(1);
    expect(snapshots.length).toBe(count);
  });
});
