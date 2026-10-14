import { MicrophoneInput } from '@/adapters/microphone/microphone-input';
import type { NoteEvent } from '@/core/domain/note-event';
import type { MonitorSnapshot } from '@/core/ports/input-monitor';
import type { InputStatus } from '@/core/ports/note-input';
import { MicHarness } from '../fakes/fake-microphone';
import { concat, noise, pianoNote, silence } from '../support/synth';

function build(
  overrides: { mediaDevices?: false; createContext?: false; visibility?: false } = {},
) {
  const h = new MicHarness();
  const mic = new MicrophoneInput({
    mediaDevices: overrides.mediaDevices === false ? undefined : h.devices,
    createContext: overrides.createContext === false ? () => undefined : h.createContext,
    clock: h.clock,
    timers: h.timers,
    visibility: overrides.visibility === false ? undefined : h.visibility,
  });
  const events: NoteEvent[] = [];
  const statuses: InputStatus[] = [];
  const monitors: MonitorSnapshot[] = [];
  mic.subscribe((event) => events.push(event));
  mic.subscribeStatus((status) => statuses.push(status));
  mic.subscribeMonitor((snapshot) => monitors.push(snapshot));
  return { h, mic, events, statuses, monitors };
}

async function started() {
  const parts = build();
  await parts.mic.start();
  return parts;
}

/** Un segundo largo de silencio para calibrar y luego la nota. */
const NOTE_SIGNAL = concat(silence(1300), pianoNote(64, { ms: 800 }), silence(900));

describe('MicrophoneInput · arranque y permisos', () => {
  it('empieza apagado; al activar pasa por «iniciando» y queda conectado con el nombre del micrófono', async () => {
    const { mic, statuses } = build();
    expect(mic.getStatus()).toEqual({ kind: 'inactivo' });
    await mic.start();
    expect(statuses.map((status) => status.kind)).toEqual(['iniciando', 'conectado']);
    expect(mic.getStatus()).toEqual({ kind: 'conectado', deviceName: 'Micrófono de prueba' });
  });

  it('pide el audio sin cancelación de eco, supresión de ruido ni ganancia automática', async () => {
    const { h } = await started();
    expect(h.devices.calls[0]).toEqual({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });
  });

  it('crea y reanuda el contexto de audio dentro del gesto, antes de esperar el permiso', () => {
    const { h, mic } = build();
    h.devices.holdResponse = true;
    void mic.start();
    expect(h.contexts).toHaveLength(1);
    expect(h.context.resumeCalls).toBe(1);
    h.devices.release();
  });

  it.each([
    ['NotAllowedError', { kind: 'permiso-denegado' }],
    ['SecurityError', { kind: 'permiso-denegado' }],
    ['NotFoundError', { kind: 'sin-dispositivo' }],
    ['NotReadableError', { kind: 'sin-dispositivo', reason: 'ocupado' }],
    ['AbortError', { kind: 'sin-dispositivo', reason: 'ocupado' }],
    ['TypeError', { kind: 'sin-soporte' }],
  ])('el error %s se informa como estado, sin lanzar', async (name, expected) => {
    const { h, mic } = build();
    h.devices.errors = [{ name }];
    await expect(mic.start()).resolves.toBeUndefined();
    expect(mic.getStatus()).toEqual(expected);
    expect(h.context.closed).toBe(true);
  });

  it('sin mediaDevices o sin AudioContext el estado es «sin-soporte»', async () => {
    const a = build({ mediaDevices: false });
    await a.mic.start();
    expect(a.mic.getStatus()).toEqual({ kind: 'sin-soporte' });
    const b = build({ createContext: false });
    await b.mic.start();
    expect(b.mic.getStatus()).toEqual({ kind: 'sin-soporte' });
  });

  it('si las restricciones no se pueden cumplir, reintenta con audio simple', async () => {
    const { h, mic } = build();
    h.devices.errors = [{ name: 'OverconstrainedError' }];
    await mic.start();
    expect(h.devices.calls).toHaveLength(2);
    expect(h.devices.calls[1]).toEqual({ audio: true, video: false });
    expect(mic.getStatus().kind).toBe('conectado');
  });

  it('permite reintentar tras un permiso denegado', async () => {
    const { h, mic } = build();
    h.devices.errors = [{ name: 'NotAllowedError' }];
    await mic.start();
    expect(mic.getStatus().kind).toBe('permiso-denegado');
    await mic.start();
    expect(mic.getStatus().kind).toBe('conectado');
  });

  it('avisa si el navegador no pudo desactivar los efectos de audio', async () => {
    const { h, mic } = build();
    h.devices.stream.track.settings = { echoCancellation: true };
    await mic.start();
    expect(mic.getMonitor().degraded).toBe(true);
  });
});

