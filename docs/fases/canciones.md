# Guitarra · canciones con indicaciones de tiempo

> Estado: **construida** (versión 1). Falta probarla con una guitarra real. Se hizo con el método corto: un cambio, sus pruebas y a probar.

## Qué es

Una sección **Canciones** en la navegación de guitarra (`#/canciones`, `#/cancion/<id>`). Cada canción es una lista de pasos (una **nota** con su cuerda y traste, o un **acorde** con su rasgueo) y lo que dura cada uno en pulsos. La app **espera a que toques cada paso** y mide cuánto tardaste en llegar a él frente a lo que tocaba al tempo: dice «Va bien: a tiempo», «Un poco lento en esta nota (+0,4 s)» o «El cambio de acorde tardó demasiado (+2,4 s)». No hay un reloj que corra solo: el tiempo cuenta desde tu primer sonido y cada paso lo marca tu propio ataque.

- **Velocidad:** Lento (50 %), Medio (75 %) o Normal, que se elige antes de empezar y cambia el tiempo esperado.
- **Barra de tiempo ideal:** se llena en lo que debería tardar el paso y pasa a ámbar si te pasas.
- **Cada paso queda marcado** (✓ a tiempo, ↑ rápido, ↓ lento, ↓↓ muy lento) y al final hay un resumen con lo que más costó y, si hace falta, la sugerencia de ir más despacio.
- **Ritmo:** «a tiempo» es llegar dentro del 25 % (mínimo 250 ms) de lo esperado; «lento» hasta un 75 % más (mínimo 700 ms); más allá, «muy lento».

## Canciones incluidas

| Canción | Estilo | Notas |
|---|---|---|
| **Cumpleaños feliz** | Melodía | 25 notas en primera posición (cuerdas 1 a 3) |
| **Mi corazón encantado** | Melodía | Opening de Dragon Ball GT: la introducción y la primera frase (~50 notas, cuerdas 1 a 5) |
| **Estrellita, ¿dónde estás?** | Melodía | Canción popular; pasa por el traste 5 de la cuerda 1 |
| **De colores (acordes sencillos)** | Rasgueo | G, C y D7 con «↓ ↓↑ ↑↓↑»; es una progresión sencilla, no el arreglo exacto |

**«Mi corazón encantado»** sale de la tablatura de la comunidad de [LaCuerda](https://acordes.lacuerda.net/cesar_franco/mi_corazon_encantado.shtml) (transcrita por Alejandro Arnais), no de memoria: `stepsFromTab` lee las columnas de la tablatura (cuatro columnas = un pulso; las notas duran hasta la siguiente). Solo lleva la introducción y la primera frase, **sin letra** (es una canción con derechos). Esa tablatura no trae tempo ni compás: el tempo (80) y las duraciones son una estimación, así que si algo no suena como la canción, fíate de tu oído y dime qué corregir. Para agregar más canciones basta una lista de `note(...)`, `chord(...)` o una tablatura.

## Decisiones

- **Se espera a que toques** (no corre un metrónomo): con el micrófono es lo que se puede medir con seguridad, y es el modo espera que ya estaba previsto para las canciones.
- **Una nota se juzga por su nombre**, no por su octava (como en las lecciones de guitarra).
- **Perfil de escucha propio** (`'cancion'`): como el de guitarra pero una nota repetida se vuelve a oír a los 350 ms en vez de 1,2 s; si no, el «Sol Sol» de Cumpleaños feliz no se podría tocar a ritmo. Al salir vuelve el del instrumento.
- **En el rasgueo nunca se repite el mismo acorde dos pasos seguidos**: el micrófono no vería el segundo.
- La pantalla pide **«Activar micrófono»** y espera la medición del ruido de la sala antes de oír notas.

## Límites y deuda

- **Rasgueo: solo se mide el tiempo del cambio.** Cualquier ataque cuenta como llegar al acorde; **no se comprueba que el acorde sea el correcto** ni que el patrón de rasgueo sea el pedido (se muestra como guía).
- **Sin probar con guitarra real.** El perfil de 350 ms puede contar de más una cuerda que aún suena (un falso «lento» o un paso saltado); hay que confirmarlo y, si hace falta, subirlo.
- Los resultados **no se guardan** (ni mejores marcas ni estrellas por canción) y no se cuentan en el progreso.
- Pendientes: más estilos (arpegios, flamenco, jazz), tablatura de varias notas a la vez, modo con metrónomo que corra solo, compases y acordes con cejilla, «Mi corazón encantado».
