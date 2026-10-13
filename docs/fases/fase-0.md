# Fase 0 — Prototipo: "toca esta nota"

Estado: **autorizada por Kevin; en construcción**. Entrada de prueba: teclado del PC (el piano Yamaha E263 lo valida Kevin después).

## Objetivo

Probar de punta a punta el bucle central de Passo con lo mínimo posible:
se muestra una nota → Kevin la toca → la app evalúa al instante → no avanza hasta acertar.
Dejar sembrada una arquitectura limpia (sin sobreingeniería) y **los datos de cada intento**
que necesitará el motor adaptativo de la Fase 5.

## Alcance

- **Proyecto**: Vite + React + TypeScript estricto, Vitest, ESLint + Prettier, `dependency-cruiser`.
- **Núcleo (`core/`, TS puro)**: `Note` (número MIDI), nombres en dos notaciones, evaluación,
  selección de nota, registro de intentos, caso de uso de la sesión.
- **Adaptadores**: `MidiInput` (Web MIDI), `ComputerKeyboardInput` (solo desarrollo/pruebas),
  `WebAudioOutput`.
- **UI**: teclado SVG parametrizado, nota objetivo, feedback, estados de conexión, resumen de ronda.
- **Modo**: "Toca esta nota", con el nivel 1 (ver "Reglas musicales").

## Fuera de alcance

Persistencia, micrófono, notas por oído, acordes, ritmo, partituras, dedos, motor adaptativo,
desbloqueo automático de niveles, cuentas, backend, GitHub y CI.

## Decisiones tomadas tras la revisión de expertos

