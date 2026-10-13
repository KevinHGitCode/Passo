# Passo

Aplicación para aprender piano corrigiendo al instante lo que no se te da bien.
Nombre: **Passo** (paso a paso: no avanzas hasta que lo dominas).

> Estado: planificación. Repositorio **solo local** (sin remoto de GitHub por ahora).

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
| Entrada con piano digital | Web MIDI API (exacta; no funciona en Safari) |
| Entrada con micrófono | Pitchy / YIN para una nota; Basic Pitch para acordes (más difícil) |
| Sonido | Web Audio + Tone.js |
| Partitura | VexFlow u OpenSheetMusicDisplay; importación MusicXML y MIDI |
| Datos | IndexedDB (Dexie) primero; nube (Supabase) más adelante |
| Empaquetado | PWA; Tauri o Capacitor si se quiere app nativa |

Recomendación: **MIDI primero**, micrófono después. Riesgo mayor: reconocer acordes por audio.

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

## 7. Fases

| Fase | Entrega | Estimado |
|---|---|---|
| 0 | Prototipo: teclado en pantalla + MIDI + modo "toca esta nota" | 2 semanas |
| 1 | Núcleo: modos estricto y espera, feedback, nombres de notas, persistencia | 3–4 semanas |
| 2 | Modos de entrenamiento: oído, intervalos, acordes | 3 semanas |
| 3 | Ritmo: metrónomo y calificación de tiempo | 3 semanas |
| 4 | Canciones: MusicXML/MIDI, dedos, cascada, partitura | 4–6 semanas |
| 5 | Motor adaptativo: práctica por tramos, unión progresiva, subida de tempo | 3 semanas |
| 6 | Pulido: estadísticas, micrófono, cuentas y nube | continuo |

Detalle de cada fase: [docs/fases/](docs/fases/). Método de trabajo: [docs/metodo.md](docs/metodo.md).

## 8. Factibilidad

Alta con MIDI; media si se depende del micrófono. El motor adaptativo es el diferenciador frente a
Synthesia, Melodics, Piano Marvel, Simply Piano, Yousician o Flowkey.
