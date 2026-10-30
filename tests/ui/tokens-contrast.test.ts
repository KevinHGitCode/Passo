import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contraste (WCAG 2.x) de los pares de colores del juego, leídos de `tokens.css`: texto 4,5:1 y
 * elementos gráficos (iconos, bordes) 3:1, en el tema claro y en el oscuro.
 */

const CSS = readFileSync(join(process.cwd(), 'src/ui/styles/tokens.css'), 'utf8');

function block(selector: RegExp): Record<string, string> {
  const match = selector.exec(CSS);
  if (!match) throw new Error(`No encuentro el bloque ${selector}`);
  const tokens: Record<string, string> = {};
  for (const [, name, value] of (match[1] ?? '').matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    tokens[name as string] = (value as string).trim();
  }
  return tokens;
}

const LIGHT = block(/:root\s*\{([^}]*)\}/);
// El bloque comparte selector con `.stage-dark` (el escenario de tocar, siempre oscuro).
const DARK = block(/:root\[data-theme='oscuro'\],[^{]*\{([^}]*)\}/);
const DARK_AUTO = block(/:root:not\(\[data-theme='claro'\]\)\s*\{([^}]*)\}/);

const GUITAR_LIGHT = block(/:root\[data-instrument='guitarra'\]\s*\{([^}]*)\}/);
const GUITAR_DARK_AUTO = block(
  /:root\[data-instrument='guitarra'\]:not\(\[data-theme='claro'\]\)\s*\{([^}]*)\}/,
);
// Comparte bloque con el escenario oscuro de la guitarra.
const GUITAR_DARK = block(
  /:root\[data-instrument='guitarra'\]\[data-theme='oscuro'\],[^{]*\{([^}]*)\}/,
);

type Theme = Record<string, string>;
const themes: readonly [string, Theme][] = [
  ['claro', LIGHT],
  // El oscuro hereda del claro lo que no redefine.
  ['oscuro', { ...LIGHT, ...DARK }],
  ['oscuro automático', { ...LIGHT, ...DARK_AUTO }],
  ['guitarra · claro', { ...LIGHT, ...GUITAR_LIGHT }],
  ['guitarra · oscuro', { ...LIGHT, ...DARK, ...GUITAR_DARK }],
  ['guitarra · oscuro automático', { ...LIGHT, ...DARK_AUTO, ...GUITAR_DARK_AUTO }],
];

// El escenario de tocar es siempre oscuro, con el tema que sea: así se ve la guitarra en él.
const GUITAR_STAGE: Theme = { ...LIGHT, ...DARK, ...GUITAR_DARK };

function rgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? [...clean].map((c) => c + c).join('') : clean;
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const TEXT = 4.5;
const GRAPHIC = 3;

/** [texto o icono, fondo, mínimo, qué es] */
const PAIRS: readonly [string, string, number, string][] = [
  ['on-accent', 'accent', TEXT, 'botón primario'],
  ['accent-strong', 'surface', TEXT, 'botón secundario'],
  ['on-ok', 'ok', TEXT, 'botón de éxito'],
  ['node-locked-ink', 'node-locked', TEXT, 'botón o nodo bloqueado'],
  ['node-review-ink', 'node-review', GRAPHIC, 'icono del nodo de repaso'],
  ['node-exam-ink', 'node-exam', GRAPHIC, 'icono del nodo de prueba'],
  ['on-accent', 'accent', GRAPHIC, 'icono del nodo actual'],
  ['ok-strong', 'ok-soft', TEXT, 'barra de respuesta: acierto'],
  ['warn-strong', 'warn-soft', TEXT, 'barra de respuesta: casi'],
  ['err-strong', 'err-soft', TEXT, 'barra de respuesta: error'],
  ['surface', 'ok', GRAPHIC, 'icono de la barra de acierto'],
  ['surface', 'warn', GRAPHIC, 'icono de la barra de casi'],
  ['surface', 'err', GRAPHIC, 'icono de la barra de error'],
  ['star-off-edge', 'bg', GRAPHIC, 'contorno de la estrella vacía'],
  ['star-edge', 'bg', 1.8, 'contorno de la estrella ganada (el relleno ya la distingue)'],
  ['streak-strong', 'streak-soft', TEXT, 'ficha de la racha'],
  ['xp-strong', 'xp-soft', TEXT, 'ficha de la experiencia'],
  ['text-muted', 'bg', TEXT, 'texto secundario'],
  ['accent-strong', 'bg', TEXT, 'título del globo y enlaces'],
];

