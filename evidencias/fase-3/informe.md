# Informe de evidencias · Fase 3 (Passo como juego)

Fecha: 2026-10-26 · Navegador: Edge (Playwright) · Compilación de producción (`npm run build` + `vite preview`).

## Resultado

| Qué | Resultado |
|---|---|
| `npm run check` (lint, dependencias, formato, pruebas, compilación) | **Pasa**: 62 archivos y **1052 pruebas** unitarias, de integración y de interfaz |
| Pruebas e2e en Edge | **49 de 49, tres corridas seguidas** (37 de las fases 0 a 2, con `#/practica`, y 12 nuevas de la fase 3) |
| Contraste AA de los tokens del juego (claro, oscuro y oscuro automático) | 58 pares comprobados, todos pasan (`tests/ui/tokens-contrast.test.ts`) |
| La lección cabe sin desplazarse | 1366×650, 1280×800 y 390×844, en sus tres estados (lista, en curso, resultado): `scrollHeight` = `clientHeight` |
| Móvil 390 px: sin desplazamiento horizontal | Camino, progreso y lección |
| Revisión final de los 3 expertos | Hecha; lo aplicado y lo aplazado, en `docs/fases/fase-3.md` |

## Lo que se probó (`tests/e2e/fase-3.spec.ts`)

1. **Primera visita:** camino sin datos (nodo 1 «Empieza aquí», racha «Empieza hoy», sin tarjeta de débiles), tema claro y oscuro.
2. **Lección de principio a fin (video):** presentación, 2 aciertos, un error, resultado con 3 estrellas y +125 XP, «Continuar», recargar y comprobar que sigue guardado.
3. **Salir a media lección:** la X pregunta, «Seguir» y `Esc` continúan, «Salir sin guardar» no guarda nada.
4. **Desbloqueo por avance** y «saltar con prueba».
5. **Terceras y acordes con micrófono sin la beta:** nodo bloqueado por la entrada, explicación y «Abrir ajustes».
6. **Lección con micrófono simulado (video):** activar, calibrar, empezar y tocar tres notas.
7. **Progreso:** mapa del teclado (fuerte, débil y sin datos), curva de precisión, cifras y borrado con confirmación.
8. **Practicar tus puntos débiles:** lección armada al momento, resultado sin estrellas y la mitad de experiencia.
9. **Práctica libre** a un clic y la marca «Passo» de vuelta al camino.
10. **Móvil 390×844** y **1366×650**.
11. **Datos dañados o de una versión nueva:** la app arranca, conserva una copia y no pisa lo ajeno.

## Archivos

- `01-leccion-completa.webm` · una lección de principio a fin.
- `02-leccion-microfono.webm` · una lección por micrófono simulado.
- `capturas/`: `01` camino primera visita (oscuro) · `02` (claro) · `03` lección lista · `04` en curso · `05` error · `06` resultado · `07` camino con progreso · `08` salir a media lección · `09` bloqueo por entrada · `10` y `11` micrófono · `12` progreso · `13` progreso vacío · `14` puntos débiles · `15` a `17` móvil · `18` a `20` 1366×650.

## Qué falta (lo hace Kevin)

Validar con el Yamaha real: `docs/validacion-microfono.md`, pasos 30–36 (lecciones por micrófono, notas graves de la unidad 2, metas de ritmo). Los límites conocidos y la deuda están al final de `docs/fases/fase-3.md`.
