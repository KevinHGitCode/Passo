/** Reloj monotónico en milisegundos. La implementación real usa `performance.now()`. */
export interface Clock {
  now(): number;
}
