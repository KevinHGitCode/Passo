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

## 4. Fase 2: la nota «Mi» (octava)

Contexto: con el Yamaha, el **Mi** tardaba en reconocerse (había que repetirlo o tocar otro Mi). La sospecha es
una confusión de octava: el micrófono oía el 2.º armónico (Mi5) en lugar de la nota. La Fase 2 corrige esto en el
seguimiento (si hay energía en f/2 **y** en 3f/2 que sobresalen del ruido, la nota es una octava más grave).

| # | Paso | Resultado esperado |
|---|---|---|
| 15 | Toca el **Mi4** (el Mi de la posición de cinco dedos) 20 veces a suave, medio y fuerte | Cada toque cuenta a la primera. Cero «No te oí bien… una octava más arriba» |
| 16 | Toca **Mi4, suéltalo y, 1 segundo después, Mi5** (el Mi de una octava arriba) | Salen las dos notas. El Mi5 **no** se convierte en Mi4. Repite **con el Mi4 todavía pulsado** (más de 1 s): si aquí el Mi5 sale como Mi4, anótalo (límite conocido) |
| 17 | Toca Mi3 y Sol3 (graves) | Pueden salir «No te oí bien»; lo importante es que no salga un error inventado |

Si el Mi sigue fallando, anota lo que muestra «Oigo:» cuando falla y las cifras alta/media/dudosa/eco de `?debug`.

## 5. Fase 2: terceras y acordes por micrófono (BETA)

Con teclado del PC o con un piano MIDI, terceras y acordes son exactos. Con el micrófono dependen de oír **varias
notas a la vez**, y eso solo se ha probado con audio sintético. Está **apagado por defecto**.

**Cómo activarlo:** engranaje **Ajustes** (o `Ctrl+,`) → *Cómo toco* → *Micrófono* → interruptor **«Oír varias notas a la
vez» (BETA)** → en *Qué practico* elige **Terceras** o **Acordes**. Abre la app con `?debug` al final de la dirección.

| # | Paso | Resultado esperado |
|---|---|---|
| 18 | Terceras, nivel 1 (Do–Mi, Re–Fa, Mi–Sol): toca cada tercera bien, 10 veces | ≥ 90 % cuentan (tardan ~0,3 s en aparecer tras tocar). **0 «Incorrecto»** cuando tocaste bien |
| 19 | Toca solo **una** de las dos notas | «Casi · Falta Mi4» (no es error) |
| 20 | **Vecinas**: toca Fa–Sol cuando se pide Mi–Sol, Re–Mi cuando se pide Re–Fa, Do–Re cuando se pide Si–Re (la tecla de al lado en lugar de la correcta) | **0 de 10 cuentan**. Debe faltar la nota correcta (y puede decir «Oí Fa4 de más»). Si una cuenta, anótala con su `snr`/`pico` |
| 21 | Acordes, nivel 1 (Do y Sol mayor): toca el acorde bien, 10 veces cada uno | ≥ 90 % cuentan |
| 22 | Toca el acorde **rodado** (una nota tras otra, unos 30 ms) | Cuenta si las tres suenan en la ventana |
| 23 | Toca el acorde una octava más abajo o más arriba | No debería contar (o dar «No te oí bien»); si cuenta, anótalo |
| 24 | Toca un acorde, espera 1 s y otro distinto | Cada uno se juzga solo; el anterior sigue sonando bajito pero no cuenta |
| 25 | **Cazafalsos**: habla, aplaude, golpea la mesa, deja música baja | **0 acordes dados por buenos** |
| 26 | Mano izquierda (acordes nivel 5 y terceras nivel 3): toca bien y luego una octava más arriba | Solo comprueba que suenan (en graves el altavoz casi no da la fundamental); puede aceptar otra octava y no distingue bien semitonos vecinos: es un límite conocido |
| 27 | **Octava abajo**: con un acorde de la mano derecha pedido (p. ej. Do–Mi–Sol), toca el mismo acorde una octava más grave | **0 de 10 cuentan** (en el piano del E263 el altavoz casi no da los graves: es el error más típico) |
| 28 | **Completar con las otras pulsadas**: pide Do–Mi–Sol, toca solo Do y Sol y, sin soltarlos, añade el Mi | Cuenta entero (no debe decir «Faltan Do · Sol» al añadir el Mi) |
| 29 | **Cambio rápido**: dos acordes seguidos, el segundo a los 400 ms y luego a los 800 ms del primero (sin esperar a que se apague) | A 800 ms cada uno cuenta; a 400 ms puede fallar: anota cuál |

