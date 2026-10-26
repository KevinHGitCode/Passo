import type { HistoryEntry } from '@/core/domain/progress';
import { GOAL_ACCURACY } from '@/core/domain/scoring';

const WIDTH = 400;
const HEIGHT = 120;
/** La escala va de 60 % a 100 %: lo que está por debajo no cabe en la gráfica. */
const MIN_ACCURACY = 600;
const PAD = 10;

const yOf = (accuracy: number): number => {
  const clamped = Math.min(1000, Math.max(MIN_ACCURACY, accuracy));
  return PAD + (1 - (clamped - MIN_ACCURACY) / (1000 - MIN_ACCURACY)) * (HEIGHT - 2 * PAD);
};

/** Mínimo de lecciones para dibujar una curva. */
export const MIN_POINTS = 2;

/** La precisión de tus últimas lecciones, con la meta del 95 % como referencia. */
export function AccuracyChart({ entries }: { readonly entries: readonly HistoryEntry[] }) {
  if (entries.length < MIN_POINTS) {
    return (
      <p className="chart__empty" data-testid="chart-empty">
        Completa {MIN_POINTS} lecciones para ver cómo evoluciona tu precisión.
      </p>
    );
  }
  const step = (WIDTH - 2 * PAD) / (entries.length - 1);
  const points = entries.map((entry, index) => ({ x: PAD + index * step, y: yOf(entry.accuracy) }));
  const first = entries[0];
  const last = entries[entries.length - 1];
  const goalY = yOf(GOAL_ACCURACY * 1000);
  return (
    <figure className="chart" data-testid="chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="chart__svg"
        role="img"
        aria-label={`Tu precisión pasó de ${Math.round((first?.accuracy ?? 0) / 10)} % a ${Math.round(
          (last?.accuracy ?? 0) / 10,
        )} % en tus últimas ${entries.length} lecciones. La meta es ${Math.round(GOAL_ACCURACY * 100)} %.`}
      >
        <line className="chart__goal" x1={PAD} x2={WIDTH - PAD} y1={goalY} y2={goalY} />
        <polyline className="chart__line" points={points.map((p) => `${p.x},${p.y}`).join(' ')} />
        {points.map((point, index) => (
          <circle
            key={index}
            className={index === points.length - 1 ? 'chart__dot chart__dot--last' : 'chart__dot'}
            cx={point.x}
            cy={point.y}
            r={index === points.length - 1 ? 5 : 3}
          />
        ))}
      </svg>
      <figcaption className="chart__caption">
        <span>Hace {entries.length} lecciones</span>
        <span className="chart__goal-label">Meta {Math.round(GOAL_ACCURACY * 100)} %</span>
        <span>Última · {Math.round((last?.accuracy ?? 0) / 10)} %</span>
      </figcaption>
    </figure>
  );
}
