import { isBlackKey, noteName } from '@/core/domain/note';
import type { NotationMode } from '@/core/domain/note';
import { heatLevel, keyStat } from '@/core/domain/key-stats';
import type { HeatLevel, KeyHistory } from '@/core/domain/key-stats';

/** Las teclas que usan las lecciones: de Do3 a Mi5. */
const FROM = 48;
const TO = 76;
const KEY_WIDTH = 38;
const KEY_HEIGHT = 124;
const BLACK_WIDTH = 22;
const BLACK_HEIGHT = 74;

const LEVEL_TEXT: Readonly<Record<HeatLevel, string>> = {
  fuerte: '95 % o más',
  buena: '85–94 %',
  media: '80–84 %',
  debil: 'menos de 80 %',
  'sin-datos': 'sin datos',
};

const LEGEND: readonly HeatLevel[] = ['fuerte', 'buena', 'media', 'debil', 'sin-datos'];

interface WhiteKey {
  readonly midi: number;
  readonly x: number;
  readonly level: HeatLevel;
  readonly percent: number | null;
}

function whiteKeys(history: KeyHistory): WhiteKey[] {
  const keys: WhiteKey[] = [];
  for (let midi = FROM; midi <= TO; midi++) {
    if (isBlackKey(midi)) continue;
    const samples = history[String(midi)];
    const stat = samples ? keyStat(String(midi), samples) : null;
    const level = stat ? heatLevel(stat) : 'sin-datos';
    keys.push({
      midi,
      x: keys.length * KEY_WIDTH,
      level,
      percent: stat && level !== 'sin-datos' ? Math.round(stat.accuracy * 100) : null,
    });
  }
  return keys;
}

/**
 * El mapa de tu teclado: cada tecla blanca se pinta según cuánto aciertas a la primera. Los fallos
 * (menos de 70 %) llevan además rayas y todas las teclas con datos muestran su porcentaje, así no
 * depende solo del color. Debajo hay una lista equivalente para lectores de pantalla.
 */
export function KeyHeatmap({
  history,
  notation,
}: {
  readonly history: KeyHistory;
  readonly notation: NotationMode;
}) {
  const keys = whiteKeys(history);
  const width = keys.length * KEY_WIDTH;
  const withData = keys.filter((key) => key.percent !== null);
  const blacks: number[] = [];
  keys.forEach((key, index) => {
    // Hay tecla negra a la derecha de Do, Re, Fa, Sol y La (si hay otra blanca después).
    if ([0, 2, 5, 7, 9].includes(key.midi % 12) && index < keys.length - 1) {
      blacks.push((index + 1) * KEY_WIDTH - BLACK_WIDTH / 2);
    }
  });

  return (
    <figure className="heat" data-testid="heatmap">
      <svg
        viewBox={`0 0 ${width} ${KEY_HEIGHT + 22}`}
        className="heat__svg"
        role="img"
        aria-label="Mapa de tu teclado: cuánto aciertas a la primera en cada tecla. La lista de abajo da los mismos datos."
      >
        <defs>
          <pattern
            id="heat-hatch"
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="7" className="heat__hatch" />
          </pattern>
        </defs>
        {keys.map((key) => (
          <g key={key.midi} data-testid={`heat-${key.midi}`} data-level={key.level}>
            <rect
              className="heat__key"
              x={key.x + 1}
              y={0}
              width={KEY_WIDTH - 2}
              height={KEY_HEIGHT}
              rx={5}
            />
            {key.level === 'debil' ? (
              <rect
                x={key.x + 1}
                y={0}
                width={KEY_WIDTH - 2}
                height={KEY_HEIGHT}
                rx={5}
                fill="url(#heat-hatch)"
              />
            ) : null}
            {key.percent !== null ? (
              <text className="heat__percent" x={key.x + KEY_WIDTH / 2} y={KEY_HEIGHT - 12}>
                {key.percent}
              </text>
            ) : null}
            {key.midi % 12 === 0 || key.percent !== null ? (
              <text className="heat__name" x={key.x + KEY_WIDTH / 2} y={KEY_HEIGHT + 16}>
                {noteName(key.midi, notation)}
              </text>
            ) : null}
          </g>
        ))}
        {blacks.map((x) => (
          <rect
            key={x}
            className="heat__black"
            x={x}
            y={0}
            width={BLACK_WIDTH}
            height={BLACK_HEIGHT}
            rx={3}
          />
        ))}
      </svg>
      <figcaption className="heat__legend">
        {LEGEND.map((level) => (
          <span key={level} className="heat__legend-item" data-level={level}>
            <span className="heat__swatch" aria-hidden="true" />
            {LEVEL_TEXT[level]}
          </span>
        ))}
      </figcaption>
      <ul className="sr-only" aria-label="Aciertos a la primera por tecla" data-testid="heat-list">
        {withData.length === 0 ? (
          <li>Todavía no hay datos de ninguna tecla.</li>
        ) : (
          withData.map((key) => (
            <li key={key.midi}>
              {noteName(key.midi, notation)}: {key.percent} % ({LEVEL_TEXT[key.level]})
            </li>
          ))
        )}
      </ul>
    </figure>
  );
}
