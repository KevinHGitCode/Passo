# Fase 3 — Passo como juego (camino por niveles, estrellas y progreso)

Estado: **completada y verificada (falta validarla con el piano real)**. Kevin autorizó empezar («comienza con su implementación»). Resultados, límites y lo aplazado, al final de este documento.

## Qué pidió Kevin

1. Que Passo se pueda **publicar**: una experiencia de juego **por niveles**, como Duolingo, y con las marcas de
   **typing.com** (precisión, velocidad, estrellas).
2. Eligió la **versión A** del mockup (la «juguetona»). La **versión B** (sobria, oscura) queda como **tema
   intercambiable** para más adelante: por eso la capa visual usa **tokens por rol**, no colores sueltos.
3. «Comienza con su implementación» (autorización de esta fase).

Mockup de referencia (privado): `https://claude.ai/artifact/1q8F1gEqaBSpYoit2tPmvA`, tableros A1–A7
(camino, lección, resultado, progreso, sistema visual, móvil camino y móvil lección).

## Objetivo

Que quien abra Passo vea un **camino de unidades y lecciones cortas** (2–4 min), toque, reciba **estrellas, XP y racha**,
vea **dónde falla** (mapa del teclado, «lo que más costó») y **sus datos se guarden** en el navegador.
Todo lo de la Fase 2 (entradas, manos, cascada, corrección inmediata) sigue funcionando dentro de cada lección.

## Alcance

- **A. Contenido en lecciones:** seis unidades (tabla de abajo) con lecciones nueva / repaso / prueba. Una lección es un
  `RoundConfig` con su propio conjunto de objetivos. La mayoría es de **notas sueltas** (lo que el micrófono del Yamaha puede juzgar).
- **B. Puntuación (estilo typing.com):** precisión (a la primera), **ritmo en notas/min** (tiempo activo, sin pausas),
  tiempo, **estrellas**, **XP**, nivel de pianista.
- **C. Progreso guardado:** por lección (mejores estrellas, precisión y ritmo), por tecla (últimos 10 intentos a la primera),
  racha de días, minutos de hoy e historial reciente. Versionado y validado como las preferencias.
- **D. Flujo de pantallas:** **Camino** (A1) → **Lección** (A2) → **Resultado** (A3), más **Progreso** (A4, reducido) y la
  **práctica libre** actual. Rutas por hash: `#/` (camino), `#/leccion/<id>` (incluye el resultado), `#/progreso`, `#/practica`.
- **E. Diseño A:** tokens por rol y componentes (botones 3D, nodos, barra de respuesta, estrellas, anillo), Nunito **autoalojada**,
  barra lateral (≥ 900 px) y barra inferior (móvil), claro y oscuro, escenario de tocar siempre oscuro.
- **F. Móvil:** camino y lección en 390 px (la ventana de 9 teclas ya existe).
- **G. Pruebas:** unitarias del dominio y la aplicación, de interfaz, e2e en Edge con video y capturas.

## Fuera de alcance

Cuentas y nube (todo es local), ligas o ranking, vidas o castigos, monetización, **tema B** (solo se deja preparado), negras y
modos espera/estricto como ajuste, oído, ritmo con metrónomo, canciones, motor adaptativo. **Recortado del mockup** (revisión
de interfaz): Perfil, Logros y «Puntos débiles» como pantallas; tarjeta Precisión/Velocidad del Camino; botón «Guía»;
pestañas de periodo, curva de ritmo y calendario del Progreso; tipos Oído y Ritmo (aún no existen); Progreso móvil (el mockup no lo trae).
Los logros y el calendario quedan para el pulido.

## Currículo (revisión de música)

Rondas: **nueva 10 · repaso 14 · prueba 20** objetivos en notas sueltas; conjuntos de **≥ 3 notas** (con 2 solo alternan, porque
nunca se repite la misma nota seguida y el micrófono no distingue el ataque). Máximo 2 notas nuevas por lección.

