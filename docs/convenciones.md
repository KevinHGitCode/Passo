# Convenciones musicales y de entrada

## Notas

- Número MIDI 0–127. **Do central = C4 = MIDI 60** (notación científica). Referencias: 21 = La0, 69 = La4 (440 Hz), 108 = Do8.
- Se muestra siempre la octava: `Do4` (latina) o `C4` (americana). Algunos pianos y programas (Yamaha, algunos DAW) llaman `C3` al Do central; Passo no.
- Ortografía fija con **sostenidos** (`Do#4`). La ortografía según la tonalidad llegará con las partituras (Fase 4).

## Qué es un intento

- Cada `note-on` con velocidad > 0 evalúa la tecla pulsada y cuenta como un intento.
- Los `note-off` y los `note-on` con velocidad 0 se ignoran.
- Si se pulsan varias teclas a la vez, cada una es un intento independiente (objetivos de una nota).
- Un error no avanza: la nota objetivo se mantiene hasta acertar.

### Objetivos de varias notas (terceras y acordes, Fase 2)

- El objetivo es un **conjunto de notas** (`Target`) con sus dedos, la mano y, si es un acorde, su nombre. Una nota sola es el caso particular.
- Cada nota del conjunto que suena es un **avance** («Casi · Falta Sol4»): ni acierto ni error. Se acierta cuando **todas están pulsadas a la vez**; soltar una nota la quita.
- Una **nota de más** es un error **al instante**. Varias notas equivocadas seguidas (≤ 120 ms entre sí y ≤ 300 ms desde la primera) cuentan **un solo error**. Que falten notas **no** es error.
- Con el micrófono una nota ajena nunca es error: es «No te oí bien». Un micrófono de una sola voz no puede juzgar un acorde: con la beta de varias notas (ver abajo) lo hace el verificador de acordes.
- Contenido: terceras N1 (Do–Mi, Re–Fa, Mi–Sol), N2 (las 7 de la escala de Do), N3 (mano izquierda); acordes A1 (Do y Sol mayor), A2 (+ Fa), A3 (+ La menor), A4 (+ Re y Mi menor), A5 (mano izquierda). Dedos (de grave a agudo): mano derecha terceras 1-3, 2-4, 3-5, 1-3, 2-4, 3-5, 1-3; acordes 1-3-5; mano izquierda en espejo (5-3, 4-2, 3-1… y 5-3-1).
- La «mano fantasma» dibuja cinco dedos sobre teclas blancas contiguas con el dedo de la nota más grave apoyado en ella; la derecha va en cápsulas azules y la izquierda en cuadrados rosas (la forma distingue las manos aunque no se vea el color).

## Teclado del PC como piano (solo desarrollo y pruebas)

Usa la posición física de las teclas (`event.code`), sin importar la distribución del teclado.

```
negras:     W E   T Y U   O P
blancas:   A S D F G H J K L ; '
notas:     C D E F G A B C D E F      (A = Do4 = MIDI 60)
```

El nivel 1 (Do4–Sol4) usa las teclas `A S D F G`. Para la **mano izquierda** hay una fila de abajo (solo blancas): `Z X C V B N M` = Do3 a Si3. Las combinaciones con Ctrl, Alt o Meta se ignoran para no chocar con atajos del navegador.

## Entrada por micrófono (escucha activa)

- **Un ataque = un intento.** Una nota solo se abre con un ataque (subida clara de energía): la voz, el zumbido o la música de fondo sostenidos no cuentan.
- Varias teclas a la vez (o lecturas inestables) **no son un intento**; la app pide tocar una tecla a la vez.
- **Lo dudoso no es un error:** una nota distinta de la pedida detectada con confianza `media` se muestra como «No te oí bien» y no suma errores. Un acierto cuenta con cualquier confianza.
- Rango fiable: **C3–C6** (131–1047 Hz). Por debajo de C3 el altavoz de un teclado portátil apenas emite la fundamental y puede haber error de octava.
- El micrófono no da velocidad ni duración fiables: solo cuentan los **ataques**. El tiempo de reacción es **aproximado** (sesgo de 30–80 ms por la latencia de entrada) y no se compara con el de MIDI.
- La app **no emite sonido** mientras escucha por micrófono, para no oírse a sí misma.
- Afinación: se toma la nota más cercana (hasta ±50 cents) y se estima la afinación del teclado; si se desvía 20 cents o más de La4 = 440 Hz se avisa. Si hay 3 errores seguidos con la misma diferencia de semitonos, se avisa de que el teclado puede estar transpuesto.
- Privacidad: el audio se analiza en el navegador; no se graba ni se envía.

