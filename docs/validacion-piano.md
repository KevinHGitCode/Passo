# Validación con el piano real (Yamaha E263)

La Fase 0 se probó con el teclado del PC y con un piano MIDI simulado. Esta lista es para que
Kevin valide con el instrumento. Si algo falla, anota qué mensaje muestra la zona de estado.

## Antes de empezar

1. El piano tiene una entrada **USB TO HOST** (comprueba en el manual de tu modelo). Conéctalo al PC con un cable USB.
2. En Windows 11 suele funcionar solo; si no aparece, instala el controlador *Yamaha USB-MIDI Driver* desde la web de Yamaha.
3. Usa **Chrome o Edge** (Safari no admite Web MIDI). Cierra otros programas de música que usen el piano: en Windows solo uno a la vez puede abrir el puerto MIDI.
4. Enciende el piano **antes** de abrir Passo (o conéctalo después: debe detectarse en caliente).

## Pasos (marca lo que funciona)

| # | Paso | Resultado esperado |
|---|---|---|
| 1 | Abre Passo con el piano conectado y permite «Dispositivos MIDI» | El chip muestra «Piano: …» en verde |
| 2 | Pulsa **Empezar** y toca la nota que se pide | La tecla correcta avanza a la siguiente nota |
| 3 | Toca una nota incorrecta | «Incorrecto» + «Era …, tocaste … · una tecla a la derecha» y la tecla correcta marcada |
| 4 | Comprueba que el Do central de tu piano (rotulado C3 o C4) es el **Do4** de Passo | La app pide Do4 y es la misma tecla |
| 5 | Mantén una tecla pulsada y desconecta el cable | Aviso naranja «Piano desconectado», ronda en pausa, sin notas pegadas |
| 6 | Vuelve a conectar el cable | La ronda sigue donde estaba |
| 7 | Toca varias notas seguidas rápido | No hay retardo perceptible en la pantalla |
| 8 | Escucha: ¿suena doble (eco)? | No: con MIDI la app no sintetiza, solo suena tu piano |
| 9 | Abre `http://localhost:5173/?debug` con `npm run dev` y toca unas notas | «Evento→pantalla» p95 por debajo de 50 ms |

## Si el piano suena con «Local Control» desactivado

Algunos pianos, con *Local Control* apagado, no suenan por sí mismos. Passo no sintetiza sonido
para MIDI en esta fase; una opción «sonido de la app con MIDI» queda para la Fase 1.

## Qué reportar

- Nombre exacto que muestra el chip del piano.
- El mensaje de la zona de estado si no conecta (bloqueado, sin dispositivo, no admitido).
- Si el Do central coincide con el Do4 de Passo.
