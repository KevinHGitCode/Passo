# Guitarra · etapa 1 (G1): instrumento y notas

> Estado: **hecha** (falta validar con la guitarra real). Plan corregido tras la revisión de los 3 expertos (música y acústica, interfaz, arquitectura e infraestructura), implementado y revisado de nuevo al final.
> Maqueta aprobada por Kevin: https://claude.ai/artifact/5wjCuKZcUuDNKauAgwQcr2 (privada).

## Para qué

Kevin practica piano **y** guitarra. Passo ya enseña piano como un juego (camino, lecciones, estrellas, racha). La guitarra entra como **un instrumento más** que reutiliza todo eso, no como una app aparte. Esta primera etapa deja funcionando lo mínimo para aprender notas sueltas en guitarra con el micrófono:

1. Elegir instrumento desde un **chip con lista** (como el de cursos de Duolingo): escala a más instrumentos.
2. Un **afinador**, porque con una cuerda floja todas las notas saldrían como error.
3. Un **diapasón** (el mástil con cuerdas y trastes) que muestra qué tocar: cuerda, traste y dedo.
4. Un **camino de guitarra** de tres unidades: cuerdas al aire, primeras notas y todas las cuerdas en primera posición.
5. Progreso **por instrumento** (lecciones, estrellas, notas que más cuestan); racha, experiencia y minutos del día son compartidos.

## Fuera de esta etapa

Arpegios y acordes (G2), tablatura (G3), la canción «Mi corazón encantado» con compases que avanzan solos (G4), mapa de calor sobre el diapasón, práctica libre de guitarra, MIDI y teclado del PC para guitarra, más allá del traste 3, sostenidos y bemoles, otras afinaciones, cejilla y bajo.

## Decisiones tras la revisión de los expertos

**D1 · El instrumento es un concepto del dominio.** `core/domain/instrument.ts` (solo números y tipos): `Instrument = 'piano' | 'guitarra'`, la afinación estándar (cuerdas 1 a 6 al aire, MIDI **sonoro**: 64, 59, 55, 50, 45, 40), `midiAt(cuerda, traste)` y `FretPosition { string, fret, finger: 1|2|3|4|null }`. **No** hay `positionFor` que infiera: cada posición se declara en el catálogo. No se reutiliza `Finger` de piano (allí 1 es el pulgar; en guitarra 1 es el índice).

**D2 · Se juzga el nombre de la nota, no el sitio del mástil.** `Target.notes` sigue siendo MIDI sonoro. `Target` gana `positions: readonly FretPosition[]` (vacío si no se indica, como `fingers`); `targetOf` valida que la longitud coincida y que `midiAt(posición) === nota`. `sameTarget`, `targetKey` y `evaluate` no cambian.
En esta etapa las lecciones de guitarra son **de octava libre**: `RoundConfig.octaveFree` hace que la sesión pliegue la nota oída a la octava del objetivo cuando coincide el nombre. Resuelve a la vez que la guitarra se escribe una octava arriba de como suena, los errores de octava de las cuerdas graves en micrófono y que «Mi» se toca en tres sitios. A cambio, tocar el Mi de otra cuerda también vale; en G2, con posición exacta, se acotará el detector al objetivo.

**D3 · Nombres sin octava en guitarra.** Una función `noteLabel(midi, notación, instrumento)` sustituye a `noteName` donde se muestra una nota. Los textos que hablan del piano («altavoz del piano», «Do central», «Nivel de pianista») pasan a depender del instrumento.

**D4 · Catálogo por instrumento, sin romper el de piano.** `Lesson` gana `instrument` (requerido). Se extraen `Lesson`, `Unit` y `lessonsOf` a `lesson-model.ts` (reexportados desde `lessons.ts`, así los imports actuales no cambian). `guitar-lessons.ts` importa solo de `lesson-model`. `UNITS` y `LESSONS` **siguen siendo de piano**; `lessons.ts` añade `ALL_LESSONS`, `unitsOf(instrument)`, y `findLesson` busca en todas. `lessonAccessMap` y `currentLesson` reciben las unidades (por omisión, las de piano). Ids de guitarra con prefijo: `g1-1`, `g2-3`… (los de piano no cambian).

**D5 · Progreso.** Sin subir `PROGRESS_VERSION` (la forma no cambia; `parseProgress` ya descarta lo desconocido). Racha, experiencia y minutos se comparten. Las estadísticas por tecla usan una **sola función de clave**: `targetKey(notes, instrument = 'piano')` → `"64"` en piano y `"g:64"` en guitarra. `RoundConfig.instrument` y `Attempt.instrument` la alimentan; `KNOWN_KEYS`, `prune`, review, `CaminoScreen` y `ProgressScreen` pasan por ella (hoy `Number(clave)` daría `NaN`). El repaso de puntos débiles se arma por instrumento (`repaso-debiles` sigue siendo el de piano; el de guitarra tiene id propio). Riesgo asumido: una versión vieja de la app podría pisar datos de guitarra al guardar.

