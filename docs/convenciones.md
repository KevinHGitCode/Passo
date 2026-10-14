# Convenciones musicales y de entrada

## Notas

- Número MIDI 0–127. **Do central = C4 = MIDI 60** (notación científica). Referencias: 21 = La0, 69 = La4 (440 Hz), 108 = Do8.
- Se muestra siempre la octava: `Do4` (latina) o `C4` (americana). Algunos pianos y programas (Yamaha, algunos DAW) llaman `C3` al Do central; Passo no.
- Ortografía fija con **sostenidos** (`Do#4`). La ortografía según la tonalidad llegará con las partituras (Fase 4).

## Qué es un intento

- Cada `note-on` con velocidad > 0 evalúa la tecla pulsada y cuenta como un intento.
- Los `note-off` y los `note-on` con velocidad 0 se ignoran.
- Si se pulsan varias teclas a la vez, cada una es un intento independiente.
- Un error no avanza: la nota objetivo se mantiene hasta acertar.

## Teclado del PC como piano (solo desarrollo y pruebas)

Usa la posición física de las teclas (`event.code`), sin importar la distribución del teclado.

```
negras:     W E   T Y U   O P
blancas:   A S D F G H J K L ; '
notas:     C D E F G A B C D E F      (A = Do4 = MIDI 60)
```

El nivel 1 (Do4–Sol4) usa las teclas `A S D F G`. Las combinaciones con Ctrl, Alt o Meta se ignoran para no chocar con atajos del navegador.

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
