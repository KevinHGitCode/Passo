# Guitarra · el afinador, a nivel de las apps profesionales

> Estado: **propuesta de diseño para aprobar** (Kevin). Revisada por los 3 expertos (música y acústica, interfaz, arquitectura e infraestructura). **No se construye nada hasta que Kevin la apruebe.**
> Maqueta (privada): https://claude.ai/artifact/2Zt8CqyUNnFNFR6cDKbVbL · 6 tableros: escritorio (cuerda grave, modo guiado, las 6 afinadas), móvil (dos estados) y estilos del medidor con los estados.

## Para qué

Hoy existe un afinador básico (`#/afinador`, de la etapa G1): eliges una cuerda, la tocas al aire y una regla dice «Grave · 22 cents», «Aguda» o «Afinada». Funciona, pero afinar **las seis cuerdas** es incómodo: no ves cuáles ya están, no oyes la nota que buscas y nada te acompaña de la 6 a la 1. Las apps profesionales resuelven justo eso. La propuesta es una **página de afinación completa** dentro de la sección de guitarra; sigue siendo `#/afinador`.

## Qué hacen las apps profesionales (y qué nos llevamos)

| Referente | Qué hace bien | Lo que tomamos |
|---|---|---|
| **GuitarTuna** (Yousician) | Modo *Auto* por omisión: detecta qué cuerda tocaste; tocar una cuerda en pantalla pasa a *Manual* (útil con cuerdas nuevas o muy desafinadas). Más de 100 afinaciones (las no estándar, de pago) | Conmutador Auto / Manual; tocar una cuerda = fijarla |
| **Fender Tune** | Clavijero (la cabeza de la guitarra) interactivo; al tocar una cuerda **se oye la nota de referencia**; afinaciones prefijadas | Clavijero como control principal; botón «Escuchar la nota» |
| **Peterson StroboTuner** | Un anillo de franjas que **se detiene** al afinar; 0,1 cent de precisión (dato del fabricante) | Solo la idea (variante C del medidor, para más adelante) |
| **TC Electronic PolyTune** | Un rasgueo muestra el estado de **las seis cuerdas** a la vez | El estado de las seis cuerdas siempre visible en el clavijero (no el rasgueo polifónico) |
| **Pedales y apps cromáticas** (Boss, Korg, Cleartune…) | Nota grande, ♭ y ♯ a los lados, aguja con zona verde, Hz y La = 440 ajustable | Nota grande, ♭ Grave / Aguda ♯, zona verde, Hz y La₄ ajustable |