**D6 · Preferencias.** Campo `instrument` (por omisión `'piano'`; un archivo v1 sigue siendo válido; **sin** subir `PREFERENCES_VERSION`); `samePreferences` lo incluye. `consistent()` **no** reescribe `input`: con guitarra y una entrada distinta del micrófono, `playBlock` devuelve «necesita micrófono» y el camino ofrece «Usar micrófono». `?instrumento=guitarra` es de desarrollo y no se guarda.

**D7 · Perfil de escucha del micrófono.** `core/domain/listening-profile.ts`: `Instrument | 'afinador'` → configuración parcial del rastreador. Guitarra: `minMidi 38`, `maxMidi 79`, `sameNoteRetriggerMs 1200`, `onsetRatio 1.8`, `refractoryMs 250` (con la de piano salían 2–5 «re-ataques fantasma» por pulsación en Mi2–La2, que contarían como error) y `learnTuning: false` (para que una cuerda floja no se «aprenda» como desvío del instrumento). `NoteTracker.reconfigure()` cambia la configuración en caliente **sin recalibrar** (conserva fase y ruido, borra el desvío aprendido). Puerto `ListeningProfileSink.setProfile`, implementado por `MicrophoneInput`, y un `bindProfileToSession` en application con el patrón de `input-sync`. El eco de la guitarra dura ≥ 2 s (las cuerdas suenan 3 a 6 s): el pedir «silencia la cuerda anterior» va en los consejos.

**D8 · Afinador.** Pantalla `#/afinador`. El tono continuo (`frame.pitch`) sale en el monitor y **no** se usa `heard.cents` (está recentrado por la afinación aprendida y congelado ~60 ms tras el ataque). **La persona elige la cuerda** (6 botones de ≥ 44 px) y se mide contra ella, con el detector acotado a ±300 cents («muy baja / muy alta», no el semitono vecino). «Afinada» = la mediana de ≥ 5 fotogramas dentro de **±5 cents durante 600 ms**; se sale de ese estado a ±8 (histéresis). Texto primero («Grave 23 cents», «Afinada», «Aguda») y aguja decorativa; el lector de pantalla solo oye cambios de estado, nunca los cents. Aviso suave en el camino de guitarra, no un bloqueo. El micrófono se apaga al salir del afinador.

**D9 · Contenido (solo notas naturales, trastes 0 a 3: 17 notas, Mi2 a Sol4, sin MIDI repetido; rondas y estrellas como en piano).**
- **G-U1 · Cuerdas al aire** (sin meta de ritmo): Mi·Si·Sol → Si·Sol·Re → Sol·Re·La → Re·La·Mi → repaso de las 6 → prueba. Se empieza por las agudas (1 a 3) y las graves (5 y 6) llegan al final.
- **G-U2 · Primeras notas:** Mi·Fa·Sol (cuerda 1, trastes 0·1·3) → Si·Do·Re (cuerda 2, trastes 0·1·3) → repaso → prueba. Metas de ritmo 8 / 10 / 12.
- **G-U3 · Todas las cuerdas:** cuerdas 3 y 4 → cuerdas 5 y 6 → repaso de las 17 → prueba. Metas 9 / 11 / 13.
- Cada lección tiene al menos 3 notas (con 2, el sorteo alternaría ABAB). Dedos 1 a 4 (índice a meñique) = traste; ninguno en cuerda al aire. G-U2 y G-U3 piden G-U1.