describe('MicrophoneInput · escucha', () => {
  it('calibra durante ~1 s y luego escucha', async () => {
    const { h, mic } = await started();
    expect(mic.getMonitor().phase).toBe('calibrando');
    h.advance(600);
    expect(mic.getMonitor().phase).toBe('calibrando');
    expect(mic.getMonitor().calibration).toBeGreaterThan(0.3);
    h.advance(800);
    expect(mic.getMonitor().phase).toBe('escuchando');
  });

  it('oye una nota: un on con la nota, fuente y confianza, y la hora del ataque; luego un off', async () => {
    const { h, events } = await started();
    h.context.analyser.signal = NOTE_SIGNAL;
    h.advance(3200);
    const ons = events.filter((event) => event.type === 'on');
    expect(ons).toHaveLength(1);
    expect(ons[0]).toMatchObject({ note: 64, source: 'microfono' });
    expect(ons[0]?.confidence).toBeDefined();
    // El ataque real está a 1300 ms de la señal; el reloj empezó en 1000.
    expect(Math.abs((ons[0]?.at ?? 0) - 2300)).toBeLessThanOrEqual(40);
    expect(events.filter((event) => event.type === 'off')).toHaveLength(1);
  });

  it('muestra «lo que oigo» en el monitor y lo mantiene un momento tras soltar la nota', async () => {
    const { h, mic } = await started();
    h.context.analyser.signal = concat(silence(1300), pianoNote(64, { ms: 500 }), silence(3000));
    h.advance(2100);
    expect(mic.getMonitor().heard?.midi).toBe(64);
    h.advance(900);
    expect(mic.getMonitor().heard?.midi).toBe(64);
    h.advance(1600);
    expect(mic.getMonitor().heard).toBeNull();
  });

  it('el nivel va de 0 a 1 en pasos de 1/64 y sube con el sonido', async () => {
    const { h, mic, monitors } = await started();
    h.context.analyser.signal = NOTE_SIGNAL;
    h.advance(1000);
    const quiet = mic.getMonitor().level;
    h.advance(1500);
    const loud = Math.max(...monitors.map((monitor) => monitor.level));
    expect(loud).toBeGreaterThan(quiet);
    for (const monitor of monitors) expect((monitor.level * 64) % 1).toBeCloseTo(0, 6);
  });

  it('publica el monitor como mucho unas 15 veces por segundo con ruido continuo', async () => {
    const { h, monitors } = await started();
    h.context.analyser.signal = noise('rosa', 5000, 0.05);
    h.advance(1500);
    const before = monitors.length;
    h.advance(1000);
    expect(monitors.length - before).toBeLessThanOrEqual(17);
  });

  it('solo analiza cuando hay un salto de muestras nuevo (no en cada tic de 10 ms)', async () => {
    const { h } = await started();
    h.context.analyser.signal = noise('rosa', 5000, 0.05);
    h.advance(1000);
    // 1 s = 48000 muestras → como mucho 47 fotogramas de 1024.
    expect(h.context.analyser.reads).toBeLessThanOrEqual(48);
    expect(h.context.analyser.reads).toBeGreaterThan(30);
  });

  it('un hueco de tiempo mayor que la ventana reinicia el seguimiento y suelta la nota', async () => {
    const { h, events } = await started();
    h.context.analyser.signal = concat(silence(1300), pianoNote(64, { ms: 4000 }));
    h.advance(2000);
    expect(events.filter((event) => event.type === 'on')).toHaveLength(1);
    // El temporizador se congela medio segundo (pestaña ahogada) y el audio sigue avanzando.
    h.context.currentTime += 0.5;
    h.clock.advance(500);
    h.timers.tick();
    expect(events.at(-1)).toMatchObject({ type: 'off', note: 64 });
  });
});

