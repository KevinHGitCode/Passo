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