**D10 · Interfaz.**
- **Un solo `InstrumentChip`**, montado en `GameLayout`: bajo la marca de la barra lateral (≥ 900 px) y a la izquierda de la cabecera móvil. Botón con `aria-expanded`/`aria-controls` y nombre «Instrumento: Guitarra. Cambiar»; lista de `<button>` en orden de Tab (el activo con `aria-current`, check y «actual»); Esc cierra y devuelve el foco (con `stopPropagation`). En móvil, hoja modal con foco al título, trampa de Tab y fondo `inert`. **Sin «Agregar instrumento»** (control muerto). En una lección el chip es de solo lectura. Al elegir, el camino se recentra y se anuncia con `role="status"`. Ajustes no lleva segundo selector.
- **Tokens:** `data-instrument` en la raíz, 4 bloques de guitarra (claro, oscuro explícito, oscuro automático y `.stage-dark`) que sobrescriben acento ×4, `on-accent`, `key-target(-edge)` y `--meter-fill`; marca «oído» con anillo blanco propio (el violeta de piano no pasa contraste sobre el diapasón); la prueba `tokens-contrast` compone los bloques y añade los pares nuevos. El instrumento se dice siempre con icono y nombre, nunca solo con color.
- **`Fretboard`** (SVG, cuerda aguda arriba como la tablatura, extremos rotulados «1 · Mi · aguda» y «6 · grave»; trastes 0 a 3 con `viewBox` ≤ 440 para móvil; «Ahora» sólido con número de dedo, «Después» discontinuo, ✓ ✕ ↓ como en el piano; reglas `forced-colors`; `aria-label` estático y el objetivo en el `role="status"` de la lección). El `BoardModel` se separa en núcleo común + modelo de piano + modelo de guitarra. La línea «Cuerda 1 (la más aguda) · traste 1 · dedo 1, el índice» se muestra con la ayuda activada.
- **Progreso de guitarra:** tarjetas por unidad, lista «Notas que más cuestan» (hasta 5) y curva filtrada por instrumento; franja «Compartido» (racha, experiencia, minutos). Sin mapa de calor.
- **Práctica libre:** con guitarra elegida, la barra inferior cambia «Práctica libre» por «Afinador»; si se entra por `#/practica`, manda la ruta y se pasa a piano diciéndolo.
- **Camino:** el índice del zigzag y la «primera visita» son por instrumento.

**D11 · Rutas.** Se añade `afinador` (tipo `Route`, `TITLES`, `Shell`, y la regla que apaga el micrófono al salir). Una lección `g…` fija el instrumento de la sesión aunque las preferencias digan otro.

## Orden de trabajo (un commit por paso; `npm run check` verde en cada uno)

1. Este plan.
2. Dominio: `instrument`, `Target.positions`, división `lesson-model` (sin cambio de conducta).
3. Instrumento en `RoundConfig`/`Attempt`/`targetKey`/`KNOWN_KEYS`/review y pantallas, con pruebas de compatibilidad.
4. Catálogo de guitarra, `playBlock` y `octaveFree` en la sesión.
5. Preferencias (`instrument`).
6. Perfil de escucha: `reconfigure`, `learnTuning`, rango, puerto, adaptador y enlace; guitarra sintética para probarlo.
7. Tono continuo del monitor, dominio del afinador y `TunerService`.
8. Tokens por instrumento (con su prueba de contraste) y `Fretboard`.
9. Chip, camino y lección de guitarra; copys por instrumento.
10. Pantalla y ruta del afinador.
11. Progreso por instrumento.
12. Pruebas e2e en Edge, capturas y video.
13. Revisión final de los expertos, correcciones y documentación.

## Cómo se prueba una guitarra sin guitarra

`guitarNote()` en las ayudas de prueba: Karplus-Strong (48 kHz, retardo fraccionario, excitación triangular a 0,15·L más un golpe de púa de 8 ms, pérdida 0,10–0,15 en acero y 0,45 en nailon, t60 de 3 a 6 s en graves de acero) y síntesis aditiva con fundamental débil, a través de pasa-altos de portátil. Casos: matriz de confusión de octava (24 notas × 3 timbres, sin octava errónea con confianza alta), una pulsación = un solo ataque en Mi2–La2, ataque lento, vibrato, y `reconfigure` en caliente (calibrar en piano, pasar a guitarra, la fase se mantiene). Los límites de lo sintético se dicen en el informe: la validación real es de Kevin.

## Validación con la guitarra real (Kevin)

Sección nueva en `docs/validacion-microfono.md` al cerrar la etapa: afinar con el afinador, las seis cuerdas al aire, la unidad 2 y las cuerdas graves, y qué guitarra se usó (acústica, de nailon o eléctrica).

## Decisiones tras la revisión final

Los tres expertos revisaron lo construido (música y acústica, interfaz y arquitectura). Se aplicó lo siguiente:

**Música y acústica**

- **Afinador, cuerda equivocada:** con un intervalo estrecho el detector devolvía un submúltiplo del tono tocado (elegir la cuerda 6 y tocar la 1 leía «0 cents, afinada»). Ahora la lectura solo vale si la fundamental tiene energía frente a sus seis primeros armónicos (`fundamentalShare` ≥ 0,2): los alias dan ≈ 0 y las cuerdas reales ≥ 0,5, incluso con un micrófono que recorta los graves y con ruido.
- **Afinador, estabilidad:** las lecturas de los primeros 250 ms tras empezar a sonar no cuentan (la cuerda sube 10–30 cents al pulsarla), la ventana es de 350 ms y «Afinada» se deja ver 2 s tras callarse la cuerda (el nailon se apaga pronto).
- **Guitarra desafinada:** si todas las notas fallan por la misma distancia, la lección dice «tus notas suenan N semitonos más graves/agudos: abre el afinador». El error creíble por micrófono llega a 24 semitonos (`RoundConfig.maxWrongDistance`; el mástil abarca 27).
- **Octava oída:** `Attempt.heardMidi` guarda la octava real que leyó el micrófono (con `octaveFree`, `playedMidi` guarda la plegada) y el rebote de la cuerda anterior se reconoce como eco aunque se lea en otra octava.
- **Notas repetidas:** «Mi · cuerda 6» en el progreso y en «lo que más costó»; el repaso pide tres **nombres** distintos; el afinador avisa «acerca el micrófono» cuando casi no oye.

