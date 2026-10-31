import { useEffect } from 'react';
import type { PreferencesService } from '@/core/application/preferences-service';
import type { Instrument } from '@/core/domain/instrument';
import { caminoOf, hrefOf, progresoOf } from './routes';
import type { Route } from './routes';

/** El instrumento que pide la dirección (`#/guitarra`), o `undefined` si no dice ninguno. */
function instrumentOf(route: Route): Instrument | undefined {
  return route.name === 'camino' || route.name === 'progreso' ? route.instrument : undefined;
}

/**
 * La dirección manda sobre lo elegido: abrir `#/guitarra` (un enlace, «atrás», una dirección guardada)
 * pasa a guitarra. El selector de instrumento hace lo contrario: cambia la dirección.
 */
export function useInstrumentFromRoute(route: Route, preferences: PreferencesService): void {
  const wanted = instrumentOf(route);
  useEffect(() => {
    if (wanted !== undefined && wanted !== preferences.getSnapshot().instrument) {
      preferences.update({ instrument: wanted });
    }
  }, [wanted, preferences]);
}

/**
 * `#/` y `#/progreso` (sin instrumento) se reescriben con el instrumento que se ve, sin añadir una entrada
 * al historial: la dirección siempre dice qué camino estás viendo.
 */
export function useCanonicalRoute(route: Route, instrument: Instrument): void {
  const name = route.name;
  const bare = (name === 'camino' || name === 'progreso') && instrumentOf(route) === undefined;
  useEffect(() => {
    if (!bare) return;
    try {
      const canonical = name === 'progreso' ? progresoOf(instrument) : caminoOf(instrument);
      window.history.replaceState(window.history.state, '', hrefOf(canonical));
    } catch {
      return; // Sin historial (entornos restringidos): la dirección corta sigue valiendo.
    }
    // `replaceState` no avisa: se avisa a mano para que la pantalla lea la dirección nueva.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, [bare, name, instrument]);
}
