# Método de trabajo

## Reglas

1. **Una fase a la vez.** No se empieza una fase sin autorización explícita de Kevin.
2. Cada fase tiene su documento en `docs/fases/fase-N.md` con: objetivo, alcance, fuera de alcance,
   entregables, plan de trabajo, **verificación** y riesgos.
3. Cada fase se evalúa **antes** de construirla (plan) y **después** (resultado) por expertos.
4. **Solo local.** No hay remoto de GitHub; no se sube nada todavía.
5. **Un commit por cada cambio.** Mensajes en español, prefijo Conventional Commits, sin línea
   de coautoría ni firmas de herramienta. Este es el único repositorio donde se commitea.

## Expertos (subagentes)

Pocos y con función clara. Cada uno revisa el plan y luego el resultado desde su punto de vista.

| Experto | Función | Revisa sobre todo |
|---|---|---|
| Música y pedagogía | Que lo que se enseña y se califica sea musicalmente correcto y enseñe bien | Notación, dedos, tolerancia rítmica, progresión didáctica, algoritmo de práctica por tramos |
| Interfaz y experiencia | Que sea visual, clara y que el feedback sea inmediato | Teclado, colores, accesibilidad, latencia percibida, flujo de práctica |
| Backend e infraestructura | Que la arquitectura sea limpia, probable y escalable | Capas, puertos, pruebas, rendimiento y latencia de audio/MIDI, build, persistencia |

## Ciclo por fase

1. Borrador del plan (yo).
2. Revisión del plan por los tres expertos → ajustes.
3. Presentación a Kevin → **autorización**.
4. Construcción, con commits pequeños.
5. Verificación según el plan + revisión del resultado por los expertos.
6. Cierre: se marca la fase como completada y se pide autorización para la siguiente.

## Pruebas (dónde viven)

Carpeta `tests/` en la raíz, separada de `src/` y con subcarpetas que reflejan las capas:

| Carpeta | Contenido | Herramienta |
|---|---|---|
| `tests/core/` | Pruebas unitarias del dominio y los casos de uso (sin DOM) | Vitest (entorno `node`) |
| `tests/adapters/` | Adaptadores con falsos (`FakeMIDIAccess`, `FakeClock`) | Vitest |
| `tests/ui/` | Componentes React | Vitest + jsdom + Testing Library |
| `tests/integration/` | Sesión completa con entradas falsas | Vitest |
| `tests/e2e/` | Prueba funcional en navegador real (Edge instalado) con video | Playwright |
| `tests/fakes/` | Falsos compartidos (reloj, entrada de notas, MIDI) | — |

Comando único de verificación: `npm run check`. Prueba funcional con video: `npm run e2e`.

## Evidencias por fase

Al cerrar cada fase se ejecuta una **prueba funcional en navegador real** y se guarda el resultado:

```
evidencias/
  fase-0/
    video-funcional.webm   # grabación de la prueba funcional
    capturas/              # capturas clave (claro/oscuro, móvil, error, acierto)
    informe.md             # qué se probó, resultado, medidas y fecha
```

- La prueba funcional se escribe en Playwright (`tests/e2e/fase-N.spec.ts`) y se repite al cerrar
  cada fase siguiente para detectar regresiones.
- Las pruebas con piano real (Yamaha E263 por USB-MIDI) las valida Kevin aparte; hasta entonces la
  entrada es el teclado del PC.

## Video de la prueba funcional: ffmpeg

Playwright necesita su propio `ffmpeg` para grabar video. Dos opciones:

1. **Recomendada en una máquina nueva:** `npx playwright install ffmpeg` (descarga pequeña desde Playwright).
2. **Sin descargar nada** (lo que se hizo en este equipo): copiar un `ffmpeg.exe` completo ya instalado a
   `.playwright-cache/ffmpeg-1013/ffmpeg-win64.exe` (la carpeta está en `.gitignore`). `playwright.config.ts`
   la usa automáticamente si existe. El nombre de la carpeta (`1013`) cambia con la versión de Playwright: el error
   «Executable doesn't exist» de `npm run e2e` indica el nombre exacto.

Para ejecutar las pruebas sin grabar video: `E2E_VIDEO=off npm run e2e`.

## Regla de oro de las evidencias

Las capturas y los videos se **regeneran** siempre con `npm run e2e` justo antes de cerrar la fase, para que
coincidan con el código final. No se editan a mano.
