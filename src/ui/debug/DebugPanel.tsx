import { useEffect, useRef, useState } from 'react';
import type { PracticeSession } from '@/core/application/practice-session';
import type { AudioControl } from '@/core/ports/audio-control';
import { useSessionSnapshot } from '../practice/hooks';
import { latencyStats } from './latency';

declare global {
  interface Window {
    /** Muestras de latencia (ms) evento → siguiente fotograma; solo con `?debug`. */
    __passoLatency?: number[];
  }
}

/** Panel de depuración (`?debug`): mide cuánto tarda en verse en pantalla una pulsación. */
export function DebugPanel({
  session,
  audio,
}: {
  readonly session: PracticeSession;
  readonly audio: AudioControl;
}) {
  const snapshot = useSessionSnapshot(session);
  const samples = useRef<number[]>([]);
  const [shown, setShown] = useState<readonly number[]>([]);
  const feedbackId = snapshot.feedback?.id ?? 0;
  const playedAt = snapshot.feedback?.outcome.attempt.playedAt;

  useEffect(() => {
    if (feedbackId === 0 || playedAt === undefined) return undefined;
    const frame = window.requestAnimationFrame(() => {
      samples.current.push(performance.now() - playedAt);
      window.__passoLatency = samples.current;
      setShown([...samples.current]);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [feedbackId, playedAt]);

  const stats = latencyStats(shown);
  const format = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)} ms`);
  const audioLatency = audio.estimatedLatencyMs?.() ?? null;

  return (
    <aside className="debug" data-testid="debug" aria-label="Depuración">
      <strong>Depuración</strong>
      <span>Pulsaciones: {stats.count}</span>
      <span>Evento→pantalla p50 {format(stats.p50)}</span>
      <span>p95 {format(stats.p95)}</span>
      <span>máx {format(stats.max)}</span>
      <span>Audio (salida est.) {format(audioLatency)}</span>
    </aside>
  );
}