| Unidad | Contenido (dedos 1–5) | Lecciones |
|---|---|---|
| U1 Mano derecha, posición de Do | Do4–Sol4 | Do·Re·Mi → Mi·Fa·Sol → repaso → prueba |
| U2 Mano izquierda, «Do central» | Do4 Si3 La3 Sol3 Fa3 (175–262 Hz) | Do·Si·La → La·Sol·Fa → repaso → prueba |
| U3 Mover la mano (solo blancas) | posiciones Sol (Sol4–Re5), Re (Re4–La4), La (La4–Mi5), Mi (Mi4–Si4) | una nueva por posición → repaso → prueba Do4–Re5 |
| U4 Notas de acorde (sueltas, 1-3-5) | Do·Mi·Sol, Sol·Si·Re, Fa·La·Do, La·Do·Mi | cuatro nuevas → repaso → prueba |
| U5 Dos manos alternando | Fa3–Sol4 (9 notas) | 2 nuevas → repaso → prueba final de notas (20) |
| U6 Terceras y acordes | terceras N1–N3, acordes A1–A5 | **opcional con micrófono**; con MIDI/PC o la beta |

La posición de Fa no entra (pide Si♭). La izquierda empieza en Do4–Fa3, no en Do3–Sol3 (roza los 130 Hz y el altavoz casi no da graves);
las notas por debajo de Si3 por micrófono **no están validadas** con el piano real (límite de la Fase 2): si fallan, U2 pasa a MIDI/PC.

## Puntuación (revisión de música)

| Qué | Regla |
|---|---|
| 1 estrella | Completar con ≥ 70 % a la primera. Si no llega: «Repite» y no desbloquea |
| 2 estrellas | ≥ 80 % en lecciones **nueva**; ≥ 90 % en repaso y prueba |
| 3 estrellas | ≥ 95 % y ritmo objetivo (en **U1 el ritmo no se exige**). En **pruebas**, con la ayuda apagada |
| Ritmo (notas/min, MIDI/PC) | U1–U2: 12 / 15 / 18 (nueva / repaso / prueba) · U3–U5: 14 / 18 / 22 · terceras 16 · acordes 18 |
| Ritmo con micrófono | meta × 0,9; × 0,75 con la beta de varias notas. **No cuenta la primera nota** de la ronda |
| XP | por objetivo a la primera 10, a la segunda 5; bonus por estrella nueva; al repetir la lección **100 % → 50 % → 25 %** |
| Racha | día local con ≥ 1 lección completada; **1 día de descanso gratis por semana**; meta diaria **5 min** (5 / 10 / 15) |
| Tecla débil | ≥ 5 intentos y (a la primera < 80 % **o** tiempo mediano > 1,5 × tu mediana); ventana de los últimos 10, decaimiento 0,85 |
| Repaso de fallos | pool = las 3–4 más débiles × 3 + sus vecinas; < 2 débiles → «las más lentas»; ninguna → «Nada débil» |
| Desbloqueo | lineal por lección (≥ 1 ★); **«Saltar con prueba»**: ≥ 2 ★ en la prueba de la unidad abre la siguiente |

«Dudoso» (micrófono) no cuenta como fallo, así que la precisión sale algo inflada: con ≥ 3 dudosos seguidos se avisa (octava o altavoz).
El micrófono no verifica los **dedos**: se dice en pantalla.

## Arquitectura (revisión de backend)

| Capa | Módulos |
|---|---|
| `core/domain` | `lessons.ts` (`lessonConfig`, `isPlayable(lesson, fuentes, beta)`), `scoring.ts` (`scoreRound`), `progress.ts` (`parseProgress`, `applyResult`, `streakAt`). Desbloqueos y nivel se **derivan**, no se guardan |
| `core/ports` | `ProgressStore {load(): unknown; save(state): void}` · `Calendar {today(): string}` (día local `AAAA-MM-DD`; `Clock` es monotónico) |
| `core/application` | `ProgressService(store, calendar)` → `getSnapshot(): {state, saved}`, `subscribe`, `record(result)` · `LessonFlow({session, progress, sources})` → snapshot `{status: 'libre' / 'lista' / 'en-curso' / 'resultado', lessonId, outcome}`, `prepare(id)`, `begin()`, `leave()`, `isActive()` |
| `PracticeSession` | gana `subscribeRounds(listener)` (un solo punto: `ronda-completa`, una vez por construcción) y `startRound(config)` (configura y arranca en un solo cambio) |
| `adapters` | `storage/local-storage-progress-store.ts` · `calendar/local-calendar.ts` |
| `ui` | `router/` (`parseRoute`, `hrefOf`, `useRoute()` sobre `hashchange`), `Shell` que envuelve a `App` (que **no cambia de props**) |

