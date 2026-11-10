# src/adapters — micrófono, MIDI, audio, teclado, almacenamiento

Implementan los puertos de `src/core/ports`. Solo conocen `core`; **no se importan entre sí** (cada subcarpeta
`audio/`, `keyboard/`, `microphone/`, `midi/`, `storage/`, `calendar/` está aislada) y `ui` no los importa:
la composición ocurre en `src/compose.ts`.

## Trampas

- **Micrófono (`microphone/`):** un solo flujo de audio alimenta varios consumidores (notas, acordes, rasgueo,
  afinador, monitor). Un cambio de umbral o de perfil (`piano`, `guitarra`, `cancion`) afecta a todos: corre las
  pruebas de `tests/adapters/` y de `tests/core/` relacionadas con audio.
- Las pruebas de audio pesadas (`note-tracker-*`, `chord-verifier`) agotan su tiempo de 5 s si el equipo está
  cargado: detén el servidor de desarrollo y Edge antes de correr el `check`.
- El micrófono **nunca arranca solo**: hace falta un gesto del usuario. No lo cambies.
- El almacenamiento (`localStorage`) vive solo en `storage/`; ahí sí se permite, en el resto el lint lo prohíbe.
- Sin red ni grabación: el lint lo bloquea (`MediaRecorder`, `fetch`…), y es un compromiso de privacidad.
- El Yamaha E263 de Kevin **no tiene USB-MIDI**: la entrada principal real es el micrófono.
- Todo lo validado fue con audio sintético; la validación con instrumento real está en
  `docs/validacion-microfono.md` y sigue pendiente.