/** Los pares propios del acento por instrumento (el nombre del tema ya dice cuál). */
const INSTRUMENT_PAIRS: readonly [string, string, number, string][] = [
  [
    'accent-strong',
    'accent-soft',
    TEXT,
    'elemento actual de la navegación y ficha del instrumento',
  ],
  ['accent', 'bg', GRAPHIC, 'acento sobre el fondo'],
  ['accent-strong', 'surface', TEXT, 'texto de acento sobre la superficie'],
];

/** Dentro del escenario oscuro: el diapasón y sus marcas. */
const FRETBOARD_PAIRS: readonly [string, string, number, string][] = [
  ['key-target', 'fret-wood', GRAPHIC, 'la nota «Ahora» sobre la madera'],
  ['on-accent', 'key-target', TEXT, 'el dedo dentro de la nota «Ahora»'],
  ['fret-wire', 'fret-wood', GRAPHIC, 'los trastes sobre la madera'],
  ['fret-label', 'fret-wood', TEXT, 'los rótulos del diapasón'],
  ['fret-string', 'fret-wood', GRAPHIC, 'las cuerdas'],
  ['fret-heard', 'fret-wood', GRAPHIC, 'la marca de lo que se oye'],
  ['fret-nut', 'fret-wood', GRAPHIC, 'la cejuela'],
  ['text-muted', 'surface', TEXT, 'texto secundario en el escenario'],
];

describe('contraste de los tokens del juego', () => {
  for (const [themeName, theme] of themes) {
    describe(themeName, () => {
      it.each(PAIRS)('%s sobre %s ≥ %f (%s)', (foreground, background, minimum, what) => {
        const fg = theme[foreground];
        const bg = theme[background];
        expect(fg, `falta --${foreground}`).toBeDefined();
        expect(bg, `falta --${background}`).toBeDefined();
        expect(
          contrast(fg as string, bg as string),
          `${what}: ${fg} sobre ${bg}`,
        ).toBeGreaterThanOrEqual(minimum);
      });
    });
  }

  for (const [themeName, theme] of themes.filter(([name]) => name.startsWith('guitarra'))) {
    describe(`acento de ${themeName}`, () => {
      it.each(INSTRUMENT_PAIRS)(
        '%s sobre %s ≥ %f (%s)',
        (foreground, background, minimum, what) => {
          const fg = theme[foreground];
          const bg = theme[background];
          expect(fg, `falta --${foreground}`).toBeDefined();
          expect(bg, `falta --${background}`).toBeDefined();
          expect(
            contrast(fg as string, bg as string),
            `${what}: ${fg} sobre ${bg}`,
          ).toBeGreaterThanOrEqual(minimum);
        },
      );
    });
  }

  describe('el diapasón de la guitarra en el escenario oscuro', () => {
    it.each(FRETBOARD_PAIRS)('%s sobre %s ≥ %f (%s)', (foreground, background, minimum, what) => {
      const fg = GUITAR_STAGE[foreground];
      const bg = GUITAR_STAGE[background];
      expect(fg, `falta --${foreground}`).toBeDefined();
      expect(bg, `falta --${background}`).toBeDefined();
      expect(
        contrast(fg as string, bg as string),
        `${what}: ${fg} sobre ${bg}`,
      ).toBeGreaterThanOrEqual(minimum);
    });
  });

  it('los tres temas definen cada token por rol', () => {
    const roles = Object.keys(LIGHT).filter((name) =>
      /^(star|streak|xp|node|warn|on-ok|ok-depth|accent-depth|accent-soft|neutral-depth)/.test(
        name,
      ),
    );
    expect(roles.length).toBeGreaterThan(20);
    for (const name of roles) {
      // Cada rol del claro existe también en el oscuro (o es el mismo a propósito: radio, tamaños).
      const sameOnPurpose = ['radius-card', 'btn-depth-size', 'font-display'].includes(name);
      if (sameOnPurpose) continue;
      expect(DARK[name], `--${name} falta en data-theme=oscuro`).toBeDefined();
      expect(DARK_AUTO[name], `--${name} falta en el oscuro automático`).toBeDefined();
    }
  });
});
