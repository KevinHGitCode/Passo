# Fase 1 — Escucha activa (micrófono)

Estado: **completada el 2026-10-13 · pendiente de validación con el Yamaha E263 real por Kevin** (`docs/validacion-microfono.md`).

## Por qué cambia la Fase 1

El Yamaha E263 de Kevin **no tiene USB-MIDI**. La app no puede recibir las teclas como mensajes: tiene que
**escuchar** el instrumento con el micrófono del computador y deducir qué nota suena. Esto pasa a ser la
entrada principal de Passo. El teclado del PC y el MIDI siguen existiendo, pero como entradas opcionales
(`?pc`, `?midi`) para desarrollo y para quien sí tenga MIDI.

Lo que estaba previsto para la Fase 1 (modos espera/estricto, niveles con negras, persistencia, dedos,
móvil) pasa a la **Fase 2**; el resto de fases se desplaza una posición.

## Objetivo

Que Kevin toque una tecla de su piano y Passo, **sin cables**, oiga la nota, la compare con la pedida y
corrija al instante, con la misma experiencia de la Fase 0. Una nota a la vez.

## Principio de diseño (de la revisión de expertos)

**Precisión antes que sensibilidad.** Marcar «Incorrecto» un acierto del alumno hace mucho más daño que no
oír una nota. Por eso:

1. Una nota **solo se abre con un ataque** (subida clara de energía). Un tono estable (voz, zumbido, música
   de fondo) no cuenta.
2. Lo **dudoso nunca es un error**: se muestra «No te oí bien, inténtalo otra vez» en un tono neutro, sin
   sumar errores ni ensuciar los datos de la Fase 6.
3. Dos teclas a la vez, o lecturas inestables, **no son un intento**.

## Alcance

- **DSP puro en `core/`** (sin APIs del navegador):
  - Conversión frecuencia ↔ MIDI ↔ cents (La4 = 440 Hz), RMS y energía por bloques de 128 muestras.
  - Detección de altura McLeod (NSDF) con **submuestreo** (≈ 5 M operaciones/s en total), refinamiento a
    tasa completa y comprobación de **presencia de la fundamental** (evita «Do3» fantasma ante dos teclas).
  - `NoteTracker` puro: calibración del ruido ambiente, detección de ataque, confirmación en varios
    fotogramas, `off` por energía, confianza `alta`/`media`, estimación de la afinación del teclado, avisos
    («saturado», «débil», «confuso», «ruidoso»).
- **Adaptador `MicrophoneInput`**: `getUserMedia` sin cancelación de eco, supresión de ruido ni ganancia
  automática; `AnalyserNode` con bucle de 10 ms que solo procesa cuando hay muestras nuevas; fases
  `apagado → calibrando → escuchando → suspendido`; libera pistas, contexto y temporizadores al detener.
- **Puertos:** fuente `microfono`, estado `inactivo`, `sin-dispositivo` con motivo `ocupado`, puerto
  `InputMonitor` (nivel, nota oída, avisos) y `confidence` opcional en `NoteEvent`.
- **Sesión:** pausa si se pierde la entrada principal aunque no se haya tocado aún; **sin sonido de la app
  mientras se escucha** (evita realimentación); `shownAt` con la hora de entrega (no la del ataque); resultado
  `dudoso`; aviso de **teclado transpuesto**.
- **Interfaz:** activar micrófono con explicación previa de privacidad, estados claros (ninguno mueve el
  teclado), tira «Oigo: Re4» con medidor de nivel, marca de «nota oída» en el teclado distinta de «pulsada»,
  prueba rápida «toca el Do central» al empezar.
- **Pruebas:** banco de señales sintéticas tipo piano (parciales inarmónicos, decaimiento, ruido, voz,
  reverberación), pruebas del adaptador con falsos y e2e en Edge con **micrófono simulado** (audio real por
  `getUserMedia`).

## Fuera de alcance

Acordes y varias notas a la vez, ritmo fino y duración de notas (el `off` por micrófono es poco fiable),
grabación de audio, persistencia, niveles nuevos, calibración manual de afinación, AudioWorklet (la captura
queda tras una interfaz para cambiarla después), selector de dispositivo de entrada (Fase 2).

