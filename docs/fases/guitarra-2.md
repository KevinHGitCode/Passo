# Guitarra · etapa 2 (G2): arpegios y acordes

> Estado: **borrador del plan**, para la revisión de los 3 expertos (música y acústica, interfaz, arquitectura e infraestructura).
> Maqueta aprobada por Kevin (tablero «Acordes y arpegios»): https://claude.ai/artifact/5wjCuKZcUuDNKauAgwQcr2 (privada).

## Para qué

En G1 la guitarra aprende **notas sueltas**. En G2 aprende a **armar acordes abiertos** y a tocarlos de dos maneras:

1. **Arpegio, nota a nota** (modo seguro): se toca el acorde cuerda por cuerda, de la grave a la aguda. Es el ejercicio que usa cualquier profesor para comprobar que el acorde está bien armado: si una cuerda suena apagada o con ruido, esa nota no sale. El micrófono oye bien una nota a la vez.
2. **Rasgueo, todo junto** (**beta**): se rasguea el acorde y la app comprueba que suenan sus notas. Igual que los acordes de piano por micrófono, es una beta que Kevin tiene que validar con su guitarra.

## Fuera de esta etapa

Tablatura (G3), canciones y compases (G4), acordes con cejilla (Fa, Si menor), acordes de séptima, ritmo de rasgueo con metrónomo, práctica libre de guitarra, otras afinaciones, otros instrumentos.

## Decisiones propuestas

**D1 · Secuencias en el motor.** Un arpegio es una **sucesión fija** de notas sueltas, no un sorteo. `RoundConfig.sequence?: boolean`: con él, el objetivo i de la ronda es `pool[i % pool.length]` (el conjunto trae el orden; puede repetir notas, p. ej. subir y bajar) y la cola «Después» sale de la misma sucesión. No hay modo nuevo (`ExerciseMode` sigue siendo `notas | terceras | acordes`): cada nota del arpegio se juzga como una nota suelta (con `octaveFree`, como en G1) y sus intentos siguen siendo del modo `notas`, así que el progreso por tecla (`g:<midi>`) no cambia. Cada nota del arpegio lleva `Target.chord` (qué acorde arma) y `Target.positions` (cuerda, traste, dedo).

**D2 · Catálogo de acordes con las formas declaradas** (`core/domain/guitar-chords.ts`, como `guitar-lessons.ts`: nada se infiere). Una `ChordShape`: id, raíz, calidad, nombre cifrado («C», «Em»), y por cuerda `{ fret | null (no se toca), finger }`. Acordes de la etapa (todos con trastes 0 a 3):

| Acorde | Cifrado | Cuerdas 6→1 (traste) | Dedos |
|---|---|---|---|
| Mi menor | Em | 0 2 2 0 0 0 | cuerda 5: 2 · cuerda 4: 3 |
| La menor | Am | × 0 2 2 1 0 | c4: 2 · c3: 3 · c2: 1 |
| Do mayor | C | × 3 2 0 1 0 | c5: 3 · c4: 2 · c2: 1 |
| Sol mayor | G | 3 2 0 0 0 3 | c6: 2 · c5: 1 · c1: 3 |
| Re mayor | D | × × 0 2 3 2 | c3: 1 · c2: 3 · c1: 2 |

Notas que suenan (grave → agudo): Em Mi2 Si2 Mi3 Sol3 Si3 Mi4 · Am La2 Mi3 La3 Do4 Mi4 · C Do3 Mi3 Sol3 Do4 Mi4 · G Sol2 Si2 Re3 Sol3 Si3 Sol4 · D Re3 La3 Re4 Fa♯4. El Re mayor es el primer acorde con un sostenido (Fa♯); el resto son notas naturales. Una función `chordTarget(shape)` arma el objetivo de varias notas (rasgueo) y `arpeggioOf(shape)` la sucesión de notas sueltas.

**D3 · Qué se juzga.** Arpegio: el **nombre** de cada nota (`octaveFree`, `maxWrongDistance 24`), igual que en G1; el eco/rebote de la cuerda anterior se resuelve como en G1. Rasgueo: las **clases de nota** del acorde (Mi, Sol, Si en Mi menor), no cuerda por cuerda. El límite se dice en la interfaz y en los docs: una cuerda de la que el micrófono no distingue la octava (Mi2 contra Mi3) o un acorde mal armado con las mismas notas pasan.

**D4 · Camino (dos unidades nuevas, ids `g4-…` y `g5-…`).**
- **G-U4 · Arpegios de acordes** (no opcional; pide G-U3): Mi menor → La menor → Do mayor → Sol mayor → Re mayor → repaso (los cinco, cambiando de acorde) → prueba. Cada acorde nuevo es una ronda de dos vueltas del arpegio (10–12 notas). Primero solo subir; el repaso y la prueba suben y bajan.
- **G-U5 · Acordes completos (beta, opcional; pide G-U4):** rasguear Em, Am, C, G, D de uno en uno y luego **cambiar** entre dos (Em↔Am, C↔G, D↔G…). Pide la beta «oír varias notas» (igual que los acordes de piano con micrófono): sin ella, el aviso de siempre.

