# Fase 2 — Ajustes, terceras y acordes, manos y notas que caen

Estado: **completada y verificada (falta validarla con el piano real)**. Resultados, límites y lo aplazado, al final de este documento.

## Qué pidió Kevin

1. Empezar ya con **terceras** y **acordes**.
2. Ver las **manos** (qué dedo toca qué tecla).
3. Ver las **notas cayendo** hacia el teclado.
4. **Personalizar** fácilmente desde un panel que se esconde (engranaje): elegir si se toca con el
   **teclado del computador**, con un **teclado MIDI** o con el **micrófono** (escucha activa), y otras preferencias.
5. Tener presente que la nota **Mi** tarda en reconocerse con su Yamaha (probable confusión de octava).

**Archivado para más adelante** (a petición de Kevin): teclado completo en pantalla de teléfono y selector
de dispositivo de micrófono. Ver `docs/archivado.md`.

## Objetivo

Que Kevin practique **terceras y acordes** viendo **qué dedos usar** y **cómo caen las notas** hacia su
tecla, elija en un **panel de ajustes** cómo quiere tocar (micrófono, MIDI o teclado del PC), y que la app
siga corrigiendo al instante.

## Alcance

- **A. Octava (el «Mi»):** si hay energía fuerte una octava por debajo de la altura detectada, se
  corrige hacia la octava inferior (hoy, un 2.º armónico fuerte hace oír «Mi5» en lugar de «Mi4»).
- **B. Panel de ajustes (engranaje):** panel lateral que se esconde. Entrada (micrófono / piano MIDI /
  teclado del PC), modo (notas / terceras / acordes), nivel, mano, notación, ayuda, dedos, notas que
  caen, tema. Se recuerdan en el navegador. Cambiar de entrada enciende una y apaga las otras.
- **C. Objetivos con varias notas:** el objetivo pasa a ser un conjunto de notas. Agregador de pulsaciones
  simultáneas (tolerancia para acordes «rodados»). Una nota de más es un error; las notas correctas que
  faltan no lo son.
- **D. Terceras y acordes (Do mayor):** terceras armónicas (7 intervalos) y acordes básicos
  (Do, Fa, Sol mayores; Re, Mi, La menores). Niveles progresivos.
- **E. Varias notas por micrófono:** verificación **dirigida**: la sesión le dice al micrófono qué notas
  espera y este comprueba, con análisis espectral, cuáles suenan (y si suena alguna de más).
- **F. Manos y dedos:** numeración 1–5 por mano y colores por mano; una mano fantasma sobre el teclado.
- **G. Notas que caen:** bloques que caen hacia su tecla; el objetivo actual espera en la línea del teclado
  hasta acertarse; se ven los siguientes.
- **H. Pruebas:** unitarias, integración, e2e con teclado del PC y micrófono simulado, video y capturas.

## Fuera de alcance

Teclado completo en móvil, selector de dispositivo de micrófono, modos espera/estricto como ajuste
(la cascada espera siempre), guardar progreso y estadísticas (solo se guardan preferencias), niveles
con negras, ritmo, canciones, motor adaptativo.

## Preguntas para los expertos

1. ¿Es viable **verificar** 2–3 notas simultáneas por micrófono de un teclado portátil con altavoz pequeño?
   ¿Con qué algoritmo y umbrales? ¿Cuánto esperar tras el ataque? ¿Qué cuenta como «nota de más»?
2. ¿Cómo dar **dedos** correctos en terceras y acordes, mano derecha e izquierda, y cómo dibujar las
   **manos** de forma clara sin saturar la pantalla?
3. ¿Cómo integrar la **cascada** con el espacio disponible (portátil de 650 px de alto) y el objetivo grande?
4. ¿Cómo diseñar el **panel de ajustes** (accesibilidad, foco, no tapar el teclado, persistencia) y la
   arquitectura de **entradas intercambiables** sin romper las capas?
5. ¿Cómo generalizar `evaluate`/`PracticeSession` a objetivos de varias notas sin romper lo existente?

## Decisiones tras la revisión de expertos

