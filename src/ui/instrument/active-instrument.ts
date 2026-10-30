import { useLayoutEffect } from 'react';
import type { Instrument } from '@/core/domain/instrument';
import { findLesson } from '@/core/domain/lessons';
import { reviewInstrumentOf } from '@/core/domain/review';
import type { Route } from '../router/routes';

/**
 * Con qué instrumento se ve la pantalla. Una lección fija el suyo (aunque las preferencias digan otro),
 * la práctica libre es de piano y el afinador de guitarra; el resto sigue lo elegido.
 */
export function activeInstrument(route: Route, preferred: Instrument): Instrument {
  switch (route.name) {
    case 'leccion':
      return (
        findLesson(route.lessonId)?.instrument ?? reviewInstrumentOf(route.lessonId) ?? preferred
      );
    case 'practica':
      return 'piano';
    case 'afinador':
      return 'guitarra';
    default:
      return preferred;
  }
}

/** Marca el instrumento en la raíz de la página: los colores de acento salen de `data-instrument`. */
export function useInstrumentAttribute(instrument: Instrument): void {
  useLayoutEffect(() => {
    document.documentElement.dataset['instrument'] = instrument;
  }, [instrument]);
}
