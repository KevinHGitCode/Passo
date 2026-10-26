import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { LessonFlow } from '@/core/application/lesson-flow';
import type { PracticeSession } from '@/core/application/practice-session';
import { parseRoute, routeKey, routeTitle } from './routes';
import type { Route } from './routes';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const getHash = (): string => window.location.hash;

/** La pantalla que corresponde a la dirección actual; cambia con `hashchange` (atrás, enlaces…). */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, () => '');
  return useMemo(() => parseRoute(hash), [hash]);
}

/**
 * Al cambiar de pantalla: sale de la lección si ya no estás en ella y vacía la sesión al dejar la
 * práctica libre (las entradas siguen vivas: si no, contarían notas sin pantalla). Es idempotente,
 * así vale aunque React repita el efecto.
 */
export function useRouteLifecycle(route: Route, session: PracticeSession, flow: LessonFlow): void {
  const previous = useRef<Route['name'] | null>(null);
  const name = route.name;
  useEffect(() => {
    const before = previous.current;
    previous.current = name;
    if (name !== 'leccion') flow.leave();
    if (before === 'practica' && name !== 'practica') session.reset();
  }, [name, session, flow]);
}

/**
 * Pone el título de la página y, al navegar, lleva el foco al encabezado de la pantalla nueva
 * (`[data-route-heading]`): así un lector de pantalla anuncia dónde estás. No se mueve el foco al
 * cargar la página la primera vez (ni cuando React repite el efecto en desarrollo): solo si la
 * pantalla es distinta de la última anunciada.
 */
export function useRouteAnnouncer(route: Route): void {
  const announced = useRef<string | null>(null);
  const key = routeKey(route);
  useEffect(() => {
    document.title = `${routeTitle(route)} · Passo`;
    const before = announced.current;
    announced.current = key;
    if (before === null || before === key) return;
    document.querySelector<HTMLElement>('[data-route-heading]')?.focus({ preventScroll: true });
    // Solo cuando cambia la pantalla (la clave), no por la identidad del objeto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