Se divide en **2a** (entradas exactas: teclado del PC y MIDI, micrófono de una nota, octava, ajustes,
modos, dedos, cascada y manos) y **2b** (varias notas por micrófono, como **BETA**).

| # | Decisión | Origen |
|---|---|---|
| 1 | Corrección de octava en el seguimiento: por fotograma, si hay energía en f/2 (≥ 0,05 de la de f) **y** en 3f/2 (≥ 0,02; tercer parcial de la nota inferior) y ambas sobresalen ≥ 4× del ruido de alrededor, la altura es f/2; con histéresis (se mantiene mientras ≥ 0,03 y ≥ 0,012) y sin subir nunca de octava; no corrige si la nota f/2 sonaba hace < 700 ms (Mi4→Mi5 real). **Umbrales medidos en E0** (los 0,08 del borrador no corregían); validado de Si3 en adelante | Música |
| 2 | El objetivo pasa a ser un **conjunto de notas** (`Target`) con sus dedos y una etiqueta; un objetivo de 1 nota es el caso particular. `evaluate` conserva su firma | Backend/Música |
| 3 | Sin espera: cada pulsación se evalúa al instante; cada nota del conjunto es un avance («parcial») y se acierta cuando **todas están pulsadas a la vez** (soltar quita la nota). Las notas equivocadas que llegan ≤ 120 ms tras la anterior (máx. 300 ms desde la primera) cuentan **un solo error** | Música |
| 4 | **Error** = nota de más, **al instante** (corrección inmediata, igual que en el modo notas). *Ajuste en E1:* el borrador pedía que la nota sobrara ≥ 150 ms; eso exige un temporizador y retrasa el aviso, así que se descarta para entradas exactas (teclado del PC y MIDI) y la tolerancia al roce queda para el micrófono (nota ajena = «dudoso», nunca error). **Faltan notas NO es error**: mensaje neutro «Casi · Falta Sol» | Música/UI |
| 5 | Contenido: Terceras N1 (Do–Mi, Re–Fa, Mi–Sol), N2 (las 7), N3 mano izquierda; Acordes A1 Do y Sol, A2 +Fa, A3 +La m, A4 +Re m y Mi m, A5 mano izquierda | Música |
| 6 | Dedos (grave → agudo): terceras MD 1-3, 2-4, 3-5, 1-3, 2-4, 3-5, 1-3; MI espejo (5-3, 4-2, 3-1…); acordes MD 1-3-5, MI 5-3-1. Tablas estáticas validadas por prueba | Música |
| 7 | `ExerciseMode` con modos notas / terceras / acordes, niveles y mano; la UI no calcula teoría (recibe `hand`, `fingers`, `label`) | Backend/UI |
| 8 | Preferencias: dominio puro `Preferences` + `parsePreferences` (validación, versión), puerto `PreferencesStore`, adaptador `localStorage`, servicio con `useSyncExternalStore` | Backend |
| 9 | `InputManager` en `core/application`: entrada **exclusiva** (se apaga una antes de encender otra); el micrófono nunca arranca solo; `?pc`, `?midi`, `?mic=off` quedan como modo de desarrollo | Backend |
| 10 | Panel ⚙: `aside` de 320 px a la derecha, **encima** del tablero (no lo empuja), sin atajo de letra (Ctrl+,); abrirlo pausa la ronda; en < 900 px es modal. Sustituye a `SettingsBar`. *Ajuste en E6:* los chips de estado (que ya solo muestran la entrada elegida) **suben a la cabecera, junto al engranaje**, en lugar de la pastilla nueva: gana la misma altura y conserva los avisos y los `data-testid` que ya estaban probados | UI |
| 11 | Cascada = **cola** (el objetivo espera sobre la línea del teclado), no línea de tiempo: se mueve por pasos con transiciones CSS (320 ms), sin `requestAnimationFrame` ni re-render por fotograma. El estado lleva `upcoming` (los 2 siguientes, elegidos de antemano: la sucesión por semilla no cambia) | Backend/UI |
| 12 | Cascada, teclado y mano comparten **una sola escala**: se dibujan **dentro del mismo SVG** del teclado (`viewBoxOf()` reserva filas arriba y abajo), así la alineación es exacta a cualquier tamaño (medida ≤ 0,5 px). El objetivo actual sólido y los 2 siguientes punteados; los grupos se unen con una barra («peine») | UI |
| 13 | Manos: dígito en el bloque y mano fantasma **debajo** del teclado (5 cápsulas, solo las usadas rellenas); colores por mano seguros para daltonismo más forma (círculo / cuadrado redondeado) | UI |
| 14 | Mensajes: «Casi: falta Sol» (neutro); «Sobró Re4. Do mayor es Do · Mi · Sol» (error); micrófono dudoso: «No oí bien las 3 notas. No cuenta como error» | UI |
| 15 | Varias notas por micrófono (**BETA**, apagado por defecto): verificación dirigida con Goertzel por semitono, aumento de energía sobre el instante previo al ataque, cancelación de armónicos de las notas esperadas; extras = «dudoso» (no error) hasta validar con el Yamaha; mano izquierda por micrófono = solo presencia | Música/Backend |
| 16 | Puerto `ExpectationSink`: la sesión le dice al micrófono qué notas se esperan; el verificador es puro (`chord-verifier.ts`) | Backend |
| 17 | Alturas: sin fila de chips aparte (suben a la cabecera); el teclado no se mueve (≤ 1 px) entre estados, con y sin cascada, a 1280×800 y 1366×650. La tira «Oigo» del micrófono se mantiene (la usa la Fase 1) | UI |

