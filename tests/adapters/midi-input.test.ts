import { MidiNoteInput, parseMidiMessage } from '@/adapters/midi/midi-input';
import type { NoteEvent } from '@/core/domain/note-event';
import type { InputStatus } from '@/core/ports/note-input';
import { FakeMidiAccess, FakeMidiPort } from '../fakes/fake-midi-access';

async function setup(ports: FakeMidiPort[] = [new FakeMidiPort('p1')]) {
  const access = new FakeMidiAccess(ports);
  const input = new MidiNoteInput(() => Promise.resolve(access));
  const events: NoteEvent[] = [];
  const statuses: InputStatus[] = [];
  input.subscribe((event) => events.push(event));
  input.subscribeStatus((status) => statuses.push(status));
  await input.start();
  return { access, input, events, statuses, ports };
}

describe('parseMidiMessage', () => {
  const msg = (bytes: number[], timeStamp = 10) => ({ data: Uint8Array.from(bytes), timeStamp });

  it('note-on con velocidad > 0 es un on, con el timestamp del mensaje', () => {
    expect(parseMidiMessage(msg([0x90, 60, 100], 1234.5))).toEqual({
      type: 'on',
      note: 60,
      velocity: 100,
      at: 1234.5,
      source: 'midi',
    });
  });

  it('note-on con velocidad 0 y note-off son off, en cualquier canal', () => {
    expect(parseMidiMessage(msg([0x90, 60, 0]))?.type).toBe('off');
    expect(parseMidiMessage(msg([0x80, 60, 64]))?.type).toBe('off');
    expect(parseMidiMessage(msg([0x93, 64, 80]))).toMatchObject({ type: 'on', note: 64 });
    expect(parseMidiMessage(msg([0x8f, 64, 0]))).toMatchObject({ type: 'off', note: 64 });
  });

  it('ignora reloj, active sensing, controladores y mensajes incompletos', () => {
    expect(parseMidiMessage(msg([0xf8]))).toBeNull();
    expect(parseMidiMessage(msg([0xfe]))).toBeNull();
    expect(parseMidiMessage(msg([0xb0, 64, 127]))).toBeNull(); // pedal
    expect(parseMidiMessage(msg([0x90, 60]))).toBeNull();
    expect(parseMidiMessage({ data: null, timeStamp: 0 })).toBeNull();
  });
});

describe('MidiNoteInput', () => {
  it('sin Web MIDI en el navegador informa "sin-soporte"', async () => {
    const input = new MidiNoteInput(undefined);
    await input.start();
    expect(input.getStatus()).toEqual({ kind: 'sin-soporte' });
  });

  it('permiso denegado informa "permiso-denegado" y permite reintentar', async () => {
    let attempts = 0;
    const access = new FakeMidiAccess([new FakeMidiPort('p1')]);
    const input = new MidiNoteInput(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(Object.assign(new Error('denegado'), { name: 'SecurityError' }))
        : Promise.resolve(access);
    });
    await input.start();
    expect(input.getStatus()).toEqual({ kind: 'permiso-denegado' });
    await input.start();
    expect(input.getStatus()).toEqual({ kind: 'conectado', deviceName: 'Yamaha PSR-E263' });
  });

  it('otro error al pedir acceso se informa como "sin-soporte" sin lanzar', async () => {
    const input = new MidiNoteInput(() => Promise.reject(new Error('raro')));
    await expect(input.start()).resolves.toBeUndefined();
    expect(input.getStatus()).toEqual({ kind: 'sin-soporte' });
  });

  it('sin dispositivos informa "sin-dispositivo"', async () => {
    const { input } = await setup([]);
    expect(input.getStatus()).toEqual({ kind: 'sin-dispositivo' });
  });

  it('con un piano conectado emite notas con el timestamp exacto', async () => {
    const { events, ports } = await setup();
    ports[0]?.send([0x90, 62, 90], 500);
    ports[0]?.send([0x80, 62, 0], 650);
    expect(events).toEqual([
      { type: 'on', note: 62, velocity: 90, at: 500, source: 'midi' },
      { type: 'off', note: 62, velocity: 0, at: 650, source: 'midi' },
    ]);
  });

  it('desconexión en caliente: informa "desconectado" y reconecta al volver', async () => {
    const { access, input, events, ports } = await setup();
    const port = ports[0] as FakeMidiPort;
    access.unplug(port);
    expect(input.getStatus()).toEqual({ kind: 'desconectado', deviceName: 'Yamaha PSR-E263' });
    expect(port.listenerCount()).toBe(0);

    access.plug(port);
    expect(input.getStatus()).toEqual({ kind: 'conectado', deviceName: 'Yamaha PSR-E263' });
    port.send([0x90, 60, 70], 900);
    expect(events).toHaveLength(1);
  });

  it('conectar un piano después de abrir la página (sin-dispositivo → conectado)', async () => {
    const { access, input, events } = await setup([]);
    const port = new FakeMidiPort('nuevo', 'Piano USB');
    access.plug(port);
    expect(input.getStatus()).toEqual({ kind: 'conectado', deviceName: 'Piano USB' });
    port.send([0x90, 64, 80], 10);
    expect(events).toHaveLength(1);
  });

  it('con dos dispositivos, desconectar uno mantiene "conectado" con el otro', async () => {
    const a = new FakeMidiPort('a', 'Piano A');
    const b = new FakeMidiPort('b', 'Piano B');
    const { access, input } = await setup([a, b]);
    access.unplug(a);
    expect(input.getStatus()).toEqual({ kind: 'conectado', deviceName: 'Piano B' });
    access.unplug(b);
    expect(input.getStatus()).toEqual({ kind: 'desconectado', deviceName: 'Piano B' });
  });

  it('un dispositivo sin nombre se muestra como "Piano MIDI"', async () => {
    const { input } = await setup([new FakeMidiPort('x', null)]);
    expect(input.getStatus()).toEqual({ kind: 'conectado', deviceName: 'Piano MIDI' });
  });

  it('arrancar dos veces no duplica eventos y stop() suelta todo', async () => {
    const { access, input, events, ports } = await setup();
    await input.start();
    ports[0]?.send([0x90, 60, 90], 1);
    expect(events).toHaveLength(1);
    input.stop();
    expect(ports[0]?.listenerCount()).toBe(0);
    expect(access.listenerCount()).toBe(0);
  });
});