- **`passo.progreso` v1:** `{version, xp, streak, lessons{id:{stars, acc‰, npm×10, plays, day}}, keys, daily, history, achievements}`, enteros, < 15 KB;
  se poda al guardar (`keys` del catálogo, `daily` ≤ 90 días, `history` ≤ 50). `parseProgress` campo a campo (clamp, `isFinite`, día válido,
  ids desconocidos fuera). Versión menor: migración pura; **mayor: solo lectura**; JSON roto: copia en `passo.progreso.corrupto`; `saved: false` si falla la cuota.
- **Fechas:** `daysBetween` con `Date.UTC` (inmune al cambio de horario); cuenta el día de **finalización**; `streakAt` se calcula al mostrar, sin escribir al abrir.
- **Una sola vez:** `record` relee el almacén y hace un solo `save`; recargar no repite (la ronda no se persiste); `prepare`/`leave` idempotentes (StrictMode); nunca `begin()` desde un efecto.
- **Lección ↔ preferencias:** `bindSessionToPreferences(…, {exercise, override?: {isActive, subscribe}})`: con la lección activa no toca el ejercicio, y compara con
  **lo último que aplicó el binder** (no con modo y nivel de la sesión, porque una lección es un subconjunto del mismo modo y nivel). El panel ⚙ oculta modo y nivel durante la lección.
  Micrófono sin beta en lección de terceras/acordes → `leave()` sin guardar. Disponibilidad con las **fuentes efectivas** (con `?pc&mic=off`, `prefs.input` sigue siendo micrófono).
- **Rutas:** la ruta es una **vista**, no la dueña del estado; no hay `#/resultado`: el resultado es `status: 'resultado'` dentro de `#/leccion/<id>`, y sin preparar muestra «lista» con un botón (gesto para micrófono y audio).
  Al salir de práctica o lección: `session.reset()` / `flow.leave()` (las entradas siguen vivas). La pantalla actual pasa a `#/practica`; las e2e de las fases 0–2 añaden ese sufijo (cambio mecánico).
- **Rendimiento:** el tablero solo se suscribe a la sesión; progreso, flujo y ruta son stores aparte con selectores primitivos; Camino y Progreso se desmontan durante la lección; `save` solo al final.

## Interfaz (revisión de interfaz)

- La lección **abre en la fase `inactiva`** actual (panel del micrófono o «Empezar»): no arranca sola. MIDI desconectado: «Conecta tu piano» + «Abrir ajustes».
  Entrada perdida a media lección: la pausa actual (tiempo y ritmo congelados). Cambiar de entrada **reinicia** la lección. Salir (X) sin aciertos sale directo; con progreso, diálogo
  «Seguir» / «Salir sin guardar» con la ronda en pausa.
- **Primera visita:** «Empieza aquí» sobre el nodo 1, racha «Empieza hoy», cifras «—», sin tarjeta de débiles. Sin `localStorage`: aviso «Aquí no se guarda».
- **Escenario siempre oscuro** (ámbito `.stage` con los tokens oscuros ya validados, también en la práctica libre). Tokens por rol en ambos temas (`--btn-depth`, `--star`, `--star-off`, `--streak`, `--xp`, `--font-display`, `--radius-card`).
- **Altura a 1366×650:** una sola cabecera (X, segmentos, chip de entrada, racha, engranaje y las marcas como texto, sin tarjetas); la barra de respuesta ocupa el hueco `.stage` actual con los mismos `data-testid`. El chip de entrada se agrega a la barra.
- **Marcas en vivo:** precisión desde el 4.º objetivo y ritmo desde la 3.ª nota; la 3.ª estrella es una **meta fija**, no estrellas vivas.
- **Camino:** scroll interno en `<main>`; columna derecha solo ≥ 1180 px; zigzag por índice. Bloqueo por avance ≠ bloqueo por entrada (icono y texto distintos: «Necesita piano MIDI o teclado del PC»); son `button aria-disabled` que explican y abren Ajustes.
- **Accesibilidad:** estrella vacía con contorno discontinuo ≥ 3:1 y «2/3» en texto; mapa de calor sobre `PianoKeyboard` (campo `heat`) con % en la tecla, rayado bajo 70 % y lista equivalente; sin confeti; contadores en JS consultan `matchMedia`;
  sin `aria-live` en la barra de respuesta ni en el tiempo; XP y racha se anuncian una vez en el `h1` del resultado; foco al `h1` y `document.title` por ruta (al volver, foco en el nodo de origen); botones móviles de 44 px.