## Decisiones tras la revisión de expertos

| # | Decisión | Origen |
|---|---|---|
| 1 | Algoritmo McLeod propio en `core/domain`, con submuestreo ×4 (48 kHz) y refinamiento ±2 lags a tasa completa | Backend |
| 2 | Ventana 2048, un fotograma cada 1024; energía por bloques de 128 (ataque con precisión de ~3 ms) | Backend/Música |
| 3 | Rango de búsqueda 60–1400 Hz; fiable C3–C6; bajo C3 «octava incierta» | Música |
| 4 | **Toda** nota se abre con un ataque: energía de un bloque de 256 muestras ≥ 1,41× la de los 16 ms anteriores y sobre el umbral; periodo refractario de 150 ms; la misma nota dentro de 300 ms no es un ataque nuevo; huecos de audio no cuentan como ataque | Música/Backend |
| 5 | Umbral = máx(0,003; 4 × ruido); ruido = percentil 20 de 1 s de calibración; `off` a 2,5 × ruido durante 2 fotogramas | Música/Backend |
| 6 | Confirmación: 3 fotogramas estables (dispersión < 20 cents), claridad ≥ 0,75 → confianza `media`; claridad media ≥ 0,90, dispersión < 10 cents y sin energía en el subarmónico → `alta` | Música |
| 7 | Una nota **errónea de confianza `media` es `dudoso`, no error**; un acierto cuenta con cualquier confianza | Música/UI |
| 8 | Se acepta cualquier desviación hasta ±50 cents y se estima la afinación del teclado (mediana de las últimas 5 notas) para recentrar; aviso si ≥ 20 cents | Música |
| 9 | Aviso de teclado transpuesto con ≥ 3 errores de la misma diferencia en semitonos entre los 6 últimos intentos y sobre ≥ 2 notas pedidas distintas | Música |
| 10 | `at` = inicio estimado del ataque (primer bloque sobre el umbral); sesgo documentado de 30–80 ms (latencia de entrada); `reactionMs` con micrófono es aproximado y no se compara con MIDI | Backend/Música |
| 11 | La app no sintetiza sonido si el micrófono está activo; `shownAt` usa la hora de entrega | Backend |
| 12 | El `off` no se usa para medir duración; solo cuentan los ataques | Música |
| 13 | El chip del micrófono nunca se expande; los avisos bloqueantes sustituyen a la bienvenida o usan la tarjeta de pausa | UI |
| 14 | Tira «Oigo: …» de altura fija sobre el teclado; el medidor usa el color de acento (no verde/rojo); muestra la nota solo cuando la confirma el tracker | UI |
| 15 | Los cents se ocultan salvo `?debug` o desviación ≥ 25 cents | UI/Música |
| 16 | Nota oída en el teclado: anillo y punto (`key--heard`), nunca «pulsada» | UI |
| 17 | MIDI y teclado del PC pasan a ser opcionales (`?midi`, `?pc`); no se pide permiso MIDI al cargar | UI |
| 18 | e2e: micrófono simulado con `MediaStreamAudioDestinationNode` por `addInitScript`; un solo smoke con WAV aparte si hace falta | Backend |
| 19 | `no-restricted-globals` en `core` (+ `AudioContext`, `setInterval`…) y en `adapters/ui` para red y grabación (`fetch`, `MediaRecorder`…) | Backend |
| 20 | Tiempos de reacción por micrófono se marcan `aproximado`; la Fase 6 no mezcla fuentes | Música |

## Entregables

1. `core`: `pitch.ts`, `frame-analysis.ts`, `note-tracker.ts` con banco de pruebas sintético.
2. `MicrophoneInput`, falsos de micrófono y pruebas del adaptador.
3. Interfaz de escucha y estados; micrófono integrado en la composición y en la sesión.
4. Prueba funcional e2e con micrófono simulado, video y medidas en `evidencias/fase-1/`.
5. `docs/validacion-microfono.md` para que Kevin pruebe con su Yamaha real.

