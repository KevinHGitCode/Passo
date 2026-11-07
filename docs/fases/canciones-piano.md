# Piano · canciones con notas que caen

> Estado: **construida** (versión 1, solo «Golden Brown»). Falta probarla con tu piano real y, más adelante, la vista de partitura.

## Qué es

La sección **Canciones** también existe con el piano (`#/canciones`, `#/cancion/golden-brown`). Las notas **caen sobre el teclado** y llegan a su tecla justo cuando toca; cada barra mide lo que dura. Se puede tocar de dos maneras:

- **Esperar a que toques:** las notas bajan y se detienen en su tecla hasta que tocas la nota (o todas las del acorde, en cualquier orden); entonces la canción sigue.
- **A tempo:** tras una cuenta atrás las notas caen solas, sin detenerse; cada nota se da por buena si la tocas dentro de ±380 ms de su hora. Las que pasan sin tocar se marcan con ✕, las acertadas con ✓, y al final se dice cuántas salieron y cuánto te adelantas o te retrasas de media.

Hay tres velocidades (Lento 50 %, Medio 75 %, Normal). La mano izquierda (de Si3 hacia abajo) se ve en verde y la derecha en azul. La vista de partitura queda para más adelante.

## «Golden Brown» (The Stranglers)

Sale de una hoja de la comunidad en teclas del Virtual Piano ([playpianosheets.com](https://playpianosheets.com/sheets/golden-brown)), leída con `parseVirtualPiano` (la «1» es el Do2; lo de entre corchetes es un acorde). Lleva el motivo del clavecín (bajo y acordes en **La menor**) y el comienzo de la melodía; **no lleva letra** (es una canción con derechos).

## Límites

- **El ritmo es aproximado:** la hoja no trae duraciones, así que todos los pasos duran media negra (94 pulsos por minuto, el tempo que dan las fuentes). La canción real alterna compases de 3/4 y 4/4 y no suena igual de pareja.
- **Transportada:** la hoja está en La menor, no en la tonalidad original (Si♭ menor).
- **Con el micrófono**, los acordes se verifican con el verificador de acordes de piano (beta) y las notas por debajo del Do3 se aceptan en cualquier octava; el bajo (Mi2–La2) puede costar. Con MIDI o el teclado del PC es exacto.
- El resultado no se guarda ni cuenta para el progreso.