**Arquitectura**

- El resultado de una lección ofrece el repaso **de su instrumento** (antes ofrecía el de piano). Medir el tono nunca cuesta las notas de un fotograma (try/catch propio). El afinador no repinta por cambios de menos de 2 cents. `detectPitch` tiene ahora pruebas directas con intervalos estrechos y un barrido de piano que fija su comportamiento (el cambio del lóbulo inicial no altera nada hasta Re6; por encima, antes salía una octava abajo).

**Interfaz**

- Bloqueante corregido: en móviles de 320–360 px el chip chocaba con «Ajustes» (nombre con puntos suspensivos y «Ajustes» solo con icono hasta 420 px). La hoja del instrumento sale a `document.body` (cubre la barra inferior), deja la página inerte y se nombra por su título; el menú de escritorio se cierra al irse el foco; elegir compara con la preferencia, no con lo que se ve.
- Afinador: el foco pasa a la cuerda elegida al conectar el micrófono, los anuncios del lector de pantalla esperan 700 ms de estado estable y los mensajes del micrófono son una región viva. Icono propio del afinador, rótulo del mástil a 13, aviso en `#/practica` con guitarra elegida y cabecera de lección sin el «Micrófono» redundante.

## Resultados

- `npm run check`: lint, dependencias (124 módulos, 0 violaciones), formato, **1349 pruebas** (77 archivos) y compilación.
- **54 pruebas e2e en Edge, 3 de 3 corridas** (49 de las fases 0 a 3 y 5 de guitarra), con videos y capturas en `evidencias/guitarra-1/` (informe en `evidencias/guitarra-1/informe.md`).
- Pruebas de audio con una guitarra **sintética** (Karplus-Strong, acero y nailon, con y sin pasa-altos de portátil): las 17 notas dan un solo ataque con el nombre correcto; sin el perfil de guitarra, La2 rebotaba en varios ataques.

## Límites conocidos

- **Se juzga el nombre, no la octava ni la cuerda:** el Mi de la cuerda 1 y el de la 6 son intercambiables (24 semitonos) y el Sol de la cuerda 1 (traste 3) se acepta con la 3 al aire. Es la decisión D2; en G2 se acotará el detector al objetivo.
- **Inarmonicidad:** el tono del afinador sale del periodo de la señal; con parciales muy desplazados (cuerdas gruesas) puede dar +3 cents (B = 1·10⁻⁴) o +9 (B = 3·10⁻⁴), del orden de la tolerancia (±5). Se comprueba con la guitarra real.
- **Alias de octava del afinador:** con la cuerda 6 elegida, tocar el Mi3 se lee como 82,5 Hz con claridad máxima (es lo que pasa con el armónico del traste 12); se tolera.
- Los umbrales (fundamental ≥ 0,2, ±5/±8 cents, 600 ms, 250 ms de asentamiento, metas de ritmo 8/10/12 y 9/11/13) vienen de **simulaciones**: la validación real es de Kevin (`docs/validacion-microfono.md`, pasos 37–46).
- Solo guitarra por micrófono, solo notas naturales hasta el traste 3, afinación estándar; sin práctica libre de guitarra.

## Aplazado y deuda técnica

- Arpegios y acordes (G2), tablatura (G3) y «Mi corazón encantado» (G4); la partitura de la canción la aporta Kevin (no se transcribe de memoria).
- «Usar micrófono» como botón en el camino (hoy el aviso lleva a Ajustes) y el perfil de escucha propio del afinador (D7); ✓ ✕ ↓ sobre el mástil (hoy el borde de color y la barra de respuesta).
- `MicrophoneInput` implementa siete interfaces: extraer un `PitchMeter`. `getPitch()` sin consumidor de producción; `pickTarget(..., avoidSameName)` con booleano posicional.
- El mapa de «Notas que más cuestan» no distingue lo que cambió de cuerda; las cuerdas del afinador podrían ser `radiogroup`; al cruzar 899 px con la lista abierta se pierde el foco; la hoja no usa `env(safe-area-inset-bottom)`.
- Riesgo asumido: una versión vieja de la app podría pisar datos de guitarra al guardar. Las evidencias (webm y png) pesan en git (~1 MB los videos).
- Con `?modo=` (desarrollo), salir de una lección no restaura su configuración; `?instrumento=` se guarda en el siguiente cambio de preferencias.
