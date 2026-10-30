# Passo

Aplicación para aprender piano corrigiendo al instante lo que no se te da bien.
Nombre: **Passo** (paso a paso: no avanzas hasta que lo dominas).

> Estado: **Fases 0, 1, 2 y 3 completadas y la etapa 1 de guitarra (G1)** (Fase 1: escucha activa por micrófono; Fase 2: terceras y acordes, manos, notas que caen y ajustes; Fase 3: el juego por niveles con camino, estrellas, XP, racha y progreso guardado). Pendiente de validar con el piano y la guitarra reales: `docs/validacion-microfono.md` (pasos 15–29 de la Fase 2, 30–36 de la Fase 3 y 37–49 de la guitarra). Evidencias: `evidencias/fase-3/informe.md` y `evidencias/guitarra-1/informe.md`. Repositorio **solo local** (sin remoto de GitHub por ahora). Arranque: `npm install` y `npm run dev`; verificación: `npm run check` y `npm run e2e`.

## Cómo se usa hoy

- **Instrumento:** el chip de arriba a la izquierda («Estás aprendiendo») abre la lista **Mis instrumentos**: piano o guitarra. Cada uno tiene su camino, sus lecciones, sus estrellas y sus notas más flojas; la racha, la experiencia y los minutos del día son de los dos. La elección se recuerda (`?instrumento=guitarra` la fija solo en esa visita).
- **Guitarra (etapa 1):** tres unidades de notas sueltas (cuerdas al aire, primeras notas y todas las cuerdas hasta el traste 3: 17 notas naturales de Mi2 a Sol4) y el **afinador** (`#/afinador`). Solo con micrófono. Se juzga el **nombre** de la nota, no la octava (la guitarra se escribe una octava arriba de como suena). Más adelante: arpegios y acordes, tablatura y «Mi corazón encantado» compás a compás (ver `docs/fases/guitarra-1.md`).

- **Camino** (`#/`): seis unidades con lecciones cortas (nueva, repaso y prueba). Se abre centrado en tu lección. Cada lección da hasta **3 estrellas** (≥ 70 % para pasar; la 3.ª pide un fallo como máximo y el ritmo), experiencia y **racha** de días (con un día de descanso por semana). Las unidades 1 a 5 son de notas sueltas (lo que el micrófono oye); la 6, de terceras y acordes, es opcional.
- **Lección** (`#/leccion/<id>`): a pantalla completa; no arranca sola (hay que pulsar «Empezar» o activar el micrófono). Salir con la X pregunta y no guarda lo de esa ronda.
- **Progreso** (`#/progreso`): tu nivel, medias, el **mapa de tu teclado** (qué teclas aciertas a la primera) y la curva de precisión. «Practicar 3 min» arma un repaso con tus teclas más flojas. Todo se guarda **solo en este navegador** (`passo.progreso`); «Borrar mi progreso» lo elimina.
- **Práctica libre** (`#/practica`): la pantalla de siempre (modo y nivel a elección).

- **Engranaje «Ajustes»** (o `Ctrl+,`): elige la entrada (**micrófono**, piano **MIDI** o **teclado del PC**; solo escucha una), el ejercicio (**notas**, **terceras** o **acordes**, con su nivel), la notación (Do Re Mi / C D E), la ayuda y el tema. Todo se recuerda en el navegador. Abrirlo pausa la ronda.
- El **micrófono** nunca se enciende solo: hay que pulsar «Activar micrófono». Con él solo hay ejercicios de notas, salvo que actives la **beta «Oír varias notas a la vez»**.
- Cada objetivo muestra la **mano y los dedos**, la **cascada** de las dos notas siguientes sobre el teclado y la **mano fantasma** debajo.
- Parámetros de la dirección (modo de desarrollo y pruebas): `?pc` (teclado del PC como piano), `?midi`, `?mic=off`, `?seed=N` (notas reproducibles), `?debug` (latencia y mediciones de acordes), `?modo=notas|terceras|acordes&nivel=N` (fija el ejercicio de esa visita sin guardarlo). Úsalo con `?pc` o `?midi`: con el micrófono, terceras y acordes solo funcionan con la beta activada en Ajustes.

## 1. Problema

- Quien practica con videos y cursos se queda tocando lo que ya conoce y deja de avanzar.
- Al copiar un video, lo tocado nunca sale exactamente igual y nadie corrige en el momento.
- Repetir un fragmento exige retroceder el video a mano, y un bucle ciego tampoco es lo ideal.

## 2. Idea central

Aprender = practicar **lo que no sale bien** y recibir **corrección inmediata**, hasta que salga bien.

La app muestra qué teclas tocar, **escucha** lo que se toca y evalúa. No avanza si hay error.

### El bucle de aprendizaje (motor adaptativo)

1. Se toca una pieza o ejercicio; la app evalúa nota a nota.
2. Si falla en el tramo C–D pero A–B salió bien, **no se repite todo**: se practica solo C–D.
3. Cuando C–D sale bien, se **une** con el tramo anterior (B–C–D), y luego con toda la pieza.
4. Primero **coordinación sin errores**; después se sube **velocidad y ritmo**.

### Reglas de la evaluación

- **Modo espera**: la app no se adelanta; el cursor espera la nota correcta antes de avanzar.
- **Modo estricto**: un error reinicia el tramo.
- **Modo ritmo**: se califica también el tiempo (como mecanografía, pero con teclas de piano).

## 3. Modos de práctica