### Reglas finales de la escucha activa (tras la revisión de la Fase 1)

- Una nota distinta de la pedida solo es **error** si el micrófono está seguro (confianza `alta`) y es una equivocación creíble: nota vecina a menos de una octava y que no sea la misma nota en otra octava.
- Son **«No te oí bien» (no cuentan como error ni como intento)**: confianza `media`, la misma nota en otra octava (la detección favorece el periodo más corto y los altavoces pequeños casi no emiten la fundamental), y sonidos a más de una octava de la pedida.
- El **eco** (la misma nota del intento anterior, acierto o error, dentro de 900 ms) se ignora.
- El aviso de **teclado transpuesto** necesita ≥ 3 errores de la misma diferencia entre los 6 últimos intentos y ≥ 2 notas pedidas distintas.
- Si el micrófono entrega silencio digital exacto más de 1,2 s se avisa («No llega sonido del micrófono»).

### Octava del «Mi» y acordes por micrófono (Fase 2)

- **Corrección de octava:** si hay energía en f/2 (≥ 0,05 de la de f) **y** en 3f/2 (≥ 0,02), y ambas sobresalen ≥ 4× del ruido de alrededor, f es el 2.º parcial de una nota una octava más grave y se corrige hacia abajo (nunca hacia arriba; con histéresis; no corrige si esa nota sonaba hace < 700 ms). Validado de **Si3** en adelante; en Mi3/Sol3 la corrección no es fiable.
- **Acordes por micrófono (BETA, apagado por defecto):** la sesión le dice al micrófono qué notas se esperan y este las comprueba, **un ataque cada vez**: espera 40 ms tras el ataque (el golpe del martillo) y mide 170 ms; para cada nota esperada mide la energía en su frecuencia (±30 cents) y exige que supere ≥ 10× el ruido, que sobresalga ≥ 3× de las notas a ±2 y ±3 semitonos (descontando lo que ya sonaba antes del ataque), que **no sea fuga de un semitono vecino** que se toca de verdad (la energía nueva en una tecla de al lado no puede pasar de la mitad de la de la nota), que haya subido ≥ 1,8× respecto a antes del ataque (salvo las notas que la medición anterior de ese mismo acorde ya dio por presentes: así un acorde se puede completar añadiendo la nota que faltaba con las otras pulsadas) y que **no sea una octava más grave de lo que parece**: ni el 2.º armónico de la octava inferior (energía en f/2 ≤ 0,3 de la nota) ni, aunque el altavoz no dé los graves, su 3.er y 5.º parcial (en 1,5·f y 2,5·f; solo se afirma si se pueden medir los dos). Las notas de más (no armónicos) se entregan con confianza «media», es decir, como dudosas (no error). En graves (< 250 Hz, hasta Si3) solo se comprueba presencia (por la fundamental o por el 2.º y 3.er parcial) y no se distingue la octava.
- `?debug` expone `window.__passoChords` con la evidencia de cada medición (ver `docs/validacion-microfono.md`).
- Límites conocidos de la corrección de octava del «Mi»: con el Mi4 todavía sonando más de 700 ms, un Mi5 real podría leerse como Mi4. Un acorde totalmente equivocado (ninguna nota esperada y ninguna nota de más clara) no da ningún mensaje.

## Instrumentos y guitarra (etapa G1)

