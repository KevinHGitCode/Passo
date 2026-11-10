# src/ui — pantallas, estilos y rutas

React. No importa `adapters` (el lint y dependency-cruiser lo impiden) y no usa `localStorage`: todo llega por
props desde `src/compose.ts` / `src/main.tsx`. Los servicios se leen con `useSyncExternalStore(subscribe, getSnapshot)`.

## Antes de crear algo, mira si ya existe

| Necesidad | Usa | Dónde |
|---|---|---|
| Título + explicación + acciones de una pantalla | `PageHeader` | `shell/PageHeader.tsx` |
| «Activar micrófono» y sus estados (permiso, bloqueado, sin dispositivo) | `MicGate` | `listen/MicGate.tsx` |
| Aviso breve («Guardado», «Deshacer») | `showToast(...)` (el `Toaster` ya está montado) | `toast/toast.ts` |
| Sección de ajustes (tarjeta, fila, interruptor) | `SettingsCard`, `SettingRow`, `SwitchRow` | `settings/parts.tsx` |
| Botones 3D del juego, iconos | `GameButton`, `Icon` | `game/` |
| Ventana de confirmación | patrón de `ExitDialog` (`use-dialog-keys`, `role="dialog"`, foco en lo seguro) | `screens/` |

## Estilos

- **Nada de colores, radios, sombras ni duraciones sueltos**: todo sale de `styles/tokens.css`
  (colores por rol, `--radius*`, `--dur-*`, `--ease-*`, `--elev-*`, `--scrim*`, `--z-*`, `--page-max`).
  Un color nuevo se define como token con su par claro/oscuro (y el escenario `.stage-dark`).
- `styles/motion.css` (entradas de pantalla y de ventanas) e `styles/interaction.css` (hover/active, con `:where()`
  para no pesar) son globales: una pantalla nueva ya hereda la transición y la respuesta al pulsar.
- Solo animar `transform`, `opacity`, `filter` y colores; `prefers-reduced-motion` lo apaga todo en `base.css`.
- El acento por instrumento sale de `data-instrument` en `<html>` (azul piano, violeta guitarra): usa
  `var(--accent)`, no el valor.
- Capas con `--z-sticky` < `--z-nav` < `--z-overlay` < `--z-toast`. Una letra para toda la app (Nunito, `--font-display`).
- El ancho de contenido es `var(--page-max)`; el texto largo, `var(--page-text)`.

## Rutas y pantallas

- Rutas por hash en `router/routes.ts`: tipo `Route`, `parseRoute`, `hrefOf`, `TITLES`. Una ruta nueva se agrega en
  los cuatro. Los ajustes llevan instrumento (`#/piano/ajustes`, `#/guitarra/ajustes`).
- Cada pantalla pone `data-route-heading` en su `<h1>` (lo usa el foco y el lector de pantalla al navegar;
  `PageHeader` ya lo hace). El instrumento activo lo decide `instrument/active-instrument.ts`.
- La navegación está en `shell/GameNav.tsx`; el marco, en `shell/Shell.tsx` (`Screen` decide qué se ve).
- Ajustes: lo propio del piano y de la guitarra va separado; lo común (notación, tema) en `ViewCard`.

## Accesibilidad y pruebas

- Estados con **icono y texto**, no solo color. Objetivos táctiles ≥ 44 px. Al desaparecer el botón pulsado, el foco
  pasa al título.
- Los `data-testid` y los textos los usan las pruebas (`tests/ui`, `tests/e2e`): si renombras uno, búscalo con grep en
  `tests/` y actualízalo en el mismo cambio.
- Cualquier cambio visual se mira en 1280×800 **y** 375 px, sin desplazamiento horizontal.
