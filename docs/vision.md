# Visión del producto

> Este es el planteamiento original de Passo (el que abría el README). Sigue siendo la brújula del
> proyecto, pero **no describe lo que ya existe**: para eso, el [README](../README.md) y el detalle de
> cada fase en [docs/fases/](fases/). Las fases 4 a 9 y las etapas G2 a G4 de guitarra siguen sin
> construirse.

Nombre: **Passo** (paso a paso: no avanzas hasta que lo dominas).

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

## 5. Tecnología (propuesta inicial)

| Capa | Elección |
|---|---|
| UI | TypeScript + React + Vite, como PWA |
| Entrada principal: micrófono | Detección de altura McLeod propia (una nota); Basic Pitch u otra técnica para acordes (más difícil) |
| Entrada opcional: piano MIDI | Web MIDI API (exacta; no funciona en Safari) |
| Sonido | Web Audio + Tone.js |
| Partitura | VexFlow u OpenSheetMusicDisplay; importación MusicXML y MIDI |
| Datos | IndexedDB (Dexie) primero; nube (Supabase) más adelante |
| Empaquetado | PWA; Tauri o Capacitor si se quiere app nativa |

Decisión: como el piano de Kevin no tiene USB-MIDI, el **micrófono es la entrada principal** y el MIDI
queda como opción. Riesgo mayor: reconocer acordes por audio.

> Lo construido hasta hoy se aparta de esta propuesta en dos puntos: no usa Tone.js (el sonido de
> prueba sale de Web Audio directamente) y el progreso se guarda en `localStorage`, no en IndexedDB.

## 6. Factibilidad

Alta con MIDI; media si se depende del micrófono. El motor adaptativo es el diferenciador frente a
Synthesia, Melodics, Piano Marvel, Simply Piano, Yousician o Flowkey.
