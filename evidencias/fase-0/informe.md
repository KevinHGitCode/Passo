# Informe de la prueba funcional — Fase 0

- **Fecha:** 2026-10-13
- **Navegador:** Microsoft Edge (instalado en el equipo), sobre la versión compilada (`npm run build`).
- **Cómo repetirla:** `npm run e2e` (compila, levanta la app, ejecuta las 5 pruebas y regraba video y capturas).
- **Resultado:** 5 de 5 pruebas pasan. `npm run check` pasa (lint, dependencias entre capas, formato, 122 pruebas, build).

## Qué se probó

| Prueba | Qué comprueba | Evidencia |
|---|---|---|
| Ronda completa con el teclado del PC | Empezar, ver la nota con la tecla resaltada, un error (no avanza y muestra la corrección), un acierto, 20 notas con errores intercalados, resumen, otra ronda en notación americana y sin ayuda, tema claro, latencia | `video-funcional.webm`, capturas 01–09, `latencia.json` |
| Piano MIDI simulado (Yamaha PSR-E263) | Notas por MIDI con su tiempo, corrección de un error, **desconexión → ronda en pausa sin perder progreso → reconexión → continúa** | `video-midi-simulado.webm`, capturas 10–11 |
| Permiso MIDI denegado | Aviso claro con botón «Reintentar»; el teclado del PC sigue funcionando | captura 12 |
| Navegador sin Web MIDI | Mensaje «Usa Chrome o Edge» | captura 13 |
| Accesibilidad visual | Móvil 375 px; daltonismo (deuteranopía, protanopía, acromatopsia) en error y acierto | capturas 14–16 |

## Medidas

| Medida | Resultado | Criterio |
|---|---|---|
| Latencia pulsación → pantalla (28 muestras, ver `latencia.json`) | p50 6,8 ms · p95 16,8 ms · máx 22 ms | p95 < 50 ms ✅ |
| Latencia de salida de audio (estimada por el navegador) | ~50 ms | Solo informativa en esta fase |

La latencia de pantalla se mide desde el `timeStamp` del evento de teclado hasta el siguiente fotograma. No incluye el retardo del monitor.

## Límites de esta evidencia (honestos)

- **No hay piano real.** El MIDI se probó con un piano simulado que imita la API del navegador. La validación con el Yamaha E263 la hace Kevin: ver `docs/validacion-piano.md`.
- El audio de la app es una voz sencilla de osciladores (se reconoce la altura, no suena a piano). Con un piano MIDI la app **no** sintetiza sonido para no hacer eco con el del instrumento.
- La latencia del audio es una estimación del navegador, no una medición real con micrófono.
- En móvil (375 px) el teclado queda parcialmente bajo el pliegue: la cabecera compacta es trabajo de la Fase 1.

## Revisión por expertos

Música/pedagogía, interfaz/UX y backend/infraestructura revisaron el plan, el código y las capturas, y después verificaron las correcciones. Detalle en `docs/fases/fase-0.md`.
