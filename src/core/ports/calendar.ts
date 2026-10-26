/**
 * El calendario de la persona: qué día es **allí** (hora local). Aparte del `Clock`, que es
 * monotónico y sirve para medir tiempos, no para saber la fecha.
 */
export interface Calendar {
  /** El día local como `AAAA-MM-DD`. */
  today(): string;
}
