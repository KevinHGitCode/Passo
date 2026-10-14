import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type {
  PracticeSession,
  SessionFeedback,
  SessionSnapshot,
} from '@/core/application/practice-session';
import { SILENT_MONITOR } from '@/core/ports/input-monitor';
import type { InputMonitor, MonitorSnapshot } from '@/core/ports/input-monitor';
import type { InputStatus, NoteInput } from '@/core/ports/note-input';

/** La interfaz solo se suscribe al estado que vive en `core`. */
export function useSessionSnapshot(session: PracticeSession): SessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}

const FEEDBACK_VISIBLE_MS = { correct: 700, error: 1600, dudoso: 3000 } as const;

/** Devuelve el feedback solo durante un rato (breve si acertó, más largo si falló). */
export function useRecentFeedback(feedback: SessionFeedback | null): SessionFeedback | null {
  const [expiredId, setExpiredId] = useState(0);
  const id = feedback?.id ?? 0;
  const kind = feedback?.outcome.kind;
  const duration =
    kind === 'error'
      ? FEEDBACK_VISIBLE_MS.error
      : kind === 'dudoso'
        ? FEEDBACK_VISIBLE_MS.dudoso
        : FEEDBACK_VISIBLE_MS.correct;

  useEffect(() => {
    if (id === 0) return undefined;
    const timer = window.setTimeout(() => setExpiredId(id), duration);
    return () => window.clearTimeout(timer);
  }, [id, duration]);

  return feedback && feedback.id !== expiredId ? feedback : null;
}

/** `true` si la pantalla es estrecha (se muestran solo dos octavas). */
export function useIsNarrow(maxWidth = 599): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const subscribe = (onChange: () => void) => {
    if (typeof window.matchMedia !== 'function') return () => undefined;
    const media = window.matchMedia(query);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  };
  const getSnapshot = () =>
    typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false;
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Estado del monitor de escucha (nivel, nota oída, avisos); `SILENT_MONITOR` si no hay micrófono. */
export function useMonitor(monitor: InputMonitor | undefined): MonitorSnapshot {
  const subscribe = useCallback(
    (onChange: () => void) => (monitor ? monitor.subscribeMonitor(onChange) : () => undefined),
    [monitor],
  );
  const getSnapshot = useCallback(
    () => (monitor ? monitor.getMonitor() : SILENT_MONITOR),
    [monitor],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Estado de una entrada, o `null` si no existe. */
export function useInputStatus(input: NoteInput | undefined): InputStatus | null {
  const subscribe = useCallback(
    (onChange: () => void) => (input ? input.subscribeStatus(onChange) : () => undefined),
    [input],
  );
  const getSnapshot = useCallback(() => (input ? input.getStatus() : null), [input]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
