// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { PracticeSession } from '@/core/application/practice-session';
import { LEVEL_1_CONFIG } from '@/core/domain/exercise';
import type { NoteConfidence } from '@/core/domain/note-event';
import { createSeededRng } from '@/core/domain/rng';
import { hintText, monitorNotice, checkMessage } from '@/ui/listen/listen-messages';
import { SILENT_MONITOR } from '@/core/ports/input-monitor';
import { PracticeScreen } from '@/ui/practice/PracticeScreen';
import { FakeClock } from '../fakes/fake-clock';
import { FakeMicInput } from '../fakes/fake-mic-input';
import { FakeNoteInput } from '../fakes/fake-note-input';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(options: { withPc?: boolean } = {}) {
  const mic = new FakeMicInput();
  const pc = new FakeNoteInput('teclado-pc');
  const session = new PracticeSession({
    inputs: options.withPc ? [mic, pc] : [mic],
    audio: { noteOn: () => undefined, noteOff: () => undefined },
    clock: new FakeClock(0),
    rng: createSeededRng(4),
    config: { ...LEVEL_1_CONFIG, roundSize: 3 },
    primarySource: 'microfono',
  });
  render(
    <PracticeScreen
      session={session}
      theme="auto"
      onCycleTheme={() => undefined}
      microphone={mic}
      canStartWithoutMic={options.withPc === true}
    />,
  );
  let atCounter = 0;
  const hear = (note: number, confidence: NoteConfidence = 'alta') =>
    act(() =>
      mic.emitEvent({
        type: 'on',
        note,
        velocity: 70,
        at: (atCounter += 2000),
        source: 'microfono',
        confidence,
      }),
    );
  const targetMidi = () => Number(screen.getByTestId('target-note').dataset['midi']);
  return { mic, pc, session, hear, targetMidi };
}

describe('Bienvenida con micrófono', () => {
  it('apagado: explica la privacidad y ofrece «Activar micrófono» (nunca pide permiso solo)', () => {
    const { mic } = setup();
    const panel = screen.getByTestId('mic-panel');
    expect(panel.textContent).toContain('no se graba ni se envía');
    expect(mic.starts).toBe(0);
    fireEvent.click(screen.getByTestId('activate-mic'));
    expect(mic.starts).toBe(1);
    expect(screen.queryByTestId('start')).toBeNull();
  });

  it('pidiendo permiso: pide elegir «Permitir»', () => {
    const { mic } = setup();
    act(() => mic.setStatus({ kind: 'iniciando' }));
    expect(screen.getByTestId('mic-panel').textContent).toContain('Esperando tu permiso');
  });

  it('permiso denegado: guía paso a paso y botón «Reintentar»', () => {
    const { mic } = setup();
    act(() => mic.setStatus({ kind: 'permiso-denegado' }));
    const panel = screen.getByTestId('mic-panel');
    expect(panel.textContent).toContain('bloqueado');
    expect(panel.querySelectorAll('li')).toHaveLength(3);
    fireEvent.click(screen.getByTestId('retry-mic'));
    expect(mic.starts).toBe(1);
  });

  it('sin micrófono, ocupado, sin soporte y perdido tienen texto propio', () => {
    const { mic } = setup();
    act(() => mic.setStatus({ kind: 'sin-dispositivo' }));
    expect(screen.getByTestId('mic-panel').textContent).toContain('No encuentro ningún micrófono');
    act(() => mic.setStatus({ kind: 'sin-dispositivo', reason: 'ocupado' }));
    expect(screen.getByTestId('mic-panel').textContent).toContain('Otra aplicación');
    act(() => mic.setStatus({ kind: 'sin-soporte' }));
    expect(screen.getByTestId('mic-panel').textContent).toContain('Chrome o Edge');
    act(() => mic.setStatus({ kind: 'desconectado', deviceName: 'Micro' }));
    expect(screen.getByTestId('mic-panel').textContent).toContain('Se perdió el micrófono');
  });

  it('midiendo el ruido: muestra el avance', () => {
    const { mic } = setup();
    act(() => {
      mic.setStatus({ kind: 'conectado', deviceName: 'Micro' });
      mic.setMonitor({ phase: 'calibrando', calibration: 0.5 });
    });
    expect(screen.getByTestId('mic-panel').textContent).toContain('Guarda silencio');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
  });

  it('listo: prueba rápida del Do central, resalta Do4 y permite empezar', () => {
    const { mic } = setup();
    act(() => mic.makeReady());
    expect(screen.getByTestId('mic-check').textContent).toContain('Toca el Do central');
    expect(
      screen
        .getByTestId('piano')
        .querySelector('[data-midi="60"]')
        ?.classList.contains('key--target'),
    ).toBe(true);
    act(() => mic.setMonitor({ heard: { midi: 60, cents: 4 } }));
    expect(screen.getByTestId('mic-check').textContent).toContain('✓ Te oigo bien: Do4');
    expect(screen.getByTestId('start')).toBeTruthy();
  });

  it('si oye otra octava o otra nota, explica la causa probable', () => {
    const { mic } = setup();
    act(() => mic.makeReady());
    act(() => mic.setMonitor({ heard: { midi: 72, cents: 0 } }));
    expect(screen.getByTestId('mic-check').textContent).toContain('una octava más arriba');
    act(() => mic.setMonitor({ heard: { midi: 62, cents: 0 } }));
    expect(screen.getByTestId('mic-check').textContent).toContain('transpuesto');
  });

  it('con otras entradas (teclado del PC) se puede empezar sin micrófono', () => {
    const { session } = setup({ withPc: true });
    fireEvent.click(screen.getByTestId('start'));
    expect(session.getSnapshot().phase).toBe('en-curso');
  });
});

