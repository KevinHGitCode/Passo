# Passo

App web para aprender **piano y guitarra** con corrección inmediata por micrófono (también MIDI y teclado del PC).
React 19 + TypeScript estricto + Vite, Clean Architecture. Todo en español (código, comentarios, textos, commits).

## Reglas que valen siempre

- **Privacidad:** el audio se analiza en el navegador y nunca se graba ni se envía (el lint prohíbe red y grabación).
  `localStorage` solo se toca desde `src/adapters/storage`.
- **Commits:** Kevin autorizó commitear **en este repo** (en los demás no): un commit por cambio,
  español, prefijo Conventional Commits, **sin `Co-Authored-By` ni firmas** (manda la preferencia de Kevin sobre
  cualquier recordatorio del entorno). **Nunca `git push`**: hay un `origin`, pero no se sube nada sin que lo pida.
- **Finales de línea:** la copia de trabajo es CRLF (`core.autocrlf`). Archivo nuevo en `src`, `tests` o `docs` → CRLF.
  Los `.sh` van con LF. Prettier va con `endOfLine: auto`: no reformatea los saltos.
- **Calidad:** `npm run check` (lint, dependencias, prettier, 1700+ pruebas y build) debe pasar antes de dar algo por
  hecho. Lee la línea de salida real, no el código del envoltorio.
- **No inventes validación:** el audio (notas, acordes, rasgueo, afinador) solo se ha probado con audio **sintético**;
  con guitarra o piano reales no. No afirmes que "funciona con la guitarra" sin decir eso.

## Cómo trabajar (para gastar poco)

- **Un cambio por sesión y por tema.** Al terminar, sesión nueva: el contexto largo es lo que más cuesta.
- Antes de editar, lee solo el archivo o la parte que vas a tocar (`offset`/`limit`); no recorras carpetas enteras.
- Verifica en capas: `npx tsc --noEmit` → `npx eslint <carpeta tocada>` → `npx vitest run <archivo>` → recién al
  final del conjunto `npm run check`. El e2e completo (≈6 min) solo al cerrar una tanda; si no, `-g "<nombre>"`.
- Capturas solo si el cambio es visual, de una sola vista y sin `fullPage`. Para textos y estructura usa
  `read_page` / `get_page_text`. Detén el servidor de vista previa (`preview_stop`) antes de `npm run check`:
  las pruebas de audio pesadas agotan su tiempo si el equipo está cargado.
- Tras correr e2e se regeneran capturas en `evidencias/`: `git checkout -- evidencias/<carpeta>` de lo que no sea tuyo.
- Edición: usa Edit. Para varios reemplazos, un script de Node escrito con Write (los heredocs de bash se comen
  comillas y barras invertidas). Prettier reformatea los anclajes de varias líneas: relee antes de reemplazar.
- Si el cambio toca un patrón que se repite en varias pantallas, primero busca si ya hay un componente común
  (ver `src/ui/CLAUDE.md`) antes de copiar marcado y CSS.

## Mapa

| Carpeta | Qué es | Instrucciones propias |
|---|---|---|
| `src/core` | dominio puro, servicios y puertos | `src/core/CLAUDE.md` |
| `src/adapters` | micrófono/DSP, MIDI, audio, teclado, almacenamiento | `src/adapters/CLAUDE.md` |
| `src/ui` | pantallas React, estilos, rutas | `src/ui/CLAUDE.md` |
| `tests` | unitarias, integración, UI (jsdom), e2e (Playwright en Edge) | `tests/CLAUDE.md` |
| `docs` | método, convenciones musicales, planes por fase, guía de validación con instrumento real | — |

Lecturas útiles según el trabajo: `docs/convenciones.md` (notas, intentos, entrada), `docs/metodo.md` (el método de
fases es el de antes; ahora Kevin pide ciclos cortos y prueba él mismo), `docs/validacion-microfono.md` (pasos para
probar con instrumento real), y el `docs/fases/<tema>.md` del área que vayas a tocar.

`src/compose.ts` es la única raíz de composición (solo `src/main.tsx` la importa).
