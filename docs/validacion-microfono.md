# Validación de la escucha activa con el Yamaha E263

Las pruebas automáticas usan un **micrófono simulado** (audio sintético tipo piano). Prueban la lógica
y la tubería completa, pero **no la acústica real**: altavoces pequeños, micrófono del portátil,
reverberación de la habitación, filtros de Windows. Esta lista es para que Kevin lo valide con el
instrumento. Anota lo que pase; con esos datos se ajustan los umbrales.

## 1. Preparar el piano y el equipo

| Qué | Valor recomendado |
|---|---|
| Voz | **Grand Piano** sola. Sin Dual, Split, Harmony, Arpeggio, acompañamiento, metrónomo ni demo |
| Reverb y Chorus | Al mínimo |
| Transpose | **0** |
| Tuning (afinación) | **440 Hz** |
| Volumen | Medio (50–70 %). Al máximo el altavoz pequeño distorsiona |
| Auriculares | **Ninguno enchufado en el piano** (silencian sus altavoces) |
| Portátil | A 30–60 cm del piano, frente a los altavoces, **no apoyado en la misma mesa** (vibración) |
| Micrófono | El interno del portátil (no Bluetooth: añade 150–300 ms) |
| Windows | Desactiva «Mejoras de audio» / «Voice Focus» / «Studio Effects» del micrófono y pon la ganancia entre 60 y 80 % |
| Entorno | Ventilador bajo, sin música ni conversación, notificaciones silenciadas, Edge en primer plano |

El Do central del Yamaha E263 (61 teclas) es el **tercer Do desde la izquierda**. En Passo es **Do4**.

## 2. Pasos (marca lo que funciona)

Abre `npm run dev` y la dirección que indique la consola, con `?debug` al final para ver el panel.

| # | Paso | Resultado esperado |
|---|---|---|
| 1 | Pulsa **Activar micrófono** y elige «Permitir» | El chip dice «Midiendo ruido…» y luego «Te escucho» |
| 2 | Guarda silencio 1 s; toca el **Do central** y déjalo sonar | «✓ Te oigo bien: Do4» y la tecla del teclado marcada con anillo violeta |
| 3 | Toca el Do central **10 veces** a suave, medio y fuerte, a 30, 60 y 100 cm | ≥ 95 % detectadas, **0 en otra octava** |
| 4 | Empieza una ronda y toca bien las 5 notas del nivel 1, varias rondas | ≥ 95 % de las notas, **0 «Incorrecto» cuando tocaste bien** |
| 5 | Toca la nota anterior aún pulsada y mantén 2–3 s | Sigue sin aparecer un error |
| 6 | **Cazafalsos**: habla («do re mi»), tararea, aplaude, golpea la mesa, teclea, deja sonar una notificación de Windows, pon música baja | **0 «Incorrecto»**. Pueden salir avisos («no distingo la nota»), pero ninguna nota |
| 7 | Toca 20 teclas vecinas equivocadas y 5 de otra octava | Las vecinas deben salir «Incorrecto»; las de otra octava, «No te oí bien… no cuenta como error» |
| 8 | Toca todo el registro C3–C6, y una díada de teclas vecinas | La nota fuerte o nada; nunca una nota «Incorrecto» inventada |
| 9 | La misma nota a 1 s, 600 ms y 400 ms; suelta una tecla larga | A ≥ 500 ms cada toque cuenta; al soltar no aparece una nota fantasma |
| 10 | En el piano: Transpose +1 y luego Tuning −30 cents | Avisos de «teclado transpuesto» y de afinación. **Devuélvelos a 0 / 440** |
| 11 | Silencia el micrófono en Windows durante unos segundos | Aviso «No llega sonido del micrófono» |
| 12 | Cambia de pestaña y vuelve | «Escucha en pausa» y luego se vuelve a medir el ruido |
| 13 | 10 minutos en silencio, y otros 10 con música baja de fondo | **0 notas** |
| 14 | Graba con el móvil, en cámara lenta, tecla → pantalla | Entre 200 y 300 ms es lo esperable |

En `?debug` el panel muestra, por ronda, cuántas notas salieron con confianza **alta** y **media**, cuántas
fueron **dudosas** y cuántos **ecos** se ignoraron. Anota esas cifras:

- Si casi todo sale «media», los errores reales casi nunca se corregirán: habrá que bajar los umbrales de confianza.
- Si casi todo sale «alta» y aparecen errores falsos de octava: habrá que endurecer la comprobación de subarmónicos.

## 3. Cierre

La fase se da por validada si: **≥ 95 %** de las notas del nivel 1 se detectan, **0 falsos errores**,
**0 errores de octava** entre Do4 y Sol4 y «alta» ≥ ~50 %. Si no, se ajustan los umbrales con tus datos.

## Qué reportar

- Modelo de portátil y navegador, y la distancia al piano.
- Qué pasos fallaron, con el texto exacto que mostró la app.
- Las cifras alta/media/dudosa/eco del panel `?debug` tras una ronda.
- Si el micrófono dice «Windows aplica filtros» (aviso de «Mejoras de audio»).