## Etapas (cada una cierra con `npm run check`; commits pequeños)

E0 octava «Mi» ✅ · E1 dominio multi-nota ✅ · E2 modos, dedos, terceras y acordes ✅ · E3 preferencias ✅ · E4 `InputManager` ✅ ·
E5 panel de ajustes ✅ · E6 cascada y manos ✅ · E7 verificador por micrófono (beta) ✅ · E8 evidencias, expertos y cierre ✅.

Plan B de E7 si no alcanza los umbrales: arpegio (notas una tras otra) con el seguimiento monofónico.

## Verificación

| Qué | Criterio |
|---|---|
| Octava | Matriz Mi4 con fundamental débil, filtros y resonancia: Mi4 confirmado ≥ 95 %; Mi5 real: **0 conversiones falsas** |
| Dominio multi-nota | El modo notas da exactamente los mismos resultados que antes (371 pruebas verdes tras un renombre mecánico) |
| Terceras y acordes | Jugables con teclado del PC y MIDI: éxito, nota de más, faltan notas, rodado, notas sostenidas |
| Ajustes | Se guardan y se validan; entrada exclusiva; foco, Esc, Ctrl+, y accesibilidad |
| Cascada y manos | Alineación bloque–tecla ≤ 0,5 px; el objetivo espera; teclado ≤ 1 px entre estados |
| Micrófono (beta) | Banco sintético: ≥ 95 % de acordes buenos, 0 falsos errores en las trampas; e2e con micrófono simulado |
| e2e + video | Edge real, 3 de 3 corridas |
| Real | Kevin con el Yamaha (octava del Mi, acordes beta) |

## Resultados

Evidencia completa y medidas en `evidencias/fase-2/informe.md`. En resumen: **37 de 37 pruebas e2e en Edge, 3 de 3 corridas**;
**645 pruebas unitarias y de integración**; `npm run check` pasa; el teclado no se mueve (**0,000 px** en 20 estados a 1280×800 y 1366×650);
bloques y dedos alineados con sus teclas a **≤ 0,5 px**.