Fuentes: [Yousician: cambiar afinaciones y opciones del afinador](https://support.yousician.com/hc/en-us/articles/360014233198-How-to-change-tunings-and-other-tuner-options), [Fender Tune en New Atlas](https://newatlas.com/fender-tune-guitar-app-ios/44817), [Peterson: cómo leer una pantalla estroboscópica](https://www.petersontuners.com/support/stroboSoft), [reseña del PolyTune en MusicRadar](https://www.musicradar.com/reviews/guitars/tc-electronic-polytune-233601). Las cifras de precisión son las del fabricante.

## La propuesta

**Una página, dos zonas** (acento violeta de guitarra; escritorio en dos columnas, móvil en una):

1. **El clavijero.** Un esquema de la cabeza de la guitarra vista de frente con las seis clavijas **3 + 3**: a la izquierda, de arriba abajo, 4 · 5 · 6; a la derecha, 3 · 2 · 1; la 6 y la 1 quedan junto a la cejuela. Es un esquema («fíate del número»): una eléctrica tipo Stratocaster tiene las seis clavijas en un lado y una de nailon las lleva en los costados. Son **seis botones de opción reales** (en el orden 6→1 para el teclado y el lector de pantalla) sobre un dibujo decorativo. Cada clavija dice su estado con **icono y texto, nunca solo color**: ○ sin afinar, anillo violeta «escuchando», ↑ «Grave: súbela», ↓ «Aguda: bájala», ✓ «Afinada», → «la siguiente» (solo en el modo guiado). La flecha dice **qué hacer**, no cómo está.
2. **El medidor.** La nota grande («Mi»), «Cuerda 6 · la más grave», **Meta 82,4 Hz · oigo 81,4 Hz**, una regla de −50 a +50 cents con zona verde de ±5 (borde sólido) y zona ámbar discontinua de ±5 a ±15 («casi»), ♭ Grave / Aguda ♯ sobre los extremos, los cents en cifras grandes (`tabular-nums`, ancho fijo) con su palabra («−22 cents · Grave») y una instrucción corta: «Aprieta un poco la clavija». La aguja lleva contorno oscuro de 2 px (contraste sobre el verde) y se mueve con `ease-out` de 120 ms, sin muelle.

**Acciones:** «Escuchar la nota», «Afinar las 6», y el conmutador **Manual | Auto (beta)** visible arriba (no escondido en un menú). Consejo fijo: «Afina siempre subiendo: si te pasas, afloja bien y vuelve a subir. Toca solo esa cuerda y silencia las demás.»

**Vocabulario único:** «Grave / Aguda» para el estado y flechas para la acción. «Floja / tirante» desaparece. En el dominio, el estado actual `casi` (dentro de ±5 pero aún sin 600 ms) pasa a llamarse `afinando`, porque «casi» pasa a ser la zona de ±5 a ±15.

### Modo guiado «Afinar las 6»

Empieza en la cuerda 6 y sigue hasta la 1 (de grave a aguda), con «Cuerda 3 de 6 · vuelta 1» y seis segmentos de avance. Al quedar afinada, la cuerda se queda **1,5 s** en verde y la guía pasa a la siguiente **sin mover el foco** (un solo anuncio: «Re afinada. Sigue la 3, Sol»). Al avanzar, **la regla espera un ataque nuevo**: la cuerda anterior sigue sonando 3–6 s y su segundo armónico caería en el rango de la siguiente. Controles: «Siguiente cuerda», «Pausar», «Salir de la guía» y `Esc`. Tocar una clavija salta a esa cuerda sin perder lo hecho. Durante la guía el conmutador Auto/Manual queda desactivado («la guía marca la cuerda»).

**Pantalla final:** «Las 6 cuerdas, afinadas» · «Al tensar unas, otras se mueven. Repasa las 6 una vez más.» · botones «Repasar las 6» (primario), «Ir a las lecciones» y «Seguir afinando»; tras la segunda vuelta: «Todo en su sitio» y «Ir a las lecciones» pasa a primario. La «segunda vuelta» no es una fase nueva: es un mensaje con botón. Comprobación por oído: pisar el traste 5 de la cuerda 6 y compararla con la 5 al aire.

**Estados recordados:** solo «Afinada ✓» y «Sin afinar». Un «Grave» viejo engañaría (al tensar otras cuerdas, esta se mueve), así que ✓ pasa a «Revisar» a los 5 minutos o al empezar la segunda vuelta. Nada se guarda en el navegador.

### Nota de referencia («Escuchar la nota»)

Síntesis aditiva con **la fundamental de más peso en armónicos** (los altavoces de portátil casi no dan nada por debajo de 150–200 Hz y el Mi2 son 82 Hz; el oído reconstruye la fundamental ausente si los armónicos son exactos). Cuerdas 6 y 5: h1–h6 con amplitudes ≈ 0,6 / 1 / 0,8 / 0,5 / 0,35 / 0,25; cuerdas 4 a 1: ≈ 1 / 0,5 / 0,3 / 0,2. Ataque de 5–10 ms, caída exponencial, 2,5 s en total con fade-out de 150 ms. **La medición se pausa** desde el inicio del tono hasta su fin + ~500 ms (latencia de salida, cola de la sala, ventana de 85 ms y asentamiento de 250 ms) y el medidor hace `reset()` al terminar: el micrófono del navegador va con `echoCancellation: false`, así que oiría el tono exacto de la meta y daría un falso «afinada». **Elegir una clavija nunca suena**; solo suena «Escuchar la nota».

### Móvil y accesibilidad

- **Móvil (320–390 px):** una columna: conmutador, clavijero compacto (~180 px de alto, también un esquema 3+3), medidor, y los dos botones **en el flujo** (no fijos: ya hay una barra inferior de ~72 px). Objetivos táctiles ≥ 44 px.
- **Lectores de pantalla:** las clavijas son un grupo de opciones con nombre («Cuerda 6, Mi, grave: súbela»); solo se anuncian cambios de estado estables 700 ms, nunca los cents; mientras suena la referencia se anuncia «Escuchando la nota…».
- **Teclado:** `1`–`6` eligen la cuerda **solo dentro del afinador** (WCAG 2.1.4, con `aria-keyshortcuts`; se ignoran con Ctrl/Alt/Meta); `R` toca la referencia; flechas solo dentro del grupo de opciones (←/↑ más grave, →/↓ más aguda). Sin `Espacio` global (choca con los botones y el desplazamiento).
- **Visual:** contraste comprobado en `tokens-contrast` con pares nuevos sobre el panel oscuro (violeta, verde, naranja, ámbar y el aro de las clavijas en `--text-muted`); `forced-colors` (zona y aguja con `Highlight` y bordes `CanvasText`, como el mástil); `prefers-reduced-motion`: sin destello ni pulso, el ✓ aparece fijo y la aguja salta.

### Consejos de afinación (un «Cómo afinar bien» plegable)

Afinar subiendo hacia la nota; si te pasas, aflojar **bien por debajo** y volver a subir (la cuerda se engancha en la cejuela); pulsar suave una sola cuerda y silenciar las demás (la 1 suena por simpatía con la 6); cuerdas nuevas: estirarlas y repetir 3 a 5 vueltas (el nailon, varios días); no pasarse de un tono en las cuerdas 1 y 2 (se rompen); micrófono a 20–30 cm de la boca de la guitarra y lejos del ventilador (una eléctrica sin amplificar casi no suena). **Sentido de giro de la clavija:** en una 3+3 suele ser antihorario para subir en 6·5·4 y horario en 3·2·1, pero hay que verificarlo con la guitarra de Kevin antes de escribirlo.

## Qué se queda igual y qué cambia

| Igual | Cambia |
|---|---|
| La medición actual (tono continuo, ±5 cents durante 600 ms, salida a ±8, 250 ms de asentamiento) | Pantalla nueva: clavijero y medidor |
| Ruta `#/afinador`, entrada «Afinador» de la navegación, micrófono que se apaga al salir | Estado por cuerda recordado, modo guiado y nota de referencia |
| Afinación estándar para las lecciones | La4 ajustable y otras afinaciones, en etapas posteriores |
| Ids de prueba `tuner-string-N`, `tuner-target`, `tuner-reading`, `tuner-live`, `tuner-mic`, `tuner-activate` | `aria-pressed` pasa a botones de opción (se migran los 3 sitios que lo usan, incluido el foco de `TunerScreen`) |

## Arquitectura (resumen de la revisión)

- **Dominio nuevo** (puro, con el tiempo por parámetro como `TunerTracker`): `tuning.ts` (tabla de afinaciones, **aparte** de `GUITAR_OPEN`, que usan las lecciones), `StringBoard` (estado por cuerda), `GuidedTuning` (máquina de estados 6→1, retención de 1,5 s, saltar, esperar ataque nuevo, vuelta 2) y, más adelante, `StringIdentifier` (Auto).
- **La4:** solo entra en `stringFrequency(string, { tuning, referenceHz })` y `searchRange`; `centsFrom` es una razón y no cambia; `midiToFrequency` ya acepta `referenceHz`. Retrocompatible con los valores por omisión.
- **Tono de referencia:** puerto nuevo `ToneOutput` (`playTone(hz, ms, onEnd)`, `stop()`), no `AudioOutput` (`noteOn(Midi)` es entero y suena a piano), implementado por `WebAudioOutput` compartiendo su contexto. Quien pausa es `TunerService`: ignora las lecturas con `at < mutedUntil`; `close()` detiene el tono.
- **`TunerService`:** el snapshot crece (`strings`, `mode`, `guided`, `referenceHz`); `mode` es un único campo (`manual | guiado | auto`) y los Hz medidos **no** van en el snapshot (se derivan de los cents redondeados); el clavijero va en `React.memo`.
- **Compatibilidad:** **no se sube `PREFERENCES_VERSION`** (borraría las preferencias). Como mucho se guarda un campo opcional `tunerReferenceHz` (y hay que actualizar `samePreferences`). El modo no se guarda. Nada nuevo en `localStorage`.
- **Pruebas:** dominio (`StringBoard`, `GuidedTuning`, La4 432/442), integración con `FakePitch`/`FakeClock`/`FakeTone` (recorrido 6→1 completo, lecturas ignoradas durante el tono y 400 ms después, la cuerda anterior sonando al avanzar), UI (migración de `guitar-screens.test.tsx`, ~20 referencias, y `shell.test.tsx`), contraste y `forced-colors`; e2e con el micrófono simulado: 2 cuerdas del modo guiado (las 6 serían ~25 s y frágiles; las 6 van en integración). `tuner-service.test` pasa su `toEqual` del snapshot a `toMatchObject`.

## Auto (fuera de esta entrega)

Es la parte arriesgada y depende de los pasos 37–49 de `docs/validacion-microfono.md`, aún sin hacer con la guitarra real. La revisión acústica pide, cuando se construya: asignar solo a ≤ ±100 cents de una cuerda (entre 100 y 200, «no estoy seguro»); **ventana de 8192 muestras** (con 4096 el lóbulo de ±23 Hz mezcla el Mi3 con el Re3); gana **la cuerda más grave con la plantilla h1–h4 completa** (los pares peligrosos son 6↔2, 6↔1 y 5↔1: el Si3 es el 3.er armónico del Mi2, y el Mi4 el 4.º del Mi2 y el 3.º del La2); veto por energía en f/2 y 2f/3; fijar tras ~0,45 s, mantener 2 s o hasta el silencio y cambiar solo con un ataque nuevo; `PitchReading` gana `share?`. En el modo guiado se usaría solo como **aviso** («esa suena como la 5, toca la 6»). Metas: 0 errores con confianza y ≥ 90 % de aciertos con micrófono plano; «no estoy seguro» es aceptable con un micrófono que recorta graves. Se entrega detrás de `?auto` y **Manual es siempre el modo por omisión** hasta validar con la guitarra de Kevin.

## Tolerancias

±5 cents durante 600 ms es una buena meta de consumo (un oído entrenado distingue 5–10 cents; pisar el traste ya sube varios). Se añade la zona «casi» de ±5 a ±15. Hay un sesgo de inarmonicidad en las cuerdas gruesas (el tono sigue parciales altos: +3 a +9 cents en el caso extremo de `guitarra-1.md`); se afinará refinando con los parciales 1 a 3 en las cuerdas 5 y 6. `PITCH_MIN_FUNDAMENTAL` = 0,2 equivale a −14 dB: un Mi2 real con micrófono de portátil podría quedar por debajo y decir «sin sonido»; hay que registrar la fundamental por cuerda en la validación.

## Decisiones para Kevin

1. **Estilo del medidor:** **A · regla** (recomendada: se lee igual en móvil y escritorio y no depende del color), B · esfera, C · estroboscópico (el más fino y el más caro).
2. **Auto:** fuera de esta entrega y detrás de `?auto` más adelante (recomendado), o dentro desde el principio.
3. **Nota de referencia:** sí (recomendado).
4. **Tu guitarra:** ¿qué clavijas tiene? **3 + 3** (acústica, clásica, Les Paul…) o las seis en un lado (Stratocaster)? El esquema del clavijero se dibuja 3 + 3; si la tuya es distinta, se añade una segunda variante.
5. **Otras afinaciones** (Re bajo, medio tono abajo, DADGAD, Sol abierto) y **La₄ ajustable:** etapas posteriores.
6. **Sonido de «afinada»:** destello visual siempre; un tono suave opcional, apagado por omisión (¿lo quieres?).

## Orden de trabajo propuesto (un commit por paso; `npm run check` verde y entregable en cada uno)

1. **Dominio:** `tuning`, `StringBoard`, La4 en `stringFrequency`/`searchRange`, renombre `casi → afinando` y campos nuevos del snapshot, con la pantalla vieja intacta.
2. **Clavijero y medidor (Manual)**, conservando los ids `tuner-*`; accesibilidad, claro/oscuro, móvil y contraste. **Publicable.**
3. **Nota de referencia:** `ToneOutput`, adaptador, pausa de la medición y botón. **Publicable.**
4. **Modo guiado:** dominio, servicio y pantalla final. **Publicable.**
5. **La4 ajustable** (y, si se quiere, una afinación más).
6. **Auto** detrás de `?auto`, e2e en Edge con video y capturas, revisión final de los expertos, documentación y pasos nuevos en `docs/validacion-microfono.md`.

Manual y guiado salen sin Auto. Se corta de esta entrega: Auto, el tono de «afinada» y cualquier otra afinación.

## Riesgos

- **Auto** puede equivocarse con las cuerdas graves (octava y armónicos); por eso va al final, detrás de una bandera y con salida segura a Manual. Un falso positivo cuesta más que un «no sé».
- Abrir salida de audio con el micrófono encendido puede cambiar el enrutado o el volumen en iOS y Android; no está probado. Con un contexto suspendido `playTone` retrasa su `onEnd`.
- La referencia sale por los altavoces del portátil: poco grave. Se compensa con armónicos y se dice «úsala como guía, no como medida».
- Todo se prueba con guitarra **sintética**; los umbrales hay que confirmarlos con la guitarra real (pasos 37–49 de `docs/validacion-microfono.md`, aún pendientes).
- El coste por fotograma del rango amplio de Auto es una estimación sin medir: medir con `performance.now()` en `?debug` en un móvil medio antes de optimizar.
