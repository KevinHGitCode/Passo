import { FAR_CENTS, IN_TUNE_CENTS, NEAR_CENTS } from '@/core/domain/tuner';

/** El dial va de −50 a +50 cents repartidos en un arco de ±60°. */
const SWEEP_DEG = 60;
const CX = 160;
const CY = 190;
const RADIUS = 140;

const degOf = (cents: number): number => (cents / FAR_CENTS) * SWEEP_DEG;

/** Un punto del dial: `deg` 0 es arriba y crece hacia la derecha (aguda). */
function point(deg: number, radius: number): readonly [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + radius * Math.sin(rad), CY - radius * Math.cos(rad)];
}

const fixed = (value: number): string => value.toFixed(1);

function arc(fromCents: number, toCents: number): string {
  const [x1, y1] = point(degOf(fromCents), RADIUS);
  const [x2, y2] = point(degOf(toCents), RADIUS);
  return `M${fixed(x1)} ${fixed(y1)} A${RADIUS} ${RADIUS} 0 0 1 ${fixed(x2)} ${fixed(y2)}`;
}

const TICKS = Array.from({ length: 21 }, (_, index) => -FAR_CENTS + index * 5);
const LABELS = [-50, -25, 0, 25, 50];

function formatLabel(cents: number): string {
  if (cents === 0) return '0';
  return cents > 0 ? `+${cents}` : `−${Math.abs(cents)}`;
}

/**
 * El dial del afinador: un arco de −50 a +50 cents con la zona verde (afinada) en el centro, la ámbar («casi») a
 * los lados y un puntero que viaja por él. La nota va en el hueco del arco (la pone la pantalla). Es decorativo:
 * lo que se anuncia es el texto de debajo.
 */
export function TunerDial({
  cents,
  stale,
}: {
  readonly cents: number | null;
  readonly stale: boolean;
}) {
  const clamped = cents === null ? 0 : Math.max(-FAR_CENTS, Math.min(FAR_CENTS, cents));
  const angle = degOf(clamped);
  return (
    <svg
      className="tuner__dial"
      viewBox="0 0 320 200"
      aria-hidden="true"
      focusable="false"
      data-testid="tuner-needle"
    >
      <path className="tuner__arc tuner__arc--off" d={arc(-FAR_CENTS, FAR_CENTS)} />
      <path className="tuner__arc tuner__arc--near" d={arc(-NEAR_CENTS, NEAR_CENTS)} />
      <path className="tuner__arc tuner__arc--ok" d={arc(-IN_TUNE_CENTS, IN_TUNE_CENTS)} />
      {TICKS.map((value) => {
        const major = value % 25 === 0;
        const [x1, y1] = point(degOf(value), RADIUS - 12);
        const [x2, y2] = point(degOf(value), RADIUS - (major ? 26 : 19));
        return (
          <line
            key={value}
            className={major ? 'tuner__tick tuner__tick--major' : 'tuner__tick'}
            x1={fixed(x1)}
            y1={fixed(y1)}
            x2={fixed(x2)}
            y2={fixed(y2)}
          />
        );
      })}
      {LABELS.map((value) => {
        const [x, y] = point(degOf(value), RADIUS + 20);
        return (
          <text key={value} className="tuner__label" x={fixed(x)} y={fixed(y + 4)}>
            {formatLabel(value)}
          </text>
        );
      })}
      <g
        className="tuner__needle"
        style={{ transform: `rotate(${angle}deg)` }}
        data-angle={angle}
        data-idle={cents === null}
        data-stale={stale}
      >
        <line x1={CX} y1={CY - RADIUS + 34} x2={CX} y2={CY - RADIUS - 6} />
        <circle cx={CX} cy={CY - RADIUS} r="9" />
      </g>
    </svg>
  );
}