## Plan de trabajo (un commit por paso)

1. Documentación: este plan, README con las fases renumeradas, convenciones del micrófono.
2. `tests/support/synth.ts` (señales sintéticas) y `core`: conversiones y análisis por bloques.
3. `core`: detección de altura McLeod + presencia de fundamental, con micro-benchmark.
4. `core`: `NoteTracker` con secuencias.
5. Puertos y sesión (`primarySource`, sin eco, `shownAt`, resultado `dudoso`, transposición).
6. `MicrophoneInput` con falsos.
7. Interfaz: estados, activación, tira «Oigo», teclado `key--heard`, onboarding.
8. Composición (`?midi`, `?pc`) y lint de privacidad.
9. e2e con micrófono simulado, video y medidas.
10. Revisión de expertos, correcciones, evidencias finales y cierre.

## Verificación

| Qué | Cómo | Criterio de éxito |
|---|---|---|
| Precisión de altura | Banco sintético (10–16 parciales, inarmonicidad, decaimiento, ataque con ruido de martillo) | ±5 cents con armónicos exactos; ±12 cents con inarmonicidad + sala + saturación; nota y octava correctas en C4–C6 |
| Falsos errores | Banco con ruido rosa/ventilador, voz, vocal sostenida, música de fondo, díadas | **0** errores definitivos; 10 min de ruido/voz/tarareo → 0 `on` |
| Omisiones | Notas con SNR ≥ 10 dB | ≤ 5 % |
| Repetición | Misma nota a 1000/500 ms | 2 ataques (el límite de 250 ms queda documentado) |
| Afinación | Desplazamientos 0, ±10, ±25, ±40, ±50 cents y transposición ±1/±12 | Nota correcta, estimación ±5 cents, aviso desde 20 cents |
| Adaptador | Fakes de `getUserMedia`, pista y analizador | Permiso denegado, sin micrófono, ocupado, desconexión, pestaña oculta y limpieza de recursos |
| Arquitectura | `lint:deps`, ESLint | `core` puro; sin red ni grabación en `adapters`/`ui` |
| CPU | Micro-benchmark | p95 < 2 ms por fotograma |
| Flujo completo | e2e en Edge con micrófono simulado | Nota correcta avanza; incorrecta se corrige; repetir la misma nota funciona; ruido no cuenta; permiso denegado y micrófono perdido se muestran sin mover el teclado |
| Latencia | e2e: inicio del tono → feedback visible | p50 ≤ 250 ms (techo laxo en e2e; la medición real la hace Kevin) |
| Estabilidad visual | e2e recorre todos los estados | El teclado queda en la misma posición (0 px) |
| Real | Kevin con el Yamaha E263 (`docs/validacion-microfono.md`) | ≥ 95 % de las notas del nivel 1 detectadas y 0 falsos errores |

## Riesgos

- Altavoces pequeños del E263: fundamental débil en graves → posible error de octava (mitigado por el rango
  C3–C6 y el aviso de octava incierta).
- Ruido de fondo, voz y música ambiente: mitigados por el ataque obligatorio, pero no eliminados.
- Pestaña oculta o tapada: el navegador frena los temporizadores; la escucha se suspende de forma visible.
- Efectos de audio del driver de Windows («Mejoras de audio») pueden comerse tonos sostenidos.
- Latencia de entrada del micrófono: tiempos de reacción aproximados.

## Añadidos tras la revisión del resultado (expertos)