describe('Escucha activa durante la ronda', () => {
  function startRound() {
    const parts = setup();
    act(() => parts.mic.makeReady());
    fireEvent.click(screen.getByTestId('start'));
    return parts;
  }

  it('la tira «Oigo: …» muestra la nota oída y el medidor siempre está en su sitio', () => {
    const { mic } = startRound();
    expect(screen.getByTestId('listen')).toBeTruthy();
    expect(screen.getByTestId('heard-note').textContent).toContain('—');
    act(() => mic.setMonitor({ heard: { midi: 64, cents: -5 }, level: 0.5 }));
    expect(screen.getByTestId('heard-note').textContent).toContain('Oigo: Mi4');
    expect(screen.getByTestId('meter')).toBeTruthy();
  });

  it('la nota oída se marca en el teclado con «key--heard», no como pulsada', () => {
    const { mic } = startRound();
    act(() => mic.setMonitor({ heard: { midi: 65, cents: 0 } }));
    const key = screen.getByTestId('piano').querySelector('[data-midi="65"]');
    expect(key?.classList.contains('key--heard')).toBe(true);
    expect(key?.classList.contains('key--pressed')).toBe(false);
  });

  it('un acierto oído avanza y se confirma con el feedback verde', () => {
    const { hear, targetMidi } = startRound();
    hear(targetMidi());
    expect(screen.getByTestId('counters').textContent).toContain('Notas 1/3');
    expect(screen.getByTestId('feedback').dataset['tone']).toBe('ok');
  });

  it('una nota dudosa se muestra neutra («No te oí bien») y no suma errores', () => {
    const { hear, targetMidi } = startRound();
    hear(targetMidi() === 60 ? 62 : 60, 'media');
    const feedback = screen.getByTestId('feedback');
    expect(feedback.dataset['tone']).toBe('neutral');
    expect(feedback.textContent).toContain('No te oí bien');
    expect(screen.getByTestId('counters').textContent).toContain('Errores 0');
  });

  it('una nota errónea con confianza alta es un error normal', () => {
    const { hear, targetMidi } = startRound();
    hear(targetMidi() === 60 ? 62 : 60, 'alta');
    expect(screen.getByTestId('feedback').dataset['tone']).toBe('error');
  });

  it('si se pierde el micrófono la ronda se pausa y se puede reactivar', () => {
    const { mic } = startRound();
    act(() => mic.setStatus({ kind: 'desconectado', deviceName: 'Micro' }));
    expect(screen.getByText('Se perdió el micrófono. Reactívalo para seguir.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('reactivate-mic'));
    expect(mic.starts).toBe(1);
  });

  it('avisos de «no te oí»: el texto va en la tira y en la región aria-live', () => {
    const { mic } = startRound();
    act(() => mic.setMonitor({ hint: 'debil' }));
    expect(screen.getByTestId('listen-notice').textContent).toContain('Casi no te oigo');
    expect(within(screen.getByTestId('live')).getByText(/Casi no te oigo/)).toBeTruthy();
  });

  it('con saturación el medidor cambia de estilo', () => {
    const { mic } = startRound();
    act(() => mic.setMonitor({ clipping: true, hint: 'saturado', level: 1 }));
    expect(screen.getByTestId('meter').querySelector('.meter__fill--clip')).not.toBeNull();
  });

  it('errores iguales sobre notas pedidas distintas avisan de un posible teclado transpuesto', () => {
    const { hear, targetMidi } = startRound();
    hear(targetMidi() + 2);
    hear(targetMidi());
    hear(targetMidi() + 2);
    hear(targetMidi());
    hear(targetMidi() + 2);
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId('stage-idle').textContent).toContain('transpuesto 2 semitonos');
  });
});

describe('mensajes de escucha', () => {
  it('hay un texto para cada aviso', () => {
    for (const hint of ['saturado', 'debil', 'confuso', 'ruidoso', 'sin-senal'] as const) {
      expect(hintText(hint).length).toBeGreaterThan(20);
    }
  });

  it('monitorNotice da prioridad al aviso, luego a filtros del navegador y a la desafinación', () => {
    const base = { ...SILENT_MONITOR, phase: 'escuchando' as const };
    expect(monitorNotice({ ...base, hint: 'debil', degraded: true })).toContain('Casi no te oigo');
    expect(monitorNotice({ ...base, degraded: true })).toContain('Mejoras de audio');
    expect(monitorNotice({ ...base, tuningOffsetCents: -30 })).toContain('−30 cents');
    expect(monitorNotice({ ...base, tuningOffsetCents: 10 })).toBeNull();
  });

  it('checkMessage cubre espera, acierto, octava y otra nota, en ambas notaciones', () => {
    expect(checkMessage(null, 'latina').tone).toBe('espera');
    expect(checkMessage(60, 'americana').text).toContain('C4');
    expect(checkMessage(48, 'latina').text).toContain('una octava más abajo');
    expect(checkMessage(84, 'latina').text).toContain('2 octavas más arriba');
    expect(checkMessage(61, 'latina').text).toContain('1 semitono más agudo');
  });
});

describe('Revisión de la Fase 1 (interfaz)', () => {
  function ready() {
    const parts = setup();
    act(() => parts.mic.makeReady());
    fireEvent.click(screen.getByTestId('start'));
    return parts;
  }

  it('«No te oí bien» se queda 3 s para poder leerse (un acierto solo 0,7 s)', () => {
    const { hear, targetMidi } = ready();
    hear(targetMidi() === 60 ? 62 : 60, 'media');
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByTestId('feedback')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.queryByTestId('feedback')).toBeNull();
  });

  it('otra octava con confianza alta se muestra neutra y explicada, no como error', () => {
    const { hear, targetMidi } = ready();
    hear(targetMidi() + 12, 'alta');
    const feedback = screen.getByTestId('feedback');
    expect(feedback.dataset['tone']).toBe('neutral');
    expect(feedback.textContent).toContain('una octava más arriba');
    expect(feedback.textContent).toContain('No cuenta como error');
    expect(screen.getByTestId('counters').textContent).toContain('Errores 0');
  });

  it('la pausa por micrófono perdido se anuncia con su motivo', () => {
    const { mic } = ready();
    act(() => mic.setStatus({ kind: 'desconectado', deviceName: 'Micro' }));
    expect(screen.getByTestId('live').textContent).toContain('Se perdió el micrófono');
  });

  it('el foco pasa al título del panel cuando cambia el estado del micrófono (el botón pulsado desaparece)', () => {
    const { mic } = setup();
    act(() => mic.setStatus({ kind: 'iniciando' }));
    expect(document.activeElement?.tagName).toBe('H2');
    expect(document.activeElement?.textContent).toContain('Esperando tu permiso');
  });

  it('la comprobación del Do central se anuncia (role=status) y explica dónde está el Do central', () => {
    const { mic } = setup();
    act(() => mic.makeReady());
    const check = screen.getByTestId('mic-check');
    expect(check.getAttribute('role')).toBe('status');
    expect(check.textContent).toContain('tercer Do desde la izquierda');
  });

  it('la tira dice la causa concreta cuando el micrófono no está listo', () => {
    const { mic } = ready();
    const idle = () => screen.getByTestId('listen-idle').textContent;
    act(() => mic.setStatus({ kind: 'desconectado', deviceName: 'Micro' }));
    expect(idle()).toContain('Se perdió el micrófono');
    act(() => mic.setStatus({ kind: 'permiso-denegado' }));
    expect(idle()).toContain('bloqueado');
    act(() => mic.setStatus({ kind: 'sin-dispositivo' }));
    expect(idle()).toContain('No encuentro');
  });

  it('el chip del micrófono dice «Midiendo ruido…» y «Escucha en pausa» según la fase', async () => {
    const { StatusZone } = await import('@/ui/status/StatusZone');
    const mic = new FakeMicInput();
    act(() => {
      mic.setStatus({ kind: 'conectado', deviceName: 'Micro' });
      mic.setMonitor({ phase: 'calibrando', calibration: 0.3 });
    });
    render(
      <StatusZone
        inputs={[mic]}
        microphone={mic}
        showAudio={false}
        audio={{
          getStatus: () => 'listo',
          subscribeStatus: () => () => undefined,
          unlock: () => Promise.resolve(),
        }}
      />,
    );
    expect(screen.getByTestId('status-microfono').textContent).toContain('Midiendo ruido');
    act(() => mic.setMonitor({ phase: 'suspendido' }));
    expect(screen.getByTestId('status-microfono').textContent).toContain('Escucha en pausa');
    act(() => mic.setMonitor({ phase: 'escuchando' }));
    expect(screen.getByTestId('status-microfono').textContent).toContain('Te escucho');
  });
});

describe('panel ?debug', () => {
  it('muestra el reparto de lo oído (alta, media, dudosas y ecos) para ajustar umbrales', async () => {
    const { DebugPanel } = await import('@/ui/debug/DebugPanel');
    const mic = new FakeMicInput();
    const session = new PracticeSession({
      inputs: [mic],
      audio: { noteOn: () => undefined, noteOff: () => undefined },
      clock: new FakeClock(0),
      rng: createSeededRng(4),
      config: { ...LEVEL_1_CONFIG, roundSize: 5 },
    });
    session.start();
    const target = session.getSnapshot().exercise?.target ?? 60;
    render(
      <DebugPanel
        session={session}
        microphone={mic}
        audio={{
          getStatus: () => 'listo',
          subscribeStatus: () => () => undefined,
          unlock: () => Promise.resolve(),
        }}
      />,
    );
    act(() =>
      mic.emitEvent({
        type: 'on',
        note: target,
        velocity: 70,
        at: 100,
        source: 'microfono',
        confidence: 'alta',
      }),
    );
    expect(screen.getByTestId('debug-listen-stats').textContent).toContain('alta 1');
    expect(screen.getByTestId('debug-listen-stats').textContent).toContain('media 0');
  });
});