**Datos para ajustar los umbrales.** Tras unos acordes, abre la consola de Edge (`F12` → pestaña *Console*) y escribe:

```js
copy(JSON.stringify(window.__passoChords))
```

y pégalo en un archivo. Cada medición trae, por nota esperada: `suena` (si la dio por presente), `snr` (cuánto sobresale del
ruido de la sala; para ser «presente» necesita ≥ 10), `pico` (cuánto sobresale de las notas vecinas; ≥ 3) y `subida` (cuánto
aumentó tras el ataque; ≥ 1,8 si ya sonaba algo ahí). Lo más útil: **las mediciones de los acordes bien tocados que fallaron**
(qué cifra se quedó corta) y **las de los que no debían contar**.

**Se da por validada la beta si:** ≥ 90 % de los acordes bien tocados cuentan, **0 %** de los de vecinas (paso 20) y de octava abajo
(paso 27) se dan por buenos, ≤ 5 % del resto de incorrectos o ruidos se dan por buenos y no hay «Incorrecto» cuando falta una nota.
`__passoChords` no guarda **qué tocaste** en cada medición: apunta, en orden, lo que tocaste en cada una (por ejemplo «1: Fa–Sol por Mi–Sol»). Si no, queda como beta (apagada por defecto) y el plan B es el **arpegio**
(las notas una tras otra, con el seguimiento de una sola voz, que ya funciona).

## Fase 3: las lecciones con el Yamaha

Con el micrófono elegido (Ajustes → Cómo toco). Abre `#/` y empieza por la unidad 1.

| # | Qué hacer | Qué debe pasar |
|---|---|---|
| 30 | Abre la primera lección («Do · Re · Mi»), pulsa «Activar micrófono», espera la calibración y «Empezar» | La lección no arranca sola; el panel del micrófono comprueba el Do central; la barra superior avanza con cada nota |
| 31 | Completa la lección tocando bien todo | Resultado con estrellas (sin fallos: 3 ★; la unidad 1 no pide ritmo), +XP y racha de 1 día; «Continuar» deja la siguiente lección como «actual» |
| 32 | Recarga la página | El camino conserva lo hecho (estrellas, XP, racha) |
| 33 | **Notas graves:** abre la unidad 2 (mano izquierda, Fa3–Do4) con el portátil cerca del altavoz y luego lejos | Anota qué notas no oye (Fa3, Sol3 y La3 son las más difíciles) y con qué distancia; debe aparecer el aviso «acerca el portátil al altavoz». La unidad 3 se abre sin terminar la 2 |
| 34 | **Ritmo:** haz una lección nueva de la unidad 2 o 3 a tu ritmo normal | Mira «Ritmo» en el resultado: si no llegas nunca a la meta (12–14 notas/min con × 0,9), anota tu cifra para ajustarla |
| 35 | Falla a propósito 3 de 10 (toca otra tecla) | Ronda de 70 %: 1 ★ y «Para la 3.ª estrella…»; con 4 fallos (60 %): «Todavía no: repítela» y «Repetir» como botón principal |
| 36 | Sal a media lección con la X | Pregunta; «Salir sin guardar» no cambia el progreso; al volver al camino el micrófono queda apagado |

Reporta, además de lo de la lista de abajo: **qué lecciones se te atascaron** y cuántos «No te oí bien» seguidos hubo.

## Guitarra (etapa 1): la guitarra real