| Etapa | Qué quedó | Pruebas clave |
|---|---|---|
| E0 | Corrección de octava del «Mi» con umbrales medidos (f/2 ≥ 0,05, 3f/2 ≥ 0,02, SNR local ≥ 4); validada de Si3 en adelante | `tests/core/octave.test.ts` (matriz) |
| E1 | `Target` (conjunto de notas con dedos, mano y nombre), avance «parcial», acierto con todas pulsadas, error al instante por nota de más (varias seguidas = 1) | `exercise.test.ts`, `exercise-groups.test.ts` |
| E2 | Contenido: terceras N1–N3, acordes A1–A5; `?modo=&nivel=`; fila `Z X C V B N M` para la mano izquierda | `curriculum.test.ts`, `practice-groups.test.tsx`, e2e |
| E3 | Preferencias validadas y persistentes (`passo.preferencias`), migración del tema antiguo, `localStorage` solo en `adapters/storage` (regla de ESLint) | `preferences.test.ts`, e2e |
| E4 | Entradas exclusivas (el micrófono nunca arranca solo), `stop()` deja las entradas «inactivo», la sesión vigila la entrada elegida | `input-manager.test.ts`, e2e |
| E5 | Panel ⚙ (a11y, `Ctrl+,`, `Esc`, modal en estrecho), pausa al abrirlo, volver al micrófono reinicia la bienvenida | `settings-panel.test.tsx`, e2e |
| E6 | Cola de los 2 siguientes (misma sucesión por semilla), cascada y mano dentro del SVG del teclado, página entera cabe a 1366×650 | `cascade-hand.test.tsx`, `upcoming.test.ts`, `hand-shape.test.ts`, e2e |
| E7 | Verificador de acordes por micrófono (BETA): Goertzel dirigido, oyente de ataques, puerto `ExpectationSink`, registro `__passoChords` | `chord-verifier.test.ts`, `chord-listener.test.ts`, `microphone-chords.test.ts`, e2e |

### Decisiones del plan que cambiaron al construir

- **#1 (umbrales de octava):** los del borrador (0,08) no corregían; se midieron (ver arriba).
- **#3 y #4 (error de acorde):** al instante, sin esperar 150 ms (evita un temporizador y respeta «corrección inmediata»); la tolerancia al roce queda para el micrófono (nota ajena = «dudoso»).
- **#10 (chips):** suben a la cabecera junto al engranaje (no hay pastilla nueva).
- **#12 (escala común):** cascada, teclado y mano van **dentro del mismo SVG** (`viewBoxOf()`).
- **#13 y #14:** las manos usan cápsulas (derecha) y cuadrados redondeados (izquierda), no círculos; los mensajes quedaron «Casi · Falta Mi4», «Sobró Fa4. Toca Sol · Si · Re» y «No te oí bien… no cuenta como error».
- **Nuevas reglas** que salieron de la revisión de expertos: con el micrófono el ejercicio es siempre el de notas salvo la beta; pasar al micrófono con una ronda empezada vuelve a la bienvenida; abrir los ajustes pausa y cerrarlos reanuda solo lo que pausó el panel.

## Límites conocidos

- **La beta de acordes por micrófono no está validada con el piano real.** Apagada por defecto; plan B: arpegio con el seguimiento de una voz.
- Graves (< 250 Hz, hasta Si3): los acordes por micrófono solo comprueban presencia (no distinguen octava ni vecinas); la corrección de octava no es fiable en Mi3/Sol3.
- Con el Mi4 aún sonando > 700 ms, un Mi5 real podría leerse como Mi4. Un acorde totalmente equivocado no da mensaje.
- Pantallas muy bajas (1024×600, zoom 125 %): la parte baja del teclado queda bajo el pliegue; propuesta: objetivo y mensaje en dos columnas.
- La cascada es una **cola** (no una línea de tiempo con ritmo): el ritmo llega en la Fase 5.

## Aplazado y deuda técnica

- Archivado a petición de Kevin: teclado completo en móvil y selector de dispositivo de micrófono (`docs/archivado.md`).
- Deuda: `PracticeSession` (≈ 360 líneas) mezcla ronda, vigilancia de entradas, política de sonido, estadísticas de escucha y expectativas: extraer `expectedNotes()`, las estadísticas y la política de sonido antes de añadir progreso y motor adaptativo (Fase 3 y 7). El verificador corre en el hilo principal (5–6 ms por ataque): llevarlo a un Worker si crece el rango. `rms()` del oyente copia con `slice` por bloque (se puede calcular sobre el anillo sin copiar).
- Siguiente (con autorización de Kevin): **Fase 3 — núcleo de aprendizaje** (modos espera/estricto, niveles con negras, progreso guardado).