- **Tipografía:** Nunito **autoalojada** (`@fontsource-variable/nunito`, la única dependencia nueva), no desde Google Fonts (hay micrófono y privacidad).
- **Móvil:** el Camino móvil lleva el engranaje en la cabecera; sin Perfil, Logros ni Débiles en la barra inferior (Aprender, Progreso, Práctica libre).

## Etapas (cada una cierra con `npm run check`; commits pequeños)

| Etapa | Qué | Verificación |
|---|---|---|
| G1 | Lecciones y unidades (`lessons.ts`) + `scoring.ts` | Cada lección resuelve su conjunto (≥ 3 notas, sin vacíos); estrellas, ritmo y XP en los bordes |
| G2 | `progress.ts` + `ProgressService` + puertos + adaptadores | Validación y versión, rachas (cambio de día y de horario, descanso), tecla débil, poda, `saved` |
| G3 | `PracticeSession.subscribeRounds/startRound` + `LessonFlow` + `override` del binder | Integración con entradas falsas; guardar una sola vez; salir sin guardar |
| G4 | Modelo del tablero extraído de `PracticeScreen` (sin cambios visibles) | Las 645 pruebas siguen verdes |
| G5 | Tokens por rol, Nunito y componentes base (botones, nodos, estrellas, barra de respuesta, anillo) | Pruebas de interfaz; contraste AA medido |
| G6 | `Shell`, rutas por hash, barra lateral / inferior, práctica libre en `#/practica` (+ sufijo en las e2e) | Las 37 e2e verdes |
| G7 | **Camino** (A1) con datos reales y primera visita | Prueba de interfaz + captura |
| G8 | **Lección** (A2): cabecera única, marcas, mensaje abajo, bloqueos, confirmar salida | e2e de una lección completa con el teclado del PC |
| G9 | **Resultado** (A3): estrellas, métricas, «lo que más costó», acciones | e2e: repetir, repasar, continuar |
| G10 | **Progreso** (A4 reducido): cifras, mapa del teclado, curva de precisión, lo débil | Con datos sembrados |
| G11 | Móvil (A6–A7) y revisión de 1366×650 | e2e móvil + capturas |
| G12 | e2e de la fase (camino → lección → resultado → recargar → progreso), video, capturas, expertos, docs, cierre | 3 de 3 corridas |

## Verificación

| Qué | Criterio |
|---|---|
| Dominio | Todas las lecciones resuelven su conjunto; estrellas, ritmo y XP exactos en los bordes; racha correcta al cruzar medianoche y el cambio de horario |
| Datos | Lo corrupto o de otra versión **nunca lanza**; sin `localStorage` la app sigue (solo esta visita); versión mayor solo lectura |
| Lección | Las pausas no cuentan en el ritmo; salir a media lección no guarda nada ni resta racha; completarla guarda una sola vez (también con recargas y StrictMode) |
| Compatibilidad | Las 645 pruebas y las 37 e2e de antes siguen verdes (con el sufijo `#/practica`) |
| Interfaz | Contraste AA; foco visible; teclado completo; página sin desplazar a 1366×650; móvil 390 px |
| e2e + video | Edge real, 3 de 3 corridas |
| Real | Kevin con el Yamaha (sigue pendiente la validación de la Fase 2) |

## Riesgos

- **Contenido por micrófono:** sin la beta solo hay notas sueltas; por eso U1–U5 son de notas. Las notas bajo Si3 (U2) no están validadas.
- **Ritmo con micrófono:** la latencia de detección falsea la velocidad; se relaja la meta y no se cuenta la primera nota.
- **Alcance:** el mockup es grande; el recorte de arriba ya está aplicado. Orden de corte si falta tiempo: G10 se reduce a las cifras y el mapa.
- **Regresión:** tocar `PracticeScreen` puede romper la Fase 2 → G4 primero, sin cambios visibles, y `App` conserva sus props.

## Decisiones fuera del plan (a Kevin, con valor por defecto)

Sin cuentas ni nube, sin vidas, sin monetización, meta diaria de 5 min, un día de descanso por semana. Se cambian cuando él lo pida.

## Decisiones tras la revisión final de los expertos

