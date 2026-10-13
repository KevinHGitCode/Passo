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
