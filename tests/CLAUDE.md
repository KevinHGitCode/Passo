# tests

Vitest para todo salvo `e2e/` (Playwright sobre **Edge**, sin descargar navegadores).

| Carpeta | Qué prueba | Entorno |
|---|---|---|
| `core/` | dominio puro | node |
| `integration/` | servicios de `application/` con fakes | node |
| `adapters/` | micrófono, MIDI, almacenamiento con fakes de la API del navegador | node |
| `ui/` | pantallas React con Testing Library | primera línea `// @vitest-environment jsdom` |
| `e2e/` | la app compilada en un navegador real | Playwright (`npm run e2e`) |

- `fakes/` (reloj, entradas, preferencias, micrófono…) y `support/` (`synth.ts` guitarra/piano sintéticos,
  `strum.ts`, `pipeline.ts`) son lo reutilizable: úsalos antes de escribir otro doble.
- Sin `!` (non-null assertion) en pruebas (lint). El tiempo se controla con `FakeClock`, no con esperas reales.
- Las pruebas de audio pesadas tienen tiempo de 5 s: con el equipo cargado fallan sin ser un fallo real.

## e2e

- Se compila y sirve en el puerto **5180** (`playwright.config.ts`); el servidor de desarrollo usa el 5173.
- `E2E_VIDEO=off` apaga el video (mucho más rápido). Una prueba suelta: `npx playwright test <archivo> -g "<nombre>"`.
  La suite completa tarda ≈6 min: córrela una vez al cerrar una tanda, no tras cada cambio.
- `FAKE_MIC_SCRIPT` y `micNote` / `micStrum` (`e2e/mic-helpers.ts`) simulan el micrófono; `chooseInput` deja guardada
  la entrada antes de cargar. `readme.spec.ts` genera las capturas del README **solo** con `README_SHOTS=1`.
- Las pruebas escriben capturas en `evidencias/<tema>/`; tras correrlas, restaura lo ajeno con
  `git checkout -- evidencias/<carpeta>` para no ensuciar el diff.
- Al cambiar un texto o un `data-testid` de la interfaz, actualiza aquí los e2e que lo usan
  (`grep -rn "<testid>" tests`).