- **El tono se juzga; la posición guía.** `Target.notes` es MIDI **sonoro** (Mi2 = 40 … Mi4 = 64). `Target.positions` (cuerda, traste, dedo) solo dice dónde tocarlo; la misma nota puede tocarse en más de un sitio. Los dedos de guitarra son 1 índice … 4 meñique (no se reutiliza `Finger` de piano, donde el 1 es el pulgar).
- **Guitarra: juicio por nombre.** `RoundConfig.octaveFree` pliega la nota oída a la octava del objetivo si el nombre coincide (solo objetivos de una nota); `evaluate` no tiene ramas por instrumento. El sorteo no repite el mismo nombre seguido. En G2 (posición exacta) se acotará el detector al objetivo.
- **Nombres sin octava en guitarra** (`noteLabel(midi, notación, instrumento)`): se escribe una octava arriba de como suena. En piano, con octava.
- **Claves de tecla:** `targetKey(notas, instrumento)` → `"64"` en piano y `"g:64"` en guitarra (una sola función); `historyOf(historia, instrumento)` separa las estadísticas y los repasos (`repaso-debiles` y `repaso-debiles-guitarra`). Los ids de lecciones de guitarra llevan prefijo (`g1-1`).
- **Catálogo:** `UNITS` y `LESSONS` son de piano; `unitsOf(instrumento)` / `lessonsFor(instrumento)` dan cada camino y `findLesson` busca en todos. `lessonAccessMap` y `currentLesson` reciben las unidades.
- **Perfil de escucha:** `trackerConfigFor(instrumento)`; el micrófono cambia de perfil **en caliente** (`NoteTracker.reconfigure`, sin recalibrar) siguiendo al instrumento de la **sesión** (`bindProfileToSession`). Guitarra: `minMidi 38`, `maxMidi 79`, `sameNoteRetriggerMs 1200`, `onsetRatio 1.8`, `refractoryMs 250`, `learnTuning false`.
- **Afinador:** mide el tono continuo (`PitchMonitor`/`PitchTarget`) dentro de ±300 cents de la cuerda elegida; «afinada» = mediana de ≥ 5 lecturas a ±5 cents durante 600 ms, y se sale a ±8. Mientras mide, el micrófono avisa del silencio en cada fotograma. El lector de pantalla oye solo el estado, nunca los cents.
- **Interfaz:** `data-instrument` en la raíz cambia el acento (azul piano, violeta guitarra) por **tokens por rol**; el instrumento se dice siempre con icono y nombre. Un solo `InstrumentChip` (barra lateral en escritorio, cabecera en móvil, donde la lista es una hoja que sale a `document.body`).

## Lecciones, estrellas y progreso (Fase 3)

- **Una lección** es una ronda con su propio conjunto de objetivos (10 objetivos si es nueva, 14 si es repaso, 20 si es prueba; 12 en terceras y acordes). Los ids (`u2-3`) se guardan en el progreso: **no se reordenan** (una prueba lo vigila).
- **Estrellas:** < 70 % no pasa (0 ★) · 1 ★ al pasar · 2 ★ con 80 % (nueva) o 90 % (repaso y prueba) · 3 ★ con un fallo como máximo por ronda (90 / 92 / 95 %) **y** el ritmo objetivo (la unidad 1 no lo exige; en las pruebas, además, **sin ayuda**).
- **Ritmo** = notas por minuto con el tiempo **activo**: lo que se tarda en cada objetivo hasta acertarlo (tope 10 s), sin pausas ni el primer objetivo. Con el micrófono la meta baja × 0,9 (× 0,75 con la beta de varias notas).
- **Experiencia:** 10 por objetivo a la primera, 5 a la segunda, +10 por estrella nueva; al repetir una lección aprobada, 50 % y luego 25 %. El repaso de puntos débiles da el 50 %.
- **Racha:** días seguidos con al menos una lección **aprobada**; un día de descanso gratis por semana (de lunes a domingo). Los días son los **locales** del equipo.
- **Tecla débil:** ≥ 5 intentos y (a la primera < 80 % o mucho más lenta que tu mediana, con un margen de 600 ms); se vigilan los últimos 10 y lo reciente pesa más; vuelve a «normal» con 4 de las últimas 5 a la primera.
- **Desbloqueo:** por avance; «saltar con prueba» (≥ 2 ★ en la prueba) abre la unidad entera y la siguiente. Terceras y acordes con micrófono piden la beta.
- **Datos:** `passo.progreso` (versión 1) guarda experiencia, racha, mejores marcas por lección, últimas 10 muestras por tecla, tiempo de los últimos 90 días y las 50 lecciones recientes. Lo dañado se copia a `passo.progreso.corrupto`; una versión mayor se muestra vacía y no se pisa.