Con la fase construida, los tres expertos la revisaron y salió lo siguiente (todo lo de abajo se aplicó; lo demás está en «Aplazado»):

| # | Cambio respecto al plan | Origen |
|---|---|---|
| 1 | **Desbloqueo en paralelo:** cada unidad declara de cuáles depende (`requires`). La 3 solo pide la 1; la 4, la 3; la 5, la 2 y la 4. Así lo que el micrófono no oye bien en la unidad 2 (Fa3, Sol3) no frena el camino | Música |
| 2 | **3.ª estrella con un fallo por ronda:** nueva 90 % · repaso 92 % · prueba 95 % (con 10 o 14 objetivos un 95 % exigía no fallar nunca). La «meta general» de la gráfica sigue en 95 % | Música |
| 3 | **Cobertura de notas:** en las lecciones sale una «bolsa» barajada (todas las notas antes de repetir), así una ronda de 10 no se deja notas sin tocar y se llega antes a las 5 muestras por tecla. El repaso armado al momento no la usa (repite a propósito) | Música |
| 4 | Una ronda sin llegar al 70 % **no cuenta como jugada** (ni como lección del día): ya no baja al 50 % la experiencia de la primera vez que apruebas | Música/Backend |
| 5 | **Tope de 10 s por objetivo** en el ritmo, el tiempo del día y la lentitud por tecla; la ronda se **pausa al ocultar la página** | Backend |
| 6 | Repaso de puntos débiles: lentitud con **margen absoluto** (+600 ms sobre la mediana: la latencia del micrófono no marca teclas), «las más lentas» con ≥ 5 muestras y la oferta de repasar solo con teclas **débiles**; el mapa y «débil» comparten el 80 % | Música |
| 7 | Posiciones de la unidad 3 en orden Re, Mi, Sol, La (1, 1, 2 y 1 notas nuevas) y prueba a 20 notas/min | Música |
| 8 | **«Saltar con prueba»:** las lecciones de una unidad saltada ya no son «la siguiente» (`currentLesson` recibe las estrellas) | Música |
| 9 | **El micrófono se apaga** al salir de la lección o de la práctica libre (la luz del equipo no debe quedar encendida); la lección pide un gesto para volver a activarlo | Backend |
| 10 | **Datos:** una versión mayor escrita después de cargar no se pisa; lo que no se reconoce (JSON válido de otra forma) se conserva aparte; «Borrar mi progreso» quita también esa copia; una sonda (`canSave`) avisa desde la primera visita de que no se puede guardar; un fallo al anotar no deja la lección «en curso» | Backend |
| 11 | Camino: se abre **centrado en tu lección**, dice con qué se toca (con «Cambiar»), la explicación de un bloqueo se ve y caduca al cambiar de entrada, cada pantalla empieza arriba y hay «Saltar al contenido» | Interfaz |
| 12 | Lección: «Para pasar: 70 %», aviso de notas graves por micrófono y de apagar la ayuda en las pruebas, cabecera móvil en dos filas, diálogo de salida con fondo inerte y foco que vuelve a la X; resultado sin pasar con «Repetir» como acción principal, resumen como descripción del título (se lee una vez) y aviso si no se pudo guardar | Interfaz |
| 13 | Progreso: mapa del teclado con desplazamiento lateral en móvil y foco al título tras borrar | Interfaz |

## Resultados

Medidas en la última verificación: **`npm run check` pasa (1052 pruebas unitarias, de integración y de interfaz)** y **49 pruebas e2e en Edge** (las 37 de las fases 0 a 2, que siguen verdes con el sufijo `#/practica`, y 12 nuevas de la fase 3). Evidencias e informe en `evidencias/fase-3/`.

