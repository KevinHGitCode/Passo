# Informe de la prueba funcional — Fase 2 (ajustes, terceras y acordes, manos y notas que caen)

- **Fecha:** 2026-10-25
- **Navegador:** Microsoft Edge (instalado en el equipo), sobre la versión compilada.
- **Cómo repetirla:** `npm run e2e` (compila, levanta la app y ejecuta las 37 pruebas de las Fases 0, 1 y 2, regrabando video y capturas; las de las fases cerradas se restauran con `git checkout -- evidencias/fase-0 evidencias/fase-1`).
- **Resultado:** **37 de 37 pruebas pasan, 3 de 3 corridas seguidas** (3,1–3,2 min cada una). `npm run check` pasa: lint con reglas de privacidad y de almacenamiento, dependencias entre capas (65 módulos, 0 violaciones), formato, **645 pruebas unitarias y de integración** y compilación.
- **Verificación final por tres expertos** (música y acústica, interfaz y accesibilidad, backend y arquitectura): sus hallazgos se corrigieron antes de regenerar esta evidencia (ver «Lo que se encontró»).

## Qué se probó (e2e, `tests/e2e/fase-2.spec.ts`)

| Prueba | Qué comprueba | Evidencia |
|---|---|---|
| Terceras: ronda completa con el teclado del PC | Avance parcial («Casi · Falta…»), nota de más (error al instante, «Sobró…»), completar tras el error, 12 terceras, resumen que nombra el objetivo | `terceras-ronda-completa.webm`, capturas 01–05 |
| Soltar una tecla quita la nota | Tocar las notas una tras otra, soltando, no es una tercera | — |
| Acordes mano derecha | Nombre del acorde, dedos 1-3-5, dos de tres notas = falta una (no es error), un acorde mal armado cuenta un solo error | `acordes-mano-derecha.webm`, capturas 06–08 |
| Acordes mano izquierda | Dedos 5-3-1 con la fila `Z X C V B N M`, ronda completa | captura 09 |
| Notación americana | El acorde se llama «C major» | captura 10 |
| Preferencias | Se recuerdan al recargar (notación, ayuda, tema); migra el tema antiguo; `?modo=` no se guarda; sin almacenamiento la app sigue | captura 11 |
| Entradas exclusivas | El micrófono no se enciende solo (0 llamadas a `getUserMedia` hasta pulsar «Activar»); con teclado del PC o piano MIDI elegidos no aparece el micrófono ni se pide permiso | `entrada-teclado-del-pc.webm`, captura 12 |
| Panel de ajustes (engranaje) | Elegir entrada y ejercicio, pausa de la ronda, `Ctrl+,` y `Esc`, foco que vuelve al engranaje, cambiar a MIDI/micrófono en vivo, recordar lo elegido, modal en móvil | `ajustes-engranaje.webm`, capturas 13–18 |
| Cascada y manos | Cada bloque cae sobre su tecla y cada dedo queda bajo ella (**≤ 0,5 px**), la cola avanza con transición CSS, la mano izquierda con el 5 a la izquierda, modo notas, móvil de 375 px sin desplazamiento horizontal | `cascada-y-manos.webm`, capturas 19–21 y 27 |
| Acordes por micrófono (BETA) | Activar «Oír varias notas a la vez»; terceras y acordes de tres notas con el micrófono simulado; falta una nota = «Casi»; nota de más dudosa (no error); `?debug` deja `window.__passoChords`; sin la beta siguen bloqueados | `terceras-microfono-beta.webm`, capturas 22–26 |
| Estabilidad visual | El teclado queda en la misma posición en **20 estados** (notas, terceras, acordes mano derecha e izquierda; bienvenida, ronda, parcial, error, ajustes abiertos y resumen) a **1280×800 y 1366×650** | `estabilidad-visual-1280x800.json`, `estabilidad-visual-1366x650.json` |
| Poca altura | A 1366×650 la página entera cabe sin desplazarse, con teclado del PC y con micrófono; la mano queda visible | — |

## Medidas

