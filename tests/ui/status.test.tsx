// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import type { AudioControl, AudioStatus } from '@/core/ports/audio-control';
import { latencyStats, percentile } from '@/ui/debug/latency';
import { describeAudioStatus, describeInputStatus } from '@/ui/status/describe-status';
import { StatusZone } from '@/ui/status/StatusZone';
import { FakeNoteInput } from '../fakes/fake-note-input';

afterEach(cleanup);

class FakeAudioControl implements AudioControl {
  status: AudioStatus = 'bloqueado';
  unlocked = 0;
  private readonly handlers = new Set<(status: AudioStatus) => void>();
  getStatus(): AudioStatus {
    return this.status;
  }
  subscribeStatus(handler: (status: AudioStatus) => void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  unlock(): Promise<void> {
    this.unlocked += 1;
    this.set('listo');
    return Promise.resolve();
  }
  set(status: AudioStatus): void {
    this.status = status;
    this.handlers.forEach((handler) => handler(status));
  }
}

describe('describeInputStatus', () => {
  it('cubre todos los estados del piano MIDI con texto claro', () => {
    expect(describeInputStatus('midi', { kind: 'conectado', deviceName: 'Yamaha' })).toMatchObject({
      tone: 'ok',
      text: 'Conectado: Yamaha',
    });
    expect(describeInputStatus('midi', { kind: 'sin-dispositivo' }).text).toContain('USB');
    expect(describeInputStatus('midi', { kind: 'iniciando' }).tone).toBe('info');
    expect(describeInputStatus('midi', { kind: 'sin-soporte' }).text).toContain('Chrome o Edge');
    const desconectado = describeInputStatus('midi', { kind: 'desconectado', deviceName: 'X' });
    expect(desconectado.tone).toBe('warn');
    expect(desconectado.text).toContain('pausa');
    const denegado = describeInputStatus('midi', { kind: 'permiso-denegado' });
    expect(denegado.tone).toBe('warn');
    expect(denegado.action).toEqual({ kind: 'retry', label: 'Reintentar' });
  });

  it('el teclado del PC siempre aparece activo', () => {
    expect(describeInputStatus('teclado-pc', { kind: 'iniciando' }).tone).toBe('ok');
  });
});

describe('describeAudioStatus', () => {
  it('bloqueado ofrece "Activar sonido"', () => {
    expect(describeAudioStatus('bloqueado').action).toEqual({
      kind: 'unlock',
      label: 'Activar sonido',
    });
    expect(describeAudioStatus('listo').tone).toBe('ok');
    expect(describeAudioStatus('sin-soporte').tone).toBe('warn');
  });
});

describe('StatusZone', () => {
  it('muestra cada entrada y el sonido, y reacciona a la desconexión en caliente', () => {
    const midi = new FakeNoteInput('midi');
    const audio = new FakeAudioControl();
    render(<StatusZone inputs={[midi]} audio={audio} />);
    expect(screen.getByTestId('status-midi').textContent).toContain('Buscando');

    act(() => midi.setStatus({ kind: 'conectado', deviceName: 'Yamaha PSR-E263' }));
    expect(screen.getByTestId('status-midi').textContent).toContain('Yamaha PSR-E263');

    act(() => midi.setStatus({ kind: 'desconectado', deviceName: 'Yamaha PSR-E263' }));
    expect(screen.getByTestId('status-midi').dataset['tone']).toBe('warn');
  });

  it('el botón "Activar sonido" desbloquea el audio y el aviso pasa a "listo"', () => {
    const audio = new FakeAudioControl();
    render(<StatusZone inputs={[]} audio={audio} />);
    expect(screen.getByTestId('status-audio').dataset['tone']).toBe('info');
    fireEvent.click(screen.getByText('Activar sonido'));
    expect(audio.unlocked).toBe(1);
    expect(screen.getByTestId('status-audio').dataset['tone']).toBe('ok');
  });

  it('"Reintentar" vuelve a pedir acceso al piano', () => {
    const midi = new FakeNoteInput('midi');
    let starts = 0;
    midi.start = () => {
      starts += 1;
      return Promise.resolve();
    };
    render(<StatusZone inputs={[midi]} audio={new FakeAudioControl()} />);
    act(() => midi.setStatus({ kind: 'permiso-denegado' }));
    fireEvent.click(screen.getByText('Reintentar'));
    expect(starts).toBe(1);
  });
});

describe('estadísticas de latencia', () => {
  it('percentiles por rango más cercano', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(samples, 50)).toBe(50);
    expect(percentile(samples, 95)).toBe(95);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 95)).toBeNull();
  });

  it('latencyStats resume cuenta, p50, p95 y máximo', () => {
    expect(latencyStats([10, 20, 30, 40, 100])).toEqual({ count: 5, p50: 30, p95: 100, max: 100 });
    expect(latencyStats([])).toEqual({ count: 0, p50: null, p95: null, max: null });
  });
});