| # | Modo | Qué hace |
|---|---|---|
| 1 | Nota en pantalla | Se muestra una nota; se toca; la app dice si es correcta |
| 2 | Nota por oído | Suena una nota; se toca la misma sin verla |
| 3 | Intervalos y acordes | Terceras y acordes de tres notas para tocar |
| 4 | Ritmo ("mecanografía") | Teclas sincronizadas con metrónomo; se califica el tiempo |
| 5 | Canciones y partituras | Partitura con teclas, dedos y cascada de notas |
| 6 | Estricto / espera | Variantes aplicables a los modos anteriores |

## 4. Diseño visual

| Elemento | Detalle |
|---|---|
| Teclado | 88 teclas; ilumina la tecla a tocar y atenúa las siguientes |
| Dedos | Número 1–5 y color por dedo; mano fantasma animada |
| Nombres de notas | Interruptor Do-Re-Mi / C-D-E |
| Partitura | Cursor que avanza solo si se toca bien |
| Cascada | Notas que caen hacia el teclado (estilo Synthesia) |
| Feedback | Verde correcto, rojo incorrecto, flecha a la tecla correcta |
| Progreso | Barra de compases por color y mapa de calor de teclas débiles |

## 5. Tecnología (propuesta)

| Capa | Elección |
|---|---|
| UI | TypeScript + React + Vite, como PWA |
| Entrada principal: micrófono | Detección de altura McLeod propia (una nota); Basic Pitch u otra técnica para acordes (más difícil) |
| Entrada opcional: piano MIDI | Web MIDI API (exacta; no funciona en Safari) |
| Sonido | Web Audio + Tone.js |
| Partitura | VexFlow u OpenSheetMusicDisplay; importación MusicXML y MIDI |
| Datos | IndexedDB (Dexie) primero; nube (Supabase) más adelante |
| Empaquetado | PWA; Tauri o Capacitor si se quiere app nativa |

Decisión: como el piano de Kevin no tiene USB-MIDI, el **micrófono es la entrada principal** y el MIDI queda como opción. Riesgo mayor: reconocer acordes por audio.

## 6. Arquitectura (Clean Architecture)

| Capa | Contenido | Regla |
|---|---|---|
| Dominio | Nota, Acorde, Pieza, Intento, Evaluación, motor adaptativo | TypeScript puro, sin dependencias |
| Aplicación | Casos de uso (IniciarSesión, EvaluarIntento, ElegirSiguienteTramo) | Usa dominio y puertos |
| Puertos | `NoteInput`, `AudioOutput`, `Storage`, `Clock` | Interfaces |
| Adaptadores | `MidiInput`, `MicInput`, `ComputerKeyboardInput`, `WebAudio`, `IndexedDB` | Intercambiables |
| UI | Componentes React, teclado y partitura | Solo presenta y delega |

Cada modo implementa una interfaz común `ExerciseMode`: añadir un modo es añadir un archivo.
Gracias a los puertos, el motor se prueba sin piano usando el teclado del computador.
En código, las capas se agrupan en `core/` (dominio, aplicación, puertos), `adapters/` y `ui/`; la interfaz `ExerciseMode` se extrae en la Fase 1–2, no antes.

## 7. Fases

| Fase | Entrega | Estimado |
|---|---|---|
| 0 | Prototipo: teclado en pantalla + MIDI + modo "toca esta nota" (**hecha**) | 2 semanas |
| 1 | **Escucha activa:** detectar la nota que suena por el micrófono (el Yamaha E263 no tiene USB-MIDI) (**hecha**, falta validar con el piano real) | 3 semanas |
| 2 | **Ajustes, terceras y acordes:** panel de ajustes (entrada: micrófono / MIDI / teclado del PC), terceras y acordes, manos y dedos, notas que caen | 4–5 semanas |
| 3 | **Passo como juego (diseño «A» del mockup):** camino de unidades y lecciones, estrellas, XP, racha, progreso guardado y estadísticas por tecla (**hecha**, falta validar con el piano real) | 4–5 semanas |
| G1 | **Guitarra, etapa 1:** instrumento como concepto, chip «Mis instrumentos», diapasón, afinador y tres unidades de notas (**hecha**, falta validar con la guitarra real). Siguen G2 (arpegios y acordes), G3 (tablatura) y G4 (canciones por compases) | 3–4 semanas |
| 4 | Núcleo de práctica: modos espera y estricto, niveles con negras | 3 semanas |
| 5 | Entrenamiento por oído: nota por oído e intervalos por oído | 3 semanas |
| 6 | Ritmo: metrónomo y calificación de tiempo | 3 semanas |
| 7 | Canciones: MusicXML/MIDI, partitura | 4–6 semanas |
| 8 | Motor adaptativo: práctica por tramos, unión progresiva, subida de tempo | 3 semanas |
| 9 | Pulido: logros y calendario, **tema B (sobrio) intercambiable**, cuentas y nube | continuo |

Archivado a petición de Kevin (se retoma cuando él lo pida): teclado completo en móvil y selector de micrófono. Ver [docs/archivado.md](docs/archivado.md).

Detalle de cada fase: [docs/fases/](docs/fases/). Método de trabajo: [docs/metodo.md](docs/metodo.md). Convenciones: [docs/convenciones.md](docs/convenciones.md). Validación con el piano real (micrófono): [docs/validacion-microfono.md](docs/validacion-microfono.md); con un piano MIDI: [docs/validacion-piano.md](docs/validacion-piano.md).

## 8. Factibilidad

Alta con MIDI; media si se depende del micrófono. El motor adaptativo es el diferenciador frente a
Synthesia, Melodics, Piano Marvel, Simply Piano, Yousician o Flowkey.
