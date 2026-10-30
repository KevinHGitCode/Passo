# Informe de evidencias · Guitarra, etapa 1 (G1)

Fecha: 2026-10-30 · Navegador: Edge (Playwright) · Compilación de producción (`npm run build` + `vite preview`).

## Resultado

| Qué | Resultado |
|---|---|
| `npm run check` (lint, dependencias, formato, pruebas, compilación) | **Pasa**: 77 archivos y **1349 pruebas** unitarias, de integración y de interfaz; dependencias: 124 módulos, 0 violaciones |
| Pruebas e2e en Edge | **54 de 54, tres corridas seguidas** (49 de las fases 0 a 3 y 5 nuevas de guitarra) |
| Contraste AA de los tokens (guitarra: claro, oscuro, oscuro automático y diapasón en el escenario oscuro) | Todos los pares pasan (`tests/ui/tokens-contrast.test.ts`, 132+ comprobaciones) |
| Móvil 390×844 y 320–360 px | Sin desplazamiento horizontal; chip, hoja de instrumentos y diapasón dentro de la pantalla |
| Revisión final de los 3 expertos | Hecha; lo aplicado y lo aplazado, en `docs/fases/guitarra-1.md` |

## Lo que se probó (`tests/e2e/guitarra-1.spec.ts`)

1. **El chip de instrumento:** de piano a guitarra y de vuelta (con Esc), el instrumento se recuerda al recargar, el camino y la navegación cambian (Afinador en lugar de Práctica libre) y con el teclado del PC las lecciones de guitarra explican que necesitan el micrófono.
2. **Una lección por micrófono (simulado, video):** activar, calibrar, empezar; el mástil muestra la nota de ahora; el nombre va sin octava; **una nota tocada una octava más grave cuenta** (se juzga el nombre).
3. **El afinador (simulado, video):** activar, elegir la cuerda 6, un Mi 25 cents bajo dice «Grave», se calla y vuelve a «sin sonido», y el mismo Mi afinado dice «Afinada».
4. **El progreso de guitarra:** «Guitarra: 2 de 14 lecciones hechas», notas que más cuestan y media de precisión solo de guitarra; sin mapa de teclado.
5. **Móvil 390×844:** el chip va en la cabecera y abre una hoja con «Cerrar»; el camino y la lección de guitarra caben sin desplazarse de lado.

Más 49 pruebas de las fases 0 a 3, que siguen pasando con el chip y la navegación nuevos.

## Archivos

- `01-leccion-guitarra.webm` · una lección de guitarra por micrófono simulado.
- `02-afinador.webm` · el afinador: grave y luego afinada.
- `capturas/`: `01` chip y lista de instrumentos · `02` camino de guitarra · `03` a `05` lección (presentación, en curso, aciertos) · `06` a `08` afinador (activar, grave, afinada) · `09` progreso · `10` a `12` móvil (hoja de instrumentos, camino, lección).

## Qué no demuestra

Todo el audio es **sintético**: una guitarra Karplus-Strong (acero y nailon, con y sin pasa-altos) en las pruebas unitarias y tonos de piano generados con osciladores en las e2e. No sustituye a una guitarra real: el comportamiento con cuerdas graves, el rebote tras 1,2 s, la inarmonicidad, el ataque con la yema y los umbrales del afinador solo se confirman con la de Kevin.

## Qué falta (lo hace Kevin)

Validar con la guitarra real: `docs/validacion-microfono.md`, pasos 37–49 (afinador, las seis cuerdas, unidad 2, medio tono abajo, cambio de instrumento). Los límites y la deuda están al final de `docs/fases/guitarra-1.md`.