**D5 · Interfaz.**
- `ChordDiagram` (SVG, **cuerda grave a la izquierda**, como en libros y vídeos): 6 cuerdas, 4 trastes, puntos con el número de dedo, «○» para cuerda al aire y «×» para la que no se toca. Va en la presentación de la lección (grande, con la leyenda de dedos) y, pequeño, durante la ronda.
- `Fretboard` (horizontal, cuerda aguda arriba, como la tablatura): admite **varias marcas «Ahora»** (rasgueo) y marca las cuerdas que no se tocan con «×». En el arpegio sigue marcando la nota de ahora y las siguientes.
- Banda de la sucesión («Mi › Si › Mi › Sol › Si › Mi») con la nota de ahora resaltada y las hechas atenuadas; texto, no solo color.
- Cabecera de la tarjeta: «Mi menor · se escribe Em».
- Mensajes: «¡Mi! Primera nota del acorde» / «Sigue Si: cuerda 5, traste 2, dedo 2 (medio)». En rasgueo: «Oigo Mi y Sol; falta Si» (por clases de nota).
- Todo con la ayuda activada igual que G1; con la ayuda apagada, solo la banda de nombres.

**D6 · Rasgueo por micrófono (beta).** El `ChordListener` del piano **no sirve** para la guitarra: verifica cada nota MIDI exacta y descarta una nota si la de una octava abajo suena (`maxSubharmonic`), pero un Mi menor tiene Mi2, Mi3 y Mi4 sonando a la vez. Se añade un verificador propio por **clases de nota** (`guitar-chord-verifier.ts`, función pura):
- ventana más larga (~350 ms tras el ataque, saltando ~50 ms de púa) porque las cuerdas graves (Mi2 = 82 Hz, Fa2 = 87 Hz) no se separan con 170 ms;
- para cada clase de nota esperada, evidencia = la mejor de sus octavas de guitarra (fundamental, o 2.º y 3.er armónico si la fundamental falta, como en el piano para los graves);
- «de más»: clases ajenas con energía clara que no sea armónico de las esperadas;
- el micrófono elige este verificador cuando el perfil de escucha es `guitarra` (ya existe `setProfile`).
Se valida solo con guitarra **sintética** (Karplus-Strong, varios timbres, pasa-altos de portátil): rasgueo completo, con una cuerda apagada, con el acorde equivocado, con una nota de más, con rasgueo lento y rápido.

**D7 · Progreso.** Sin subir `PROGRESS_VERSION`. Las notas de arpegio son claves `g:<midi>` como las de G1 (el Fa♯4 es nueva); el rasgueo guarda claves de varias notas `g:<midi>-<midi>…`. `KNOWN_KEYS` sale de los conjuntos de las lecciones. El repaso de puntos débiles de guitarra ignora (o no ofrece) lo que no tenga posición conocida.

**D8 · Perfil de escucha.** El arpegio usa el perfil de guitarra de G1 (re-ataque de la misma nota 1,2 s, `onsetRatio 1.8`, `refractoryMs 250`). Pregunta abierta: ¿bastan para un arpegio con cuerdas que siguen sonando bajo la nota nueva? Se mide con la guitarra sintética («una pulsación = un evento, en el orden pedido») antes de dar nada por bueno.

## Orden de trabajo (un commit por paso; `npm run check` verde en cada uno)

1. Este plan + revisión de los expertos.
2. Dominio: `RoundConfig.sequence` (primer objetivo, cola, siguiente) con pruebas; compatibilidad (sin `sequence` la sucesión de una semilla no cambia).
3. Catálogo de acordes (`guitar-chords.ts`), cifrado, `chordTarget` y `arpeggioOf`, con pruebas de que cada posición suena como su nota.
4. Camino: unidad G-U4 (arpegios), `Lesson` con sucesión, claves y repaso; pruebas de camino, estrellas y compatibilidad de datos guardados.
5. Prueba de audio: arpegios sintéticos (Karplus-Strong, cuerdas que siguen sonando) a través del rastreador: un evento por nota y en orden.
6. Interfaz del arpegio: `ChordDiagram`, banda de la sucesión, mensajes, presentación de la lección.
7. Verificador de rasgueo por clases de nota (dominio, con simulaciones).
8. Integración: el micrófono elige el verificador por perfil; sesión con rasgueo de guitarra.
9. Unidad G-U5 (rasgueo, beta) e interfaz de varias marcas «Ahora».
10. Pruebas e2e en Edge, capturas y video.
11. Revisión final de los expertos, correcciones y documentación (incluida la validación con guitarra real, pasos nuevos en `docs/validacion-microfono.md`).