Todo lo de la guitarra se probó con una guitarra **sintética** (Karplus-Strong) y con un micrófono simulado: no sustituye a la
tuya. Con el micrófono elegido (Ajustes → Cómo toco) y el chip del camino en **Guitarra**. Antes de empezar, anota **qué guitarra es**
(acústica de cuerdas de acero, de nailon o eléctrica con amplificador), a qué distancia pones el portátil y si el micrófono dice
«Windows aplica filtros».

| # | Qué hacer | Qué debe pasar |
|---|---|---|
| 37 | Abre **Afinador** (menú lateral o barra inferior), activa el micrófono, elige la cuerda 6 y toca el Mi grave al aire | Sale «Grave», «Aguda» o «Afinada» con los cents; compara con una app de afinar o un afinador de pinza |
| 38 | Afina las seis cuerdas (de una en una, eligiendo la cuerda en pantalla) | Cada una llega a «Afinada» tras sostenerla un momento; anota cuáles cuestan (la 5 y la 6 son las difíciles por ser graves) |
| 39 | Deja la cuerda 3 unos 60 cents floja a propósito y luego 120 | Dice «Grave» (no la confunde con otra nota) y, a partir de 50 cents, «Muy grave» |
| 40 | Abre la lección «Mi · Si · Sol» (unidad 1), activa el micrófono, «Empezar» y toca cada cuerda al aire | Cada pulsación cuenta **una sola vez** (sin «ataques fantasma» que salgan como error); avanza la barra |
| 41 | Haz «Re · La · Mi» (cuerdas 4, 5 y 6) | Anota qué cuerdas graves no oye o lee en otra nota. **Una nota oída en otra octava debe contar** (se juzga el nombre) |
| 42 | Toca la misma cuerda dos veces seguidas | La segunda vuelve a contar; si no, anota cuánto esperaste (el rebote se ignora 1,2 s) |
| 43 | Toca una cuerda y, sin silenciarla, la siguiente | Anota si sale «No te oí bien» o error; si pasa, apunta cuánto tarda en callarse la anterior |
| 44 | Unidad 2 («Mi · Fa · Sol»): pisa el traste 1 con el índice y el 3 con el anular | La nota oída es la pedida; anota ruidos de púa o de uña que cuenten como error |
| 45 | Baja la guitarra medio tono (todas las cuerdas) y vuelve a una lección | El afinador dice «Muy grave»; en la lección, tras unos fallos seguidos, aparece «Tus notas suenan 1 semitono más graves: puede que la guitarra esté desafinada. Abre el afinador» |
| 46 | Cambia a **Piano** con el chip y haz una lección de piano; vuelve a Guitarra | El micrófono vuelve a oír el piano igual que antes (sin recalibrar) y la guitarra vuelve a su perfil |
| 47 | Afinador con la cuerda 6 elegida: toca la cuerda 1 (aguda) | No debe decir «Afinada» ni dar una lectura (se descarta como otra cuerda); anota qué dice |
| 48 | Pulsa fuerte y mira el afinador los primeros instantes | La cuerda sube un poco al pulsarla: no debe decir «Aguda» enseguida (los primeros 250 ms no cuentan); anota si lo hace |
| 49 | Pulsa con la yema (ataque lento) el Mi grave y el La | Anota si la nota se pierde (nada se oye) o llega tarde |

Reporta además: **qué lecciones se atascaron** (cuerdas 5 y 6 sobre todo), cuántos «No te oí bien» seguidos hubo y la cifra
«Oigo:» de la tira de escucha en las cuerdas graves.

## Qué reportar

- Modelo de portátil y navegador, y la distancia al piano.
- Qué pasos fallaron, con el texto exacto que mostró la app.
- Las cifras alta/media/dudosa/eco del panel `?debug` tras una ronda.
- Si el micrófono dice «Windows aplica filtros» (aviso de «Mejoras de audio»).
- Para el Mi y los acordes: el resultado de `copy(JSON.stringify(window.__passoChords))` y lo que mostró «Oigo:».