describe('MicrophoneInput · pérdida y limpieza', () => {
  it('si el sistema retira el micrófono: «desconectado», suelta la nota y libera todo', async () => {
    const { h, mic, events } = await started();
    h.context.analyser.signal = concat(silence(1300), pianoNote(64, { ms: 4000 }));
    h.advance(2000);
    h.devices.stream.track.end();
    expect(mic.getStatus()).toEqual({ kind: 'desconectado', deviceName: 'Micrófono de prueba' });
    expect(events.at(-1)).toMatchObject({ type: 'off', note: 64 });
    expect(h.timers.active).toBe(0);
    expect(h.context.closed).toBe(true);
    expect(mic.getMonitor().phase).toBe('apagado');
  });

  it('después de perderlo se puede reactivar', async () => {
    const { h, mic } = await started();
    h.devices.stream.track.end();
    await mic.start();
    expect(mic.getStatus().kind).toBe('conectado');
    expect(h.contexts).toHaveLength(2);
  });

  it('stop() libera pista, nodos, contexto, temporizador y oyentes, y queda «inactivo»', async () => {
    const { h, mic, events } = await started();
    h.context.analyser.signal = concat(silence(1300), pianoNote(64, { ms: 4000 }));
    h.advance(2000);
    mic.stop();
    expect(mic.getStatus()).toEqual({ kind: 'inactivo' });
    expect(h.devices.stream.track.stopped).toBe(true);
    expect(h.devices.stream.track.onended).toBeNull();
    expect(h.context.sourceDisconnected).toBe(true);
    expect(h.context.analyser.disconnected).toBe(true);
    expect(h.context.closed).toBe(true);
    expect(h.timers.active).toBe(0);
    expect(h.visibility.listenerCount()).toBe(0);
    expect(h.context.listenerCount()).toBe(0);
    expect(events.at(-1)).toMatchObject({ type: 'off', note: 64 });
    expect(mic.getMonitor().phase).toBe('apagado');
  });

  it('si se apaga mientras se espera el permiso, la pista se suelta y no queda nada escuchando', async () => {
    const { h, mic } = build();
    h.devices.holdResponse = true;
    const pending = mic.start();
    mic.stop();
    h.devices.release();
    await pending;
    expect(h.devices.stream.track.stopped).toBe(true);
    expect(h.context.closed).toBe(true);
    expect(h.timers.active).toBe(0);
    expect(mic.getStatus()).toEqual({ kind: 'inactivo' });
  });

  it('volver a llamar a start() no duplica temporizadores ni eventos', async () => {
    const { h, mic, events } = await started();
    await mic.start();
    expect(h.timers.active).toBe(1);
    h.context.analyser.signal = NOTE_SIGNAL;
    h.advance(3200);
    expect(events.filter((event) => event.type === 'on')).toHaveLength(1);
  });
});

describe('MicrophoneInput · pestaña oculta y audio suspendido', () => {
  it('con la pestaña oculta se suspende de forma visible y no se oyen notas', async () => {
    const { h, mic, events } = await started();
    h.advance(1400);
    h.visibility.set(true);
    expect(mic.getMonitor().phase).toBe('suspendido');
    h.context.analyser.signal = concat(
      silence(h.context.currentTime * 1000),
      pianoNote(64, { ms: 800 }),
    );
    h.advance(1500);
    expect(events).toHaveLength(0);
  });

  it('al volver a la pestaña mide el ruido otra vez y escucha', async () => {
    const { h, mic, events } = await started();
    h.advance(1400);
    h.visibility.set(true);
    h.advance(300);
    h.visibility.set(false);
    expect(mic.getMonitor().phase).toBe('calibrando');
    const base = Math.round(h.context.currentTime * 48000);
    h.context.analyser.signal = concat(
      new Float32Array(base),
      silence(1300),
      pianoNote(67, { ms: 800 }),
      silence(600),
    );
    h.advance(3000);
    expect(events.filter((event) => event.type === 'on').map((event) => event.note)).toEqual([67]);
  });

  it('si el contexto de audio se suspende, lo muestra y se recupera al reanudarse', async () => {
    const { h, mic } = await started();
    h.advance(1400);
    h.context.setState('suspended');
    expect(mic.getMonitor().phase).toBe('suspendido');
    h.context.setState('running');
    expect(mic.getMonitor().phase).toBe('calibrando');
  });
});