## Verificación

`npm run check` (lint, dependencias, formato, pruebas, compilación) en cada paso; e2e en Edge con video y capturas en `evidencias/guitarra-2/`; las 54 pruebas e2e anteriores siguen pasando. Todo el audio es sintético: la validación con la guitarra real es de Kevin.

## Riesgos

- El rasgueo es una beta sobre un verificador nuevo y sin guitarra real: puede aceptar acordes incompletos o rechazar buenos. Se etiqueta como beta y se mide con simulaciones (tasa de aciertos y de falsas aceptaciones).
- En un arpegio las cuerdas anteriores siguen sonando: el rastreador de una voz puede dar eventos fantasma. Si la medición sintética no lo descarta, el arpegio se enseña con «silencia la cuerda anterior» y notas más espaciadas.
- La octava de las cuerdas graves no se distingue: se juzga el nombre (límite ya aceptado en G1).

## Revisión de los expertos (en curso, 2026-10-31)

Recibida: **interfaz**. Pendientes: música y acústica y arquitectura (los dos agentes se quedaron sin avance; hay que lanzarlos otra vez, con un alcance más estrecho). Lo que dijo el de interfaz y hay que aplicar al plan:

- **Un solo mapa vivo.** En las lecciones de acorde va la caja vertical (`ChordDiagram`, cuerda grave a la izquierda, 3 trastes, rótulos «6…1» con su nota, dentro de `.stage-dark` con tokens `--fret-*`) y el `Fretboard` horizontal no se dibuja; así D5 no necesita varias marcas «Ahora» ni «×» en `Fretboard`. Dos mapas no caben en móvil (el diapasón ya baja a ~9 px a 320 px). Alternativa solo desde 1100 px: caja estática a la izquierda y diapasón vivo a la derecha.
- **La instrucción de la nota va en una línea fija** bajo la banda («Mi · cuerda 4 · traste 2 · dedo 2 (el medio)»), no en la barra de respuesta (`useRecentFeedback` la quita a los 700 ms y se remonta con cada nota: serían 10–11 parpadeos por vuelta). La barra queda para error, «No te oí bien», «Casi» y fin de vuelta.
- **El rasgueo rompe cinco sitios que suponen una sola nota** (`liveMessage`, `LessonTarget`, `GuitarBoard`, `TargetName`, `feedbackMessage`): hace falta una variante de guitarra con fichas por clase de nota (Mi · Sol · Si) y que el verificador exponga las clases oídas.
- **Banda de la sucesión:** en menos de 600 px, ventana de 5 fichas («Nota 4 de 11»); notas repetidas con «cuerda N» (solo con ayuda); Hecha ✓ / Ahora ▼ borde grueso / Después discontinua; tokens existentes (`--ok-soft`, `--key-target`, `--accent-strong`), sin hex nuevos, con pares nuevos en `tokens-contrast`; `aria-current="step"`, sin zona viva.
- **Camino:** la unidad de rasgueo (beta, opcional) se ve siempre, con etiqueta «Beta»; sin la beta, nodos `bloqueada-entrada` con icono de micrófono y un texto de guitarra (hoy `REASON_INPUT` habla de piano MIDI y teclado del PC, y `iconOf` usa el icono de teclas).
- **Presentación:** sin paso nuevo; la caja grande con la leyenda y «Arma el acorde con calma»; el consejo del afinador pasa a ser un enlace; la tira del micrófono marca en la caja la cuerda oída (ensayo sin puntos). Heredado de G1: `MicPanel` dice «Passo escucha tu piano» y pide el Do central, y `hintText` dice «baja el volumen del piano» (hay que hacerlo por instrumento antes de este paso).
- **Re-ataque silencioso:** al subir y bajar se repite una nota a 2–4 notas y `sameNoteRetriggerMs 1200` ignora una pulsación normal sin avisar; avisar tras 4 s sin oír («Deja sonar cada cuerda un segundo») y decirlo en la presentación del repaso.
- **Quitar de la maqueta:** el selector Arpegio/Rasgueo dentro de la lección (el modo es la unidad), «Ver tablatura» (G3), la fila «Acordes de esta unidad». El cifrado «se escribe Em» solo en notación latina. `Fa♯` se dice «Fa sostenido» en las etiquetas; `.beta` a 12 px con `--warn`.
- Mensajes (arpegio y rasgueo, nunca «Incorrecto» en rasgueo) y nombres de las unidades («Acordes en arpegio», «Acordes completos · Beta»): ver el informe completo en la conversación; se pegan aquí al cerrar la revisión.
