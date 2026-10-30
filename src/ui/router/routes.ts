/**
 * Las pantallas de Passo y sus direcciones. La ruta es una **vista**, no la dueña del estado: lo que
 * pasa con la lección o la sesión lo decide la aplicación, y la ruta solo dice qué pantalla se ve.
 *
 * - `#/` (o vacío): el camino de aprendizaje.
 * - `#/leccion/<id>`: una lección (el resultado se ve dentro de ella, no tiene dirección propia).
 * - `#/progreso`: lo que llevas.
 * - `#/practica`: la práctica libre (la pantalla de siempre).
 * - `#/afinador`: el afinador de guitarra.
 */
export type Route =
  | { readonly name: 'camino' }
  | { readonly name: 'leccion'; readonly lessonId: string }
  | { readonly name: 'progreso' }
  | { readonly name: 'practica' }
  | { readonly name: 'afinador' };

export type RouteName = Route['name'];

export const CAMINO: Route = { name: 'camino' };
export const PROGRESO: Route = { name: 'progreso' };
export const PRACTICA: Route = { name: 'practica' };
export const AFINADOR: Route = { name: 'afinador' };

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** Convierte `location.hash` en una ruta. Lo desconocido lleva al camino (nunca falla). */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] ?? '';
  const [first, second] = path.split('/').filter(Boolean).map(decode);
  if (first === 'leccion' && second) return { name: 'leccion', lessonId: second };
  if (first === 'progreso') return PROGRESO;
  if (first === 'practica') return PRACTICA;
  if (first === 'afinador') return AFINADOR;
  return CAMINO;
}

export function lessonRoute(lessonId: string): Route {
  return { name: 'leccion', lessonId };
}

/** La dirección de una ruta, para un enlace (`href`). */
export function hrefOf(route: Route): string {
  switch (route.name) {
    case 'camino':
      return '#/';
    case 'leccion':
      return `#/leccion/${encodeURIComponent(route.lessonId)}`;
    case 'progreso':
      return '#/progreso';
    case 'practica':
      return '#/practica';
    case 'afinador':
      return '#/afinador';
  }
}

/** Identifica la pantalla (cambia al cambiar de lección aunque el nombre sea el mismo). */
export function routeKey(route: Route): string {
  return route.name === 'leccion' ? `leccion:${route.lessonId}` : route.name;
}

const TITLES: Readonly<Record<RouteName, string>> = {
  camino: 'Aprender',
  leccion: 'Lección',
  progreso: 'Progreso',
  practica: 'Práctica libre',
  afinador: 'Afinador',
};

export function routeTitle(route: Route): string {
  return TITLES[route.name];
}

/** Cambia de pantalla (la dirección cambia y `hashchange` hace el resto). */
export function navigate(route: Route): void {
  window.location.hash = hrefOf(route);
}
