# Informe de la prueba funcional — Fase 1 (escucha activa)

- **Fecha:** 2026-10-13
- **Navegador:** Microsoft Edge (instalado en el equipo), sobre la versión compilada.
- **Cómo repetirla:** `npm run e2e` (compila, levanta la app y ejecuta las 12 pruebas, de la Fase 0 y la Fase 1, regrabando video y capturas).
- **Resultado:** 12 de 12 pruebas pasan, y lo hicieron **3 de 3 veces seguidas** antes de esta corrida final. `npm run check` pasa (lint con reglas de privacidad, dependencias entre capas, formato, **371 pruebas** y build).

## Qué es el «micrófono simulado»

El Yamaha E263 no tiene USB-MIDI, así que la app oye la nota con el micrófono. En las pruebas, la página
sustituye `getUserMedia` por un flujo **real de audio** (un `MediaStream`) donde la prueba hace sonar notas tipo
piano (10 parciales con inarmonicidad, decaimiento y ráfaga de martillo), ruido y dos teclas a la vez. La app
ejecuta su tubería completa (captura, análisis, seguimiento, evaluación, pantalla). Lo que **no** reproduce es el
altavoz y la sala del instrumento real: eso lo valida Kevin (`docs/validacion-microfono.md`).

## Qué se probó

| Prueba | Qué comprueba | Evidencia |
|---|---|---|
| Ronda completa con el micrófono simulado | Micrófono apagado y nunca se pide solo; activar → mide el ruido → escucha; restricciones sin filtros; prueba rápida del Do central (octava distinta, teclado transpuesto, Do4 ✓); ronda de 20 notas; una nota equivocada («oí Fa4»); **ruido que no cuenta y avisa «no distingo la nota»**; **dos teclas a la vez sin error**; toque suave; resumen; latencia; **micrófono perdido → pausa → reactivar**; pestaña oculta; tema claro | `video-funcional.webm`, capturas 01–12, `latencia.json` |
| Estados del micrófono | Permiso denegado (con guía), sin micrófono, ocupado, y arreglado → reintentar | capturas 20–22 |
| Navegador sin micrófono | Mensaje «Usa Chrome o Edge» | captura 23 |
| Estabilidad visual | El teclado queda en la misma posición en 8 estados, a **1280×800 y 1366×650** | `estabilidad-visual-1280x800.json`, `estabilidad-visual-1366x650.json` |
| Móvil y daltonismo | 375 px; deuteranopía y acromatopsia con la marca de nota oída | capturas 30–33 |
| Portátil de poca altura | Todo (tira de escucha y teclado) cabe en 1366×650 sin desplazarse | captura 34 |

## Medidas

| Medida | Resultado | Criterio |
|---|---|---|
| Latencia sonido → pantalla (10 notas, micrófono simulado) | p50 119 ms · p95 136 ms | p50 ≤ 250 ms ✅ |
| Posición del teclado entre estados | variación ≤ 0,05 px en ambos tamaños | ≤ 1 px ✅ |
| Detección en el banco sintético (estrés: huecos de audio, temporizadores retrasados, 4 semillas × 60 notas) | ≥ 95 %, **0 notas falsas** | ≥ 95 % y 0 falsas ✅ |
| Coste del análisis de un fotograma | mediana < 3 ms (la detección de altura < 2 ms) | < 2 ms por detección ✅ |

La latencia **no incluye** la de entrada del micrófono real (30–80 ms en Windows, más con Bluetooth): el tiempo de
reacción por micrófono es aproximado.

## Lo que se encontró y corrigió gracias a esta prueba y a los expertos

- Un fallo real de **UX**: al primer toque el aviso de sonido encogía y el botón «Empezar» se movía (Fase 0).
- Un fallo real del **seguimiento**: un hueco corto de audio (carga de CPU durante la grabación del video) producía un segundo ataque de la misma nota 200 ms después y contaba como error. Se corrigió y se cubrió con pruebas de estrés.
- Un **cuelgue** con muestras NaN en la búsqueda de picos.
- La otra octava y el eco se marcaban «Incorrecto»: ahora son «No te oí bien» (no cuenta como error).
- Detalle completo en `docs/fases/fase-1.md`.

## Límites de esta evidencia (honestos)

- **No hay piano real ni micrófono real.** Nada de lo anterior demuestra que el E263 se oiga bien: falta `docs/validacion-microfono.md`.
- El audio simulado es limpio comparado con un altavoz pequeño; los umbrales se afinaron con él y podrían necesitar ajuste.
- La pestaña oculta se simula con `document.hidden`; no hay throttling real del navegador.
- En móvil de 375 px el teclado queda parcialmente bajo el pliegue (Fase 2).