| Medida | Resultado | Criterio |
|---|---|---|
| Alineación bloque–tecla y dedo–tecla (navegador real) | ≤ 0,5 px, en acordes, terceras, notas, mano derecha, izquierda y móvil | ≤ 0,5 px ✅ |
| Posición del teclado entre estados | variación **0,000 px** en ambos tamaños (20 estados cada uno) | ≤ 1 px ✅ |
| Octava del «Mi» (matriz sintética: 10 notas × 5 espectros × 2 filtros) | ≥ 95 % correctas, ≤ 2 % de error de octava; 0 conversiones falsas en notas normales | ✅ |
| Verificador de acordes (banco sintético) | ≥ 95 % de los acordes buenos; ≤ 3 % de las notas ausentes se cuelan; **0 de 8** vecinas y 0 de 8 octavas abajo se dan por buenas | ✅ |
| Coste del verificador | ≈ 5–6 ms por ataque (medido por el experto de backend); 0,09 ms por fragmento en reposo | sin riesgo para el hilo principal ✅ |

## Lo que se encontró y corrigió gracias a esta prueba y a los expertos

- **Música y acústica (el más importante):** un semitono vecino se daba por la nota esperada (por la fuga de la ventana de análisis: tocar Fa–Sol cuando se pedía Mi–Sol contaba), y el mismo acorde una octava más grave pasaba con un altavoz sin graves. Se corrigió exigiendo que la nota domine sobre sus vecinas, mirando el 3.er y 5.º parcial de la octava inferior, descontando lo que ya sonaba antes del ataque y dejando que un acorde se complete añadiendo la nota que faltaba con las otras todavía sonando.
- **Fallo real hallado por una prueba intermitente (1 de 5):** tras un hueco de audio el oyente de acordes se reiniciaba y el primer bloque, sin línea base, tomaba por un ataque un acorde que ya sonaba. Se corrigió y se cubrió con una prueba de regresión (comprobada: falla sin el arreglo).
- **Backend:** el puente preferencias↔sesión era de dos sentidos y «Restablecer» podía devolver valores viejos: ahora es de un solo sentido. Reconfigurar o reanudar con la ronda en pausa por una entrada perdida respeta esa pausa. Varios detalles del oyente (extras antes que las esperadas, no medir durante la calibración, registro configurable y entregado como copia) y un puerto aparte para el registro de depuración.
- **Interfaz:** el foco salía del panel modal con Mayús+Tab desde el título; «Casi» usaba el mismo icono que «No te oí bien»; faltaban leyendas (dedos 1–5, lo punteado) y la bienvenida de terceras decía «sin saltarte ninguna»; contraste de los dedos sin usar y de la tecla objetivo; el aviso de pausa salía sin ronda; a 1366×650 la página desbordaba por abajo (≈ 23 px con micrófono).
- Decisiones del plan que se ajustaron al construir (error de acorde al instante, chips en la cabecera, cascada dentro del mismo SVG): `docs/fases/fase-2.md`.

## Límites de esta evidencia (honestos)

- **No hay piano real ni micrófono real.** Todo lo de los acordes por micrófono se probó con audio sintético y con un micrófono simulado (un flujo real de audio de Web Audio con notas tipo piano). El altavoz del Yamaha, la sala y el micrófono del portátil pueden pedir ajustar los umbrales: la guía para validarlo es `docs/validacion-microfono.md` (pasos 15–29). La beta está **apagada por defecto**.
- En graves (< 250 Hz) los acordes por micrófono solo comprueban que suenan y no distinguen bien la octava ni los semitonos vecinos (límite conocido; el plan B es el arpegio).
- Con el Mi4 todavía sonando más de 700 ms, un Mi5 real podría leerse como Mi4 (límite conocido de la corrección de octava). Un acorde totalmente equivocado (ninguna nota esperada ni de más clara) no da ningún mensaje.
- A 1366×650 el teclado se reduce para que quepa con la cascada y la mano (los nombres de los bloques miden ≈ 10 px); a 1024×600 o con zoom del 125 % la parte baja queda bajo el pliegue. Si es el tamaño real del portátil de Kevin, el siguiente paso es poner el objetivo y el mensaje en dos columnas en pantallas bajas.
- En móvil de 375 px la mano queda bajo el pliegue (el teclado completo en teléfono sigue archivado a petición de Kevin).
- Las capturas son en tema oscuro; el tema claro se comprueba con las pruebas unitarias y los contrastes calculados, no con capturas.
