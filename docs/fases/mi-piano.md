# Piano · «Mi piano» (parámetros del teclado)

> Estado: **construida** (versión 1). Falta probarla con el Yamaha real (pasos 63–66 de `docs/validacion-microfono.md`).

## Para qué

Kevin notó que al tocar sus teclas la app las escribía una octava más arriba (su «Mi3» salía como Mi4, el «Do3» como Do4, el «Re3» como Re4). Puede haber dos causas distintas y la sección **Mi teclado** y la prueba del micrófono de los **ajustes del piano** (`#/piano/ajustes`; antes era la pantalla «Mi piano», ya sin entrada propia en la navegación) las separa:

1. **El nombre.** Yamaha, Casio y otros llaman **Do3** al Do central (MIDI 60); la app (y la mayoría) lo llama **Do4**. Es solo una cuestión de nombre: el sonido es el mismo. Con la opción «Do3 (Yamaha…)» la app escribe todos los nombres con una octava menos (`setOctaveLabelShift`, que solo cambia el número que se muestra; las lecciones y el MIDI no cambian).
2. **El micrófono.** Con un altavoz de portátil, las notas graves pueden leerse una octava más arriba (el detector toma el 2.º armónico). La prueba lo comprueba nota a nota.

## Qué se configura

- **Cuántas teclas tiene** (25, 32, 37, 49, 61, 76 u 88) y por tanto sus octavas (61 = 5 octavas, de Do2 a Do7). Se guarda en las preferencias (`pianoKeys`, sin subir su versión) y fija qué teclas pide la prueba.
- **Cómo llama al Do central** (`pianoNaming`): Do4 (estándar) o Do3 (Yamaha y otros). Se ve un ejemplo («tu Do central se verá como Do3»).
- **Un teclado en pantalla** con las octavas elegidas (rotula los Do con la convención elegida y marca el Do central). Durante la prueba **resalta la tecla que toca**, marca las ya probadas (✓ o ✕) y dibuja con un aro la nota que oyó el micrófono; se queda a la vista aunque se baje por la pantalla.
- **El rango que oye el micrófono:** solo de Do3 a Do6 (nombres estándar, MIDI 48–84), el rango del rastreador de notas del piano: por debajo, el altavoz de un teclado casi no da graves; por encima, el sonido es demasiado agudo. La pantalla dice cuántas teclas de tu piano quedan fuera (en uno de 61 teclas, 12 graves y 12 agudas: para esas, usa MIDI). Esto explica que el Mi1 (Yamaha) y el Do5 (Yamaha) no se oyeran en la primera versión de la prueba: eran notas fuera de ese rango, y la prueba pedía hasta el Mi2 y el Do6.
- **La prueba del micrófono** (solo si el micrófono es una de las entradas): pide hasta 10 teclas repartidas por la parte del teclado que el micrófono puede oír, con su nombre en la convención elegida. Si en 6 s no oye la nota pedida, avisa y se puede saltar («no se oyó»). Compara lo que oye con lo pedido y clasifica cada una: ✓ bien, ↑ una octava más aguda, ↓ una octava más grave, ✗ otra nota. Si hay octavas de más o de menos, «Corregir esas notas» guarda la corrección (`micFixes`) y desde entonces las notas sueltas del micrófono se entregan en la octava en que se tocaron (`CorrectedNoteInput`: solo con el piano, solo en media octava alrededor de cada nota probada, y no mientras se espera un acorde, que verifica el micrófono por su cuenta). «Quitar la corrección» la borra.

## Límites

- La corrección solo cubre las notas que se probaron y su vecindad (media octava); si otra zona del teclado se equivoca, repite la prueba.
- El micrófono casi no lee el bajo de un teclado de 61 teclas (Mi2–Si2): la prueba lo deja saltar.
- La prueba escucha una sola nota por vez; los acordes con micrófono siguen con su verificador (beta).
