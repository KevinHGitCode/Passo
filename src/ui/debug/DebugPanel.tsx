import { useEffect, useRef, useState } from 'react';
import type { PracticeSession } from '@/core/application/practice-session';
import type { AudioControl } from '@/core/ports/audio-control';
import type { InputMonitor } from '@/core/ports/input-monitor';
import { useMonitor, useSessionSnapshot } from '../practice/hooks';
import { latencyStats } from './latency';

declare global {
  interface Window {
    /** Muestras de latencia (ms) evento → siguiente fotograma; solo con `?debug`. */
    __passoLatency?: number[];
    /** Intentos de la ronda (nota pedida, nota oída, confianza…); solo con `?debug`. */
    __passoAttempts?: unknown[];
    /** Mediciones de acordes por micrófono (relación con el ruido, pico y subida de cada nota); solo con `?debug`. */
    __passoChords?: unknown[];
  }
}

/** Panel de depuración (`?debug`): mide cuánto tarda en verse en pantalla una pulsación. */
export function DebugPanel({
  session,
  audio,
  microphone,
}: {
  readonly session: PracticeSession;
  readonly audio: AudioControl;
  readonly microphone?: InputMonitor | undefined;
}) {
  const snapshot = useSessionSnapshot(session);
  const monitor = useMonitor(microphone);
  const samples = useRef<number[]>([]);
  const [shown, setShown] = useState<readonly number[]>([]);
  const attempts = snapshot.exercise?.attempts;
  useEffect(() => {
    window.__passoAttempts = (attempts ?? []).map((attempt) => ({
      objetivo: attempt.targetMidi,
      oido: attempt.playedMidi,
      acierto: attempt.isCorrect,
      confianza: attempt.detectionConfidence,
      reaccionMs: Math.round(attempt.reactionMs),
      en: Math.round(attempt.playedAt),
    }));
  }, [attempts]);

  // Mediciones de acordes: se releen con cada resultado (el micrófono las guarda; aquí solo se copian).
  const chordLog = microphone?.getChordLog?.() ?? [];
  const chordCount = chordLog.length;
  useEffect(() => {
    window.__passoChords = chordLog.map((item) => ({
      en: Math.round(item.at),
      esperado: item.expected,
      notas: item.notes.map((note) => ({
        nota: note.midi,
        suena: note.present,
        snr: Math.round(note.snr * 10) / 10,
        pico: Math.round(note.peak * 10) / 10,
        subida: Number.isFinite(note.rise) ? Math.round(note.rise * 10) / 10 : null,
      })),
      deMas: item.extras,
    }));
  });

  const feedbackId = snapshot.feedback?.id ?? 0;
  const outcome = snapshot.feedback?.outcome;
  const playedAt =
    outcome === undefined || outcome.kind === 'dudoso'
      ? undefined
      : outcome.kind === 'parcial'
        ? outcome.at
        : outcome.attempt.playedAt;

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
      {microphone && (
        <span data-testid="debug-listen-stats">
          Oído en la ronda: alta {snapshot.listenStats.alta} · media {snapshot.listenStats.media} ·
          dudosas {snapshot.listenStats.dudoso} · ecos {snapshot.listenStats.eco}
        </span>
      )}
      {microphone?.getChordLog && (
        <span data-testid="debug-chords">
          Acordes medidos: {chordCount} · completos{' '}
          {chordLog.filter((item) => item.notes.every((note) => note.present)).length}
        </span>
      )}
      {microphone && (
        <span data-testid="debug-mic">
          Micrófono: {monitor.phase} · nivel {monitor.level.toFixed(2)}
          {monitor.heard ? ` · oigo ${monitor.heard.midi} (${monitor.heard.cents} cents)` : ''}
          {monitor.tuningOffsetCents !== null
            ? ` · afinación ${monitor.tuningOffsetCents} cents`
            : ''}
        </span>
      )}
    </aside>
  );
}