| Etapa | Qué quedó | Pruebas clave |
|---|---|---|
| G1 | 6 unidades y 32 lecciones (nueva / repaso / prueba), disponibilidad según la entrada, desbloqueo derivado de las estrellas; puntuación (precisión, ritmo en notas/min con tiempo activo, estrellas, XP, nivel) | `lessons.test.ts`, `scoring.test.ts`, `coverage.test.ts` |
| G2 | Progreso guardado: días y racha (descanso semanal), estadísticas por tecla, servicio, almacén `localStorage` con copia de lo dañado, calendario local | `progress.test.ts`, `streak.test.ts`, `key-stats.test.ts`, `progress-service*.test.ts` |
| G3 | `PracticeSession.subscribeRounds`, `LessonFlow` (guarda una sola vez, salir no guarda), `override` del enlace con las preferencias | `lesson-flow.test.ts`, `lesson-preferences.test.ts` |
| G4 | Modelo del tablero extraído de `PracticeScreen` (sin cambios visibles) | las 645 anteriores siguen verdes |
| G5 | Tokens por rol (claro y oscuro), Nunito autoalojada, componentes base (botón 3D, estrellas, anillo, nodo, barra de respuesta) | `game-components.test.tsx`, `tokens-contrast.test.ts` (AA) |
| G6 | `Shell`, rutas por hash, barra lateral / inferior, práctica libre en `#/practica` | `routes.test.ts`, `shell.test.tsx`, las 37 e2e |
| G7 | Camino con datos reales, repaso de puntos débiles armado al momento | `camino-screen.test.tsx`, `review.test.ts` |
| G8–G9 | Lección a pantalla completa y resultado (estrellas, anillo, ritmo, tiempo, XP, lo que más costó) | `lesson-screen.test.tsx`, e2e |
| G10 | Progreso: nivel, medias, mapa del teclado, curva de precisión, borrado con confirmación | `progress-screen.test.tsx`, e2e |
| G11 | Móvil (390 px) y 1366×650: la lección cabe sin desplazar en sus tres estados | e2e móvil y 1366×650 |
| G12 | e2e de la fase, revisión final de los expertos y cierre | `fase-3.spec.ts` |

### Decisiones del plan que cambiaron al construir

- **Unidades paralelas** (`requires`) en vez de una sola fila (#1 de arriba).
- **Rutas:** no hay `#/resultado`; el resultado es un estado de `#/leccion/<id>`. La lección no lleva barra de navegación (se sale con la X).
- **«Puntos débiles»:** no es una pantalla; es una tarjeta del Camino y del Progreso que lleva a una lección armada al momento (`#/leccion/repaso-debiles`, sin estrellas y con la mitad de experiencia).
- **Tema B:** solo queda preparado (tokens por rol; el escenario de tocar es siempre oscuro con cualquier tema).
- **Nunito** se instaló con `@fontsource-variable/nunito` (la única dependencia nueva) en vez de cargarla desde Google Fonts.

## Límites conocidos

- **Falta validar con el piano real** (`docs/validacion-microfono.md`, pasos 30–36): lecciones con el micrófono del Yamaha, las notas graves de la unidad 2 (Fa3–Si3) y si las metas de ritmo son razonables.
- Las lecciones duran **1–1,5 min**, no los 2–4 del plan; la meta diaria de 5 min equivale a 4–5 lecciones.
- El camino entero suma unos 3,6 mil XP (nivel 9): «Pianista» (11) y «Maestro» (16) solo se alcanzan repitiendo.
- Terceras y acordes (unidad 6) con micrófono requieren la beta de la Fase 2 (sin validar).

## Aplazado y deuda técnica

- **Atrás del navegador** (o el gesto de Android) sale de una lección sin confirmar y pierde la ronda; la X sí confirma.
- `ListeningStrip` se redibuja con el monitor del micrófono (~15 Hz) junto con el tablero: debería suscribirse sola.
- Los **ids de lección son posicionales** (`u2-3`): una prueba dorada vigila que no cambien; reordenar exigiría ids explícitos y migrar lo guardado.
- Con la pestaña abierta pasada la **medianoche**, racha y meta muestran los de ayer hasta el siguiente cambio; un reloj adelantado congela la racha. Falta una regla de ESLint que prohíba `new Date()` sin argumentos en `core`.
- El **bloqueo por avance** es solo de interfaz: `#/leccion/u1-4` abre una lección bloqueada por la dirección.
- El repaso por tecla mezcla milisegundos de micrófono y de teclado; las vecinas se añaden solo hasta tener 3 notas distintas (el plan decía «×3 + vecinas»).
- Títulos de lección fijos en notación latina aunque se elija la americana; `document.title` no lleva el título de la lección; el nodo «hecha» no muestra su título (solo estrellas); el bloqueo por entrada no tiene texto visible en el nodo.
- Pruebas de accesibilidad automáticas (`@axe-core/playwright`) en las e2e: pendientes (dependencia nueva).
- Aplazado por Kevin a otra fase: logros, calendario, tema B (sobrio) intercambiable, cuentas y nube.
