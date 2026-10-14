# Fase 2 — Ajustes, terceras y acordes, manos y notas que caen

Estado: **autorizada por Kevin; plan en revisión de expertos**.

## Qué pidió Kevin

1. Empezar ya con **terceras** y **acordes**.
2. Ver las **manos** (qué dedo toca qué tecla).
3. Ver las **notas cayendo** hacia el teclado.
4. **Personalizar** fácilmente desde un panel que se esconde (engranaje): elegir si se toca con el
   **teclado del computador**, con un **teclado MIDI** o con el **micrófono** (escucha activa), y otras preferencias.
5. Tener presente que la nota **Mi** tarda en reconocerse con su Yamaha (probable confusión de octava).

**Archivado para más adelante** (a petición de Kevin): teclado completo en pantalla de teléfono y selector
de dispositivo de micrófono. Ver `docs/archivado.md`.

## Objetivo

Que Kevin practique **terceras y acordes** viendo **qué dedos usar** y **cómo caen las notas** hacia su
tecla, elija en un **panel de ajustes** cómo quiere tocar (micrófono, MIDI o teclado del PC), y que la app
siga corrigiendo al instante.

## Alcance

- **A. Octava (el «Mi»):** si hay energía fuerte una octava por debajo de la altura detectada, se
  corrige hacia la octava inferior (hoy, un 2.º armónico fuerte hace oír «Mi5» en lugar de «Mi4»).
- **B. Panel de ajustes (engranaje):** panel lateral que se esconde. Entrada (micrófono / piano MIDI /
  teclado del PC), modo (notas / terceras / acordes), nivel, mano, notación, ayuda, dedos, notas que
  caen, tema. Se recuerdan en el navegador. Cambiar de entrada enciende una y apaga las otras.
- **C. Objetivos con varias notas:** el objetivo pasa a ser un conjunto de notas. Agregador de pulsaciones
  simultáneas (tolerancia para acordes «rodados»). Una nota de más es un error; las notas correctas que
  faltan no lo son.
- **D. Terceras y acordes (Do mayor):** terceras armónicas (7 intervalos) y acordes básicos
  (Do, Fa, Sol mayores; Re, Mi, La menores). Niveles progresivos.
- **E. Varias notas por micrófono:** verificación **dirigida**: la sesión le dice al micrófono qué notas
  espera y este comprueba, con análisis espectral, cuáles suenan (y si suena alguna de más).
- **F. Manos y dedos:** numeración 1–5 por mano y colores por mano; una mano fantasma sobre el teclado.
- **G. Notas que caen:** bloques que caen hacia su tecla; el objetivo actual espera en la línea del teclado
  hasta acertarse; se ven los siguientes.
- **H. Pruebas:** unitarias, integración, e2e con teclado del PC y micrófono simulado, video y capturas.

## Fuera de alcance

Teclado completo en móvil, selector de dispositivo de micrófono, modos espera/estricto como ajuste
(la cascada espera siempre), guardar progreso y estadísticas (solo se guardan preferencias), niveles
con negras, ritmo, canciones, motor adaptativo.

## Preguntas para los expertos

1. ¿Es viable **verificar** 2–3 notas simultáneas por micrófono de un teclado portátil con altavoz pequeño?
   ¿Con qué algoritmo y umbrales? ¿Cuánto esperar tras el ataque? ¿Qué cuenta como «nota de más»?
2. ¿Cómo dar **dedos** correctos en terceras y acordes, mano derecha e izquierda, y cómo dibujar las
   **manos** de forma clara sin saturar la pantalla?
3. ¿Cómo integrar la **cascada** con el espacio disponible (portátil de 650 px de alto) y el objetivo grande?
4. ¿Cómo diseñar el **panel de ajustes** (accesibilidad, foco, no tapar el teclado, persistencia) y la
   arquitectura de **entradas intercambiables** sin romper las capas?
5. ¿Cómo generalizar `evaluate`/`PracticeSession` a objetivos de varias notas sin romper lo existente?