| # | Decisión | Origen |
|---|---|---|
| 1 | Tres carpetas en `src/`: `core/` (dominio, aplicación y puertos), `adapters/`, `ui/`; composición solo en `main.tsx` | Backend |
| 2 | Sin interfaz `ExerciseMode` todavía: un `TargetNoteExercise` concreto. Se extrae la interfaz en la Fase 1–2 con dos ejemplos reales | Backend |
| 3 | `NoteInput`: `subscribe(handler) → unsubscribe`, con `NoteEvent = {type, note, velocity, at}`; `at` en ms del `Clock`. Callbacks simples, sin RxJS | Backend |
| 4 | `Clock = { now(): number }` monotónico (`performance.now`); `FakeClock` en pruebas | Backend |
| 5 | Motor puro: `evaluate(state, event, target) → {state, outcome}`; el azar entra por un `rng` inyectado | Backend |
| 6 | Estado del ejercicio en `core`, la UI se suscribe con `useSyncExternalStore`; sin re-render completo por evento | Backend/UI |
| 7 | Web Audio directo (sin Tone.js aún); `AudioContext` con `latencyHint: 'interactive'` y `resume()` en el primer gesto | Backend |
| 8 | Node 22 LTS, npm, `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | Backend |
| 9 | Convención de octava: **Do central = C4 = MIDI 60**; se muestra la octava ("Do4") | Música |
| 10 | Ortografía fija con sostenidos ("Do#4"); la ortografía será reemplazable para la Fase 4 | Música |
| 11 | Cada intento guarda los campos que usará la Fase 5 (ver abajo) | Música |
| 12 | Teclado del PC solo para desarrollo, con mapa documentado; no es para practicar | Música/UI |
| 13 | Feedback con triple canal (color + icono + texto) y paleta apta para daltonismo | UI |
| 14 | Teclado SVG por rango MIDI (Fase 0: C3–C6), estados por mapa `nota → estado`, hueco libre encima para la cascada futura | UI |
| 15 | Colores como tokens CSS; tema claro/oscuro desde el inicio | UI |

## Reglas musicales de la fase

- **Nivel 1** (el único activo): teclas blancas Do4–Sol4 (MIDI 60, 62, 64, 65, 67), posición de cinco
  dedos de la mano derecha. Rango visible en pantalla. El pool es configurable para la Fase 1.
- Selección de nota: nunca la misma dos veces seguidas; `rng` con semilla inyectable.
- **Qué es un intento**: cada `note-on` evalúa la tecla pulsada; los `note-off` se ignoran;
  un `note-on` con velocity 0 cuenta como `note-off`. Si hay varias teclas a la vez, cada una
  es un intento independiente (documentado, simple y predecible).
- **Registro por intento**: `targetMidi`, `playedMidi`, `isCorrect`, `shownAt`, `playedAt`,
  `reactionMs`, `attemptIndexForTarget`, `firstTryCorrect`, `inputSource`, `noteNameMode`,
  `level`, `velocity`. Se guarda cada pulsación errónea.
- Resumen al final de cada ronda de 20 notas: nota más lenta y nota más fallada.
- En error se muestra qué se tocó y la distancia a la nota correcta ("Era Re, tocaste Mi").

## Reglas de interfaz de la fase

- Pantalla con tres regiones (objetivo arriba, hueco libre en medio, teclado abajo), aunque solo
  se use una.
- Una sola frase de instrucción ("Toca la nota iluminada"), botón Empezar, indicador de fuente
  de entrada (Piano MIDI / Teclado del PC) y contadores discretos.
- Una zona de estado fija, no modal: sin Web MIDI (recomendar Chrome/Edge; el teclado del PC sigue
  funcionando), permiso denegado (con "Reintentar"), sin dispositivo, desconexión (pausa sin
  perder progreso), sonido suspendido (botón "Activar sonido").
- Animación de 150–250 ms, desactivada con `prefers-reduced-motion`.
- Accesibilidad: `aria-live="polite"`, teclas con `aria-label`, foco visible, todo operable con
  teclado; los atajos de la UI no chocan con las teclas que hacen de piano.
- Pantalla estrecha (< 600 px): 2 octavas centradas en la nota objetivo.

## Entregables

1. App que corre con `npm run dev` y pasa `npm run check` (typecheck + lint + deps + test + build).
2. Estructura `core/ adapters/ ui/` con reglas de dependencia verificadas por herramienta.
3. Modo "Toca esta nota" jugable con piano MIDI y con teclado del PC.
4. Pruebas del núcleo, de `MidiInput` con un `FakeMIDIAccess` y una de integración con `NoteInput` falso.
5. Medidas de latencia anotadas en este documento.
6. Convenciones (octava, ortografía, intento, mapa del teclado del PC) documentadas en `docs/`.
7. Prueba funcional en navegador real con video y capturas en `evidencias/fase-0/` (ver `docs/metodo.md`).

## Plan de trabajo (un commit por paso)

1. Scaffold: Vite, TS estricto, Vitest, ESLint, Prettier, `.nvmrc`, script `check`.
2. `dependency-cruiser` con reglas por carpeta y `no-circular`.
3. `Note`: nombres en ambas notaciones, referencias 21 = La0, 60 = C4, 69 = A4, 108 = C8 — con pruebas.
4. `Clock`, `NoteEvent`, `NoteInput`, `AudioOutput` (puertos) y `FakeClock`.
5. Selección de nota (`rng` inyectado) y `evaluate` + registro de intentos — con pruebas.
6. Caso de uso de la sesión + prueba de integración con `NoteInput` falso.
7. `ComputerKeyboardInput` y documentación de su mapa.
8. UI: teclado SVG parametrizado, tokens de color, tema claro/oscuro.
9. UI: nota objetivo, feedback triple canal, contadores, resumen de ronda, accesibilidad.
10. `MidiInput` con `requestMIDIAccess` inyectada, permisos y desconexión — con `FakeMIDIAccess`.
11. `WebAudioOutput` y estados de la zona de estado.
12. Panel de depuración `?debug` con latencia; verificación final y cierre de la fase.
13. Prueba funcional Playwright (Edge) con video y capturas; informe en `evidencias/fase-0/informe.md`.

## Verificación

| Qué | Cómo | Criterio de éxito |
|---|---|---|
| Nombres de nota | Vitest | 21 = A0, 60 = C4, 69 = A4, 108 = C8 en ambas notaciones; sostenidos fijados por prueba |
| Reglas del intento | Vitest | `note-off` ignorado; velocity 0 = off; la misma nota no sale dos veces seguidas con ningún `rng` |
| Registro | Vitest | Cada intento guarda todos los campos; errores previos quedan registrados |
| Integración | Sesión con `NoteInput` falso y `FakeClock` | Error no avanza; acierto sí; `reactionMs` exacto |
| `MidiInput` | `FakeMIDIAccess` | Cubre note-on, velocity 0, permiso denegado y desconexión |
| Arquitectura | `npm run lint:deps` | Falla si `core` importa de fuera o si `ui` importa de `adapters` |
| Calidad | `npm run check` | Sin errores |
| Experiencia real | Prueba manual con piano MIDI y con teclado del PC | Una ronda de 20 notas sin fallos; el resumen coincide con lo ocurrido |
| Latencia de pantalla | `?debug`: `at` del evento vs. `requestAnimationFrame` | p95 < 50 ms |
| Latencia de audio | `baseLatency` + `outputLatency`, informado aparte | Medida registrada (sin umbral aún) |
| Visual | Simulador de daltonismo; capturas a 360 px y 1280 px | El feedback se distingue sin depender del color |
| Funcional | `npm run e2e` (Playwright con Edge): ronda completa con teclado del PC, error y acierto | Pasa y deja video en `evidencias/fase-0/` |

## Riesgos

- Web MIDI solo en Chrome/Edge y exige permiso del usuario.
- Latencia del audio en Windows.
- Si no hay piano digital con USB-MIDI, la validación real quedaría limitada al teclado del PC.

## Revisión de expertos

Música/pedagogía, interfaz/experiencia y backend/infraestructura revisaron el borrador.
Sus propuestas aceptadas están en la tabla de decisiones. Se **difieren** a la Fase 1: desbloqueo
automático de niveles, ponderación por historial, niveles con mano izquierda y negras.
