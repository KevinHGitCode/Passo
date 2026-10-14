import { isBlackKey } from '@/core/domain/note';
import type { Midi } from '@/core/domain/note';
import { BLACK_HEIGHT, layoutKeys, WHITE_HEIGHT } from './geometry';
import type { KeyLayout } from './geometry';
import './piano-keyboard.css';

/** Estado visual de una tecla. Es un mapa nota → estado para poder crecer (dedos, siguiente…). */
export interface KeyVisual {
  /** Es la nota que hay que tocar (resaltada si la ayuda está activada). */
  readonly target?: boolean;
  /** La tecla está pulsada ahora mismo. */
  readonly pressed?: boolean;
  /** Es la nota que el micrófono oye (una inferencia, no una pulsación). */
  readonly heard?: boolean;
  /** Resultado de la última pulsación: acierto, error, o la tecla que era la correcta. */
  readonly feedback?: 'correct' | 'wrong' | 'expected';
}

export interface PianoKeyboardProps {
  /** Primera y última nota dibujadas (deben ser teclas blancas). */
  readonly from: Midi;
  readonly to: Midi;
  readonly visuals?: ReadonlyMap<Midi, KeyVisual> | undefined;
  /** Texto de la tecla (nombre de la nota); `undefined` = sin texto. */
  readonly labelFor?: ((midi: Midi) => string | undefined) | undefined;
  /** Recorta la vista a una parte del teclado (pantallas estrechas). */
  readonly viewWindow?: { readonly from: Midi; readonly to: Midi } | undefined;
  readonly ariaLabel: string;
}

const BADGES = { correct: '✓', wrong: '✕', expected: '↓' } as const;
const CORNER = 4;

/** Contorno de tecla con las esquinas inferiores redondeadas. */
function keyPath(x: number, width: number, height: number): string {
  const r = CORNER;
  return [
    `M${x} 0`,
    `H${x + width}`,
    `V${height - r}`,
    `Q${x + width} ${height} ${x + width - r} ${height}`,
    `H${x + r}`,
    `Q${x} ${height} ${x} ${height - r}`,
    'Z',
  ].join(' ');
}

function classNames(key: KeyLayout, visual: KeyVisual | undefined): string {
  const classes = ['key', key.isBlack ? 'key--black' : 'key--white'];
  if (visual?.target) classes.push('key--target');
  if (visual?.pressed) classes.push('key--pressed');
  if (visual?.heard) classes.push('key--heard');
  if (visual?.feedback) classes.push(`key--${visual.feedback}`);
  return classes.join(' ');
}

export function PianoKeyboard({
  from,
  to,
  visuals,
  labelFor,
  viewWindow,
  ariaLabel,
}: PianoKeyboardProps) {
  const layout = layoutKeys(from, to);
  const ordered = [
    ...layout.keys.filter((key) => !key.isBlack),
    ...layout.keys.filter((key) => key.isBlack),
  ];

  let viewX = 0;
  let viewWidth = layout.width;
  if (viewWindow) {
    const first = layout.keys.find((key) => !key.isBlack && key.midi >= viewWindow.from);
    const lastWhite = [...layout.keys]
      .reverse()
      .find((key) => !key.isBlack && key.midi <= viewWindow.to);
    if (first && lastWhite) {
      viewX = first.x;
      viewWidth = lastWhite.x + lastWhite.width - first.x;
    }
  }

  return (
    <svg
      className="piano"
      viewBox={`${viewX} -2 ${viewWidth} ${WHITE_HEIGHT + 6}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
      data-testid="piano"
    >
      {ordered.map((key) => {
        const visual = visuals?.get(key.midi);
        const label = labelFor?.(key.midi);
        const centerX = key.x + key.width / 2;
        const badge = visual?.feedback ? BADGES[visual.feedback] : undefined;
        return (
          <g
            key={key.midi}
            className={classNames(key, visual)}
            data-midi={key.midi}
            data-black={isBlackKey(key.midi) ? 'true' : 'false'}
            aria-hidden="true"
          >
            <path d={keyPath(key.x, key.width, key.height)} className="key__shape" />
            {visual?.heard && (
              <circle
                cx={centerX}
                cy={key.isBlack ? BLACK_HEIGHT - 42 : WHITE_HEIGHT - 28}
                r={4.5}
                className="key__heard-dot"
              />
            )}
            {badge && (
              <text
                x={centerX}
                y={key.isBlack ? BLACK_HEIGHT - 26 : WHITE_HEIGHT - 44}
                className="key__badge"
                textAnchor="middle"
              >
                {badge}
              </text>
            )}
            {label && (
              <text
                x={centerX}
                y={key.isBlack ? BLACK_HEIGHT - 10 : WHITE_HEIGHT - 12}
                className="key__label"
                textAnchor="middle"
                fontSize={key.isBlack ? 6.5 : 8.5}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
      {/* Anillos de nota oída: se dibujan al final para que ninguna tecla los tape. */}
      {ordered.map((key) =>
        visuals?.get(key.midi)?.heard ? (
          <g key={`heard-${key.midi}`} aria-hidden="true" pointerEvents="none">
            <path d={keyPath(key.x, key.width, key.height)} className="key__heard-halo" />
            <path d={keyPath(key.x, key.width, key.height)} className="key__heard-ring" />
          </g>
        ) : null,
      )}
    </svg>
  );
}
