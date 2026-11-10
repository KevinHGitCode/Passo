# src/core — dominio, servicios y puertos

TypeScript puro, sin React ni APIs del navegador. Lo imponen `.dependency-cruiser.cjs` y `eslint.config.js`:
`core` no importa `adapters` ni `ui`, ni paquetes externos.

## Capas

- `domain/`: reglas y datos puros (notas, lecciones, canciones, acordes, afinador, DSP). Funciones sin estado;
  **el tiempo entra por parámetro** (`nowMs`), nunca se lee un reloj.
- `application/`: servicios con estado. Exponen `subscribe` / `getSnapshot` (la UI los lee con `useSyncExternalStore`)
  y reciben sus dependencias por constructor (`{ input, clock, schedule… }`).
- `ports/`: las interfaces que implementan los adapters (`NoteInput`, `InputMonitor`, `FrameSource`, `ToneOutput`…).

## Trampas

- **Prohibidos `window`, `setTimeout`, `setInterval` y similares** (lint). Si necesitas diferir algo, inyecta
  `schedule` o un reloj (`FakeClock` en pruebas).
- `exactOptionalPropertyTypes` y `noUncheckedIndexedAccess`: una propiedad opcional se declara `x?: T | undefined`
  si puede pasarse explícitamente `undefined`; el acceso por índice devuelve `T | undefined`.
- Nombres y comentarios en español. Una nota se identifica por MIDI (60 = Do central = Do4); lo que se **juzga es
  la nota**, no el instrumento (guitarra: `octaveFree`, claves de tecla `g:64`).
- Las preferencias (`domain/preferences.ts`) se validan al leer: un campo nuevo necesita su `parse`, su valor por
  omisión, `samePreferences` y no debe subir `PREFERENCES_VERSION` si es compatible hacia atrás.
- Las heurísticas de DSP (picos espectrales, plantillas de acordes, rasgueo y su dirección) están afinadas con
  guitarra **sintética** (`tests/support/synth.ts`). Si cambias un umbral, di qué audio lo respalda.

## Al agregar algo

1. Tipo y función pura en `domain/` con su prueba en `tests/core/`.
2. Servicio en `application/` solo si hay estado; prueba en `tests/integration/` con fakes de `tests/fakes/`.
3. Se cablea en `src/compose.ts` y `src/main.tsx`, no antes.
