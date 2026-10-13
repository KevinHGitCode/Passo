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
