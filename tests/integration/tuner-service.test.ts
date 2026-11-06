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

  it('si el audio falla al tocar, el afinador no se queda esperando una nota que no suena', () => {
    const { tuner, tone, play } = withTone();
    tuner.open();
    tuner.selectString(5);
    tone.failing = true;
    expect(() => tuner.playReference()).not.toThrow();
    expect(tuner.getSnapshot().tone).toBe(false);
    tone.failing = false;
    play(5, -25, 1200);
    expect(tuner.getSnapshot()).toMatchObject({ status: 'baja', cents: -25 });
  });

  it('el aviso tardío de un tono ya cortado no apaga el nuevo', () => {
    const { tuner, tone } = withTone();
    tuner.open();
    tuner.playReference();
    tuner.stopReference();
    tuner.playReference();
    expect(tuner.getSnapshot().tone).toBe(true);
    tone.finishLate(0);
    expect(tuner.getSnapshot().tone).toBe(true);
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

describe('TunerService · el modo guiado «Afinar las 6»', () => {
  type StringNumber = 1 | 2 | 3 | 4 | 5 | 6;

  /** Una afinador abierto con una guía que sigue lo que toca la prueba. */
  function guided() {
    const { pitch, clock, tuner } = setup();
    const play = (string: StringNumber, cents: number, ms: number) => {
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
    /** Afina una cuerda: la sostiene bien afinada el tiempo de sobra para que la guía avance. */
    const tune = (string: StringNumber, cents = 0) => play(string, cents, 2800);
    tuner.open();
    return { pitch, clock, tuner, play, tune };
  }

  it('empieza en la cuerda 6, busca su tono y marca la pasada', () => {
    const { tuner, pitch } = guided();
    tuner.startGuided();
    const snapshot = tuner.getSnapshot();
    expect(snapshot.string).toBe(6);
    expect(snapshot.guided).toMatchObject({
      queue: [6, 5, 4, 3, 2, 1],
      index: 0,
      lap: 1,
      paused: false,
      finished: false,
      complete: false,
      next: 5,
    });
    const range = pitch.searches[pitch.searches.length - 1];
    expect(range?.minHz).toBeLessThan(stringFrequency(6));
    expect(range?.maxHz).toBeGreaterThan(stringFrequency(6));
  });

  it('saltar la última cuerda corta la nota de referencia que sonaba', () => {
    const tone = new FakeTone();
    const service = new TunerService({ pitch: new FakePitch(), clock: new FakeClock(0), tone });
    service.open();
    service.startGuided();
    for (let n = 0; n < 5; n++) service.skipGuided();
    service.playReference();
    expect(service.getSnapshot().tone).toBe(true);
    service.skipGuided();
    expect(service.getSnapshot().guided?.finished).toBe(true);
    expect(service.getSnapshot().tone).toBe(false);
    expect(tone.stops).toBeGreaterThanOrEqual(1);
  });

  it('con el afinador cerrado no empieza', () => {
    const { tuner } = setup();
    tuner.startGuided();
    expect(tuner.getSnapshot().guided).toBeNull();
  });

  it('al quedar afinada y sostenerla 1,5 s, pasa a la siguiente con la regla en reposo', () => {
    const { tuner, tune } = guided();
    tuner.startGuided();
    tune(6, 1);
    const snapshot = tuner.getSnapshot();
    expect(snapshot.string).toBe(5);
    expect(snapshot.status).toBe('sin-sonido');
    expect(snapshot.cents).toBeNull();
    expect(snapshot.guided?.index).toBe(1);
    expect(snapshot.guided?.finals[6]).toBe(1);
    expect(snapshot.strings[6]).toBe('afinada');
  });

  it('no avanza mientras la cuerda siga desafinada ni antes de sostenerla', () => {
    const { tuner, play } = guided();
    tuner.startGuided();
    play(6, -25, 3000);
    expect(tuner.getSnapshot().string).toBe(6);
    expect(tuner.getSnapshot().guided?.index).toBe(0);
    play(6, 0, 900);
    expect(tuner.getSnapshot().string).toBe(6);
  });

  it('cambia el intervalo de búsqueda a la cuerda nueva al avanzar', () => {
    const { tuner, pitch, tune } = guided();
    tuner.startGuided();
    tune(6);
    const range = pitch.searches[pitch.searches.length - 1];
    expect(range?.minHz).toBeLessThan(stringFrequency(5));
    expect(range?.maxHz).toBeGreaterThan(stringFrequency(5));
  });

  it('recorre las seis y termina completa, con los cents de cada una', () => {
    const { tuner, tune } = guided();
    tuner.startGuided();
    for (const string of [6, 5, 4, 3, 2, 1] as const) tune(string, string === 3 ? 2 : 0);
    const guide = tuner.getSnapshot().guided;
    expect(guide).toMatchObject({ finished: true, complete: true, missing: [], next: null });
    expect(guide?.finals).toMatchObject({ 6: 0, 3: 2, 1: 0 });
    expect(Object.values(tuner.getSnapshot().strings)).toEqual(Array(6).fill('afinada'));
  });

  it('«Repasar las 6» marca todas «revisar» y empieza la vuelta 2 por la 6', () => {
    const { tuner, tune } = guided();
    tuner.startGuided();
    for (const string of [6, 5, 4, 3, 2, 1] as const) tune(string);
    tuner.repeatGuided();
    const snapshot = tuner.getSnapshot();
    expect(snapshot.guided).toMatchObject({ lap: 2, index: 0, finished: false });
    expect(snapshot.string).toBe(6);
    expect(Object.values(snapshot.strings)).toEqual(Array(6).fill('revisar'));
    for (const string of [6, 5, 4, 3, 2, 1] as const) tune(string);
    expect(tuner.getSnapshot().guided).toMatchObject({ lap: 2, finished: true, complete: true });
  });

  it('«Siguiente cuerda» salta sin afinar y la pasada incompleta dice cuáles faltan', () => {
    const { tuner, tune } = guided();
    tuner.startGuided();
    tune(6);
    tuner.skipGuided();
    expect(tuner.getSnapshot().string).toBe(4);
    for (const string of [4, 3, 2, 1] as const) tune(string);
    const guide = tuner.getSnapshot().guided;
    expect(guide).toMatchObject({ finished: true, complete: false, missing: [5] });
  });

  it('«Seguir con las que faltan» arma una pasada solo con ellas', () => {
    const { tuner, tune } = guided();
    tuner.startGuided();
    tune(6);
    tuner.skipGuided();
    tuner.skipGuided();
    tuner.skipGuided();
    tuner.skipGuided();
    tuner.skipGuided();
    expect(tuner.getSnapshot().guided).toMatchObject({ finished: true, missing: [5, 4, 3, 2, 1] });
    tuner.continueGuided();
    expect(tuner.getSnapshot().guided).toMatchObject({
      queue: [5, 4, 3, 2, 1],
      index: 0,
      finished: false,
    });
    expect(tuner.getSnapshot().string).toBe(5);
  });

  it('con todo afinado «seguir con las que faltan» no hace nada', () => {
    const { tuner, tune } = guided();
    tuner.startGuided();
    for (const string of [6, 5, 4, 3, 2, 1] as const) tune(string);
    const before = tuner.getSnapshot().guided;
    tuner.continueGuided();
    expect(tuner.getSnapshot().guided).toBe(before);
  });

  it('en pausa no mide ni avanza, y al seguir empieza de cero', () => {
    const { tuner, play } = guided();
    tuner.startGuided();
    tuner.pauseGuided();
    expect(tuner.getSnapshot().guided?.paused).toBe(true);
    play(6, 0, 4000);
    expect(tuner.getSnapshot()).toMatchObject({ string: 6, status: 'sin-sonido' });
    expect(tuner.getSnapshot().guided?.index).toBe(0);
    tuner.resumeGuided();
    expect(tuner.getSnapshot().guided?.paused).toBe(false);
    play(6, -20, 500);
    expect(tuner.getSnapshot().status).toBe('baja');
  });

  it('tocar una clavija salta a esa cuerda sin perder lo hecho', () => {
    const { tuner, tune } = guided();
    tuner.startGuided();
    tune(6);
    tuner.selectString(2);
    const snapshot = tuner.getSnapshot();
    expect(snapshot.string).toBe(2);
    expect(snapshot.guided).toMatchObject({ index: 4, next: 1 });
    expect(snapshot.guided?.finals[6]).toBe(0);
    expect(snapshot.strings[6]).toBe('afinada');
  });

  it('tocar la clavija de una cuerda que no está en la pasada sale de la guía', () => {
    const { tuner, tune } = guided();
    tuner.startGuided();
    tune(6);
    tuner.skipGuided();
    tuner.skipGuided();
    tuner.skipGuided();
    tuner.skipGuided();
    tuner.skipGuided();
    tuner.continueGuided();
    expect(tuner.getSnapshot().guided?.queue).toEqual([5, 4, 3, 2, 1]);
    tuner.selectString(6);
    expect(tuner.getSnapshot()).toMatchObject({ string: 6, guided: null });
  });

  it('tocar una clavija con la pasada terminada sale de la guía y sigue a mano', () => {
    const { tuner, tune } = guided();
    tuner.startGuided();
    for (const string of [6, 5, 4, 3, 2, 1] as const) tune(string);
    tuner.selectString(1);
    expect(tuner.getSnapshot().guided).toBeNull();
    expect(tuner.getSnapshot().string).toBe(1);
  });

  it('salir de la guía deja la cuerda en la que estaba, lo recordado y la medición a mano', () => {
    const { tuner, tune, play } = guided();
    tuner.startGuided();
    tune(6);
    tuner.exitGuided();
    const snapshot = tuner.getSnapshot();
    expect(snapshot.guided).toBeNull();
    expect(snapshot.string).toBe(5);
    expect(snapshot.strings[6]).toBe('afinada');
    play(5, 0, 4000);
    expect(tuner.getSnapshot().string).toBe(5);
    expect(tuner.getSnapshot().status).toBe('afinada');
  });

  it('cerrar el afinador termina la guía y al abrir otra vez empieza a mano', () => {
    const { tuner } = guided();
    tuner.startGuided();
    tuner.close();
    expect(tuner.getSnapshot().guided).toBeNull();
    tuner.open();
    expect(tuner.getSnapshot().guided).toBeNull();
  });

  it('la vista de la guía conserva su identidad mientras nada cambie', () => {
    const { tuner, play } = guided();
    tuner.startGuided();
    const before = tuner.getSnapshot().guided;
    play(6, -20, 400);
    expect(tuner.getSnapshot().guided).toBe(before);
  });
});

describe('TunerService · el La₄ de referencia', () => {
  function withTone() {
    const pitch = new FakePitch();
    const clock = new FakeClock(0);
    const tone = new FakeTone();
    const tuner = new TunerService({ pitch, clock, tone });
    return { pitch, clock, tone, tuner };
  }

  it('por omisión es 440 Hz', () => {
    const { tuner } = setup();
    expect(tuner.getSnapshot().referenceHz).toBe(440);
  });

  it('cambiarlo mueve la meta de cada cuerda y el intervalo de búsqueda', () => {
    const { tuner, pitch } = setup();
    tuner.open();
    tuner.selectString(5);
    tuner.setReferenceHz(432);
    expect(tuner.getSnapshot().referenceHz).toBe(432);
    const range = pitch.searches[pitch.searches.length - 1];
    const target = stringFrequency(5, { referenceHz: 432 });
    expect(range?.minHz).toBeLessThan(target);
    expect(range?.maxHz).toBeGreaterThan(target);
    expect(range?.maxHz).toBeLessThan(searchRangeMax440());
  });

  it('mide contra el La₄ elegido: una cuerda a 440 suena grave si el La₄ es 442', () => {
    const { tuner, pitch, clock } = setup();
    tuner.open();
    tuner.selectString(5);
    tuner.setReferenceHz(442);
    for (let n = 0; n < 40; n++) {
      clock.advance(20);
      pitch.emit({ frequency: stringFrequency(5), clarity: 0.95, at: clock.now() });
    }
    // 7,85 cents por debajo de la meta de 442: «casi», no «afinada».
    expect(tuner.getSnapshot()).toMatchObject({ status: 'baja', cents: -8, near: true });
  });

  it('una cuerda afinada a 442 queda «afinada» con ese La₄', () => {
    const { tuner, pitch, clock } = setup();
    tuner.open();
    tuner.selectString(5);
    tuner.setReferenceHz(442);
    for (let n = 0; n < 80; n++) {
      clock.advance(20);
      pitch.emit({
        frequency: stringFrequency(5, { referenceHz: 442 }),
        clarity: 0.95,
        at: clock.now(),
      });
    }
    expect(tuner.getSnapshot().status).toBe('afinada');
  });

  it('olvida lo medido y lo recordado, y para la guía y la nota', () => {
    const { tuner, tone } = withTone();
    tuner.open();
    tuner.startGuided();
    tuner.exitGuided();
    tuner.playReference();
    tuner.setReferenceHz(438);
    expect(tone.stops).toBe(1);
    expect(tuner.getSnapshot()).toMatchObject({
      tone: false,
      guided: null,
      status: 'sin-sonido',
      cents: null,
    });
    expect(Object.values(tuner.getSnapshot().strings)).toEqual(Array(6).fill('sin-afinar'));
  });

  it('un valor fuera de 430–450 o no entero se ignora, y el mismo no repinta', () => {
    const { tuner } = setup();
    const snapshots: number[] = [];
    tuner.subscribe(() => snapshots.push(tuner.getSnapshot().referenceHz));
    tuner.setReferenceHz(429);
    tuner.setReferenceHz(451);
    tuner.setReferenceHz(440.5);
    tuner.setReferenceHz(440);
    expect(snapshots).toEqual([]);
    tuner.setReferenceHz(441);
    expect(snapshots).toEqual([441]);
  });

  it('la nota de referencia suena con la frecuencia del La₄ elegido', () => {
    const { tuner, tone } = withTone();
    tuner.open();
    tuner.selectString(5);
    tuner.setReferenceHz(432);
    tuner.playReference();
    expect(tone.played[0]?.frequency).toBeCloseTo(108, 6);
  });
});

/** El extremo agudo del intervalo de búsqueda de la cuerda 5 con La₄ = 440 (para comparar). */
function searchRangeMax440(): number {
  return stringFrequency(5) * 2 ** (300 / 1200);
}
