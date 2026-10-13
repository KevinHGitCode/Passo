import { useEffect, useState, useSyncExternalStore } from 'react';
import type {
  PracticeSession,
  SessionFeedback,
  SessionSnapshot,
} from '@/core/application/practice-session';

/** La interfaz solo se suscribe al estado que vive en `core`. */
export function useSessionSnapshot(session: PracticeSession): SessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}

const FEEDBACK_VISIBLE_MS = { correct: 700, error: 1600 } as const;

/** Devuelve el feedback solo durante un rato (breve si acertó, más largo si falló). */
export function useRecentFeedback(feedback: SessionFeedback | null): SessionFeedback | null {
  const [expiredId, setExpiredId] = useState(0);
  const id = feedback?.id ?? 0;
  const duration =
    feedback?.outcome.kind === 'error' ? FEEDBACK_VISIBLE_MS.error : FEEDBACK_VISIBLE_MS.correct;

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