| Hallazgo | Decisión |
|---|---|
| Otra octava oída con confianza alta se marcaba «Incorrecto» | Misma nota en otra octava, o más de una octava de distancia, es **dudosa** (no error); se explica. Además el subarmónico (f0/2, f0/3) baja la confianza a `media` |
| La repetición fantasma de un error entre 300 y 900 ms contaba como 2.º error | El eco se ignora también para la nota errónea anterior (misma nota, < 900 ms) |
| El aviso de transposición saltaba a quien insiste en la tecla vecina | Exige ≥ 2 notas pedidas distintas; con ±12 dice «una octava» |
| Huecos de audio por carga de CPU producían un 2.º ataque (falsos errores en el e2e con video) | Recuperación de huecos, línea base conocida, `dropoutGuard`, `afterGap`; **pruebas de estrés** con 4 semillas (≥ 95 %, 0 falsas) |
| Un hueco de muestras NaN colgaba la búsqueda de picos | Guarda de muestras no finitas, con prueba |
| El «hop» real no era 1024 (quedaban muestras sin bloque) | El adaptador consume bloques completos y arrastra el resto |
| Fugas al apagar durante el permiso y excepciones en el montaje | Se cierra el contexto pendiente; `begin()` suelta todo y queda «sin-soporte»; los oyentes rotos no detienen la escucha |
| Faltaba la regla de privacidad (decisión 19) | ESLint prohíbe red y grabación en `adapters`/`ui` y APIs del navegador, `Math.random` y `Date.now` en `core`; depcruise aísla los adaptadores entre sí |
| Micrófono silenciado indistinguible de «silencio» | Aviso «No llega sonido del micrófono» |
| «No te oí bien» desaparecía en 0,7 s | Dura 3 s; dice «no cuenta como error» |
| La marca de nota oída desaparecía en tema claro | Halo blanco bajo el anillo violeta, dibujado el último |
| Foco perdido en las transiciones del micrófono; la pausa no se anunciaba con su motivo | Foco al título del panel; la pausa se anuncia con motivo |
| Teclado movido en pantallas de 650 px de alto | Compactación adicional; estabilidad medida a 1280×800 y 1366×650 |
| No se medía el reparto alta/media | `?debug` muestra alta, media, dudosas y ecos por ronda |

## Resultado de la fase

- `npm run check` pasa (lint con reglas de privacidad, dependencias entre capas, formato y pruebas; ver el recuento en `evidencias/fase-1/informe.md`).
- `npm run e2e` pasa **3 de 3 veces seguidas** en Edge real con micrófono simulado, grabando video.
- Latencia del sonido a la pantalla con micrófono simulado: ver `evidencias/fase-1/latencia.json` (objetivo p50 ≤ 250 ms).
- El teclado no se mueve (≤ 1 px) entre los 8 estados, a 1280×800 y a 1366×650.

## Límites conocidos (registrados, no resueltos)

- **Acústica real sin validar**: la síntesis no reproduce el altavoz ni la sala del E263 (ver `docs/validacion-microfono.md`).
- Una voz que **empieza de golpe** (sílaba, aplauso tonal) puede tomarse por una nota: se pide silencio alrededor.
- Un re-ataque de la misma nota más suave que la cola de la anterior, o a menos de 300–500 ms, se pierde (aceptable hoy: ningún nivel repite la misma nota seguida; importará en la Fase 4, ritmo).
- Un teclado afinado a más de ±35 cents de 440 Hz puede leerse una nota desplazada hasta que se estime la afinación.
- El tiempo de reacción por micrófono es aproximado (latencia de entrada 30–80 ms).

## Aplazado a la Fase 2 (acordado con los expertos)

- Captura con `AudioWorklet` y marcas de tiempo reales (`getOutputTimestamp`), y mover la política de ventana, huecos y monitor a `core` tras un puerto `SampleSource`.
- Selector de dispositivo de entrada y `devicechange`; guía de permiso denegado también dentro de la tarjeta de pausa.
- Cabecera móvil de una fila (en 375 px el teclado queda parcialmente bajo el pliegue); escalón de altura ≤ 620 px.
- `forced-colors` y `prefers-contrast`; «portátil» → «dispositivo» en los textos.
- Volcar a JSON local las características por fotograma (nivel, altura, claridad; sin audio) para convertir las sesiones reales de Kevin en pruebas de regresión.
- Persistir la afinación estimada; recordar «ya hice la prueba del Do central»; CSP `connect-src` en producción.
- Lo que ya estaba previsto: modos espera/estricto, niveles con negras y mano izquierda, dedos 1–5, persistencia, teclado en pantalla jugable.
