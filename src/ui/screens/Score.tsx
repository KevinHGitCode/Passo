import { layoutBars } from '@/core/domain/score';
import type { ScoreBar, ScoreEvent, StaffPitch } from '@/core/domain/score';
import type { Song } from '@/core/domain/songs';
import { useIsNarrow } from '../practice/hooks';

/** La partitura de la canción: pentagrama con sus compases y figuras, y debajo la tablatura. */

const STEP = 5; // medio espacio del pentagrama
const BOTTOM_LINE = 30; // posición diatónica del Mi4 (la línea de abajo en clave de Sol)
const STAFF_TOP = 62;
const STAFF_BOTTOM = STAFF_TOP + 8 * STEP;
const TAB_TOP = STAFF_BOTTOM + 64;
const TAB_GAP = 12;
const ROW_HEIGHT = TAB_TOP + 5 * TAB_GAP + 46;
const LEFT = 78;
const STEM = 34;

/** La altura (y) de una posición diatónica. */
const yOf = (diatonic: number): number => STAFF_BOTTOM - (diatonic - BOTTOM_LINE) * STEP;

interface Row {
  readonly bars: readonly ScoreBar[];
}

/** Los compases se reparten en renglones; cuántos caben depende de lo apretados que estén y del ancho. */
function rowsOf(bars: readonly ScoreBar[], perRow: number): Row[] {
  const rows: Row[] = [];
  for (let start = 0; start < bars.length; start += perRow) {
    rows.push({ bars: bars.slice(start, start + perRow) });
  }
  return rows;
}

const MIN_GAP = 27;

/** Dónde va cada figura dentro de su compás: según el pulso, pero sin pisarse con la de al lado. */
function positionsOf(bar: ScoreBar, span: number, barWidth: number): number[] {
  const first = 30;
  const last = barWidth - 16;
  const xs = bar.events.map((event) => first + (event.beat / span) * (barWidth - 44));
  for (let index = 1; index < xs.length; index++) {
    xs[index] = Math.max(xs[index] as number, (xs[index - 1] as number) + MIN_GAP);
  }
  const end = xs[xs.length - 1] ?? first;
  if (end > last && end > first) {
    return xs.map((x) => first + ((x - first) * (last - first)) / (end - first));
  }
  return xs;
}

function Head({
  pitch,
  x,
  event,
}: {
  readonly pitch: StaffPitch;
  readonly x: number;
  readonly event: ScoreEvent;
}) {
  const y = yOf(pitch.diatonic);
  const open = event.value.head === 'abierta';
  const whole = !event.value.stem;
  const ledgers: number[] = [];
  if (pitch.diatonic <= BOTTOM_LINE - 2) {
    for (let d = BOTTOM_LINE - 2; d >= pitch.diatonic; d -= 2) ledgers.push(d);
  } else if (pitch.diatonic >= BOTTOM_LINE + 10) {
    for (let d = BOTTOM_LINE + 10; d <= pitch.diatonic; d += 2) ledgers.push(d);
  }
  const onLine = pitch.diatonic % 2 === BOTTOM_LINE % 2;
  return (
    <>
      {ledgers.map((d) => (
        <line key={d} x1={x - 11} x2={x + 11} y1={yOf(d)} y2={yOf(d)} className="score__ledger" />
      ))}
      {pitch.sharp ? (
        <text x={x - 20} y={y + 5} className="score__accidental">
          ♯
        </text>
      ) : null}
      <ellipse
        cx={x}
        cy={y}
        rx={whole ? 7.6 : 6.4}
        ry={whole ? 5 : 4.6}
        transform={whole ? undefined : `rotate(-20 ${x} ${y})`}
        className="score__head"
        data-open={open}
      />
      {event.value.dotted ? (
        <circle cx={x + 11} cy={onLine ? y - 4 : y} r={1.9} className="score__dot" />
      ) : null}
    </>
  );
}

function Event({
  event,
  x,
  state,
}: {
  readonly event: ScoreEvent;
  readonly x: number;
  readonly state: 'hecho' | 'actual' | 'pendiente';
}) {
  const ys = event.pitches.map((pitch) => yOf(pitch.diatonic));
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const average =
    event.pitches.reduce((sum, pitch) => sum + pitch.diatonic, 0) / event.pitches.length;
  // La plica sube si la nota está por debajo de la línea de en medio y baja si está por encima.
  const up = average < BOTTOM_LINE + 4;
  const stemX = up ? x + 6 : x - 6;
  const stemFrom = up ? bottom : top;
  const stemTo = up ? top - STEM : bottom + STEM;
  const flagDirection = up ? 1 : -1;
  return (
    <g className="score__event" data-state={state} data-testid={`score-event-${event.index}`}>
      {state === 'actual' ? (
        <rect
          x={x - 17}
          y={STAFF_TOP - 46}
          width={34}
          height={TAB_TOP + 5 * TAB_GAP - STAFF_TOP + 62}
          rx={10}
          className="score__halo"
        />
      ) : null}
      {event.chord ? (
        <text x={x} y={STAFF_TOP - 28} textAnchor="middle" className="score__chord">
          {event.chord}
        </text>
      ) : null}
      {event.value.stem ? (
        <line x1={stemX} x2={stemX} y1={stemFrom} y2={stemTo} className="score__stem" />
      ) : null}
      {Array.from({ length: event.value.flags }, (_, flag) => {
        const startY = stemTo + flag * 8 * flagDirection;
        return (
          <path
            key={flag}
            d={`M ${stemX} ${startY} q ${9} ${6 * flagDirection} ${6} ${15 * flagDirection}`}
            className="score__flag"
          />
        );
      })}
      {event.pitches.map((pitch, index) => (
        <Head key={index} pitch={pitch} x={x} event={event} />
      ))}
      {event.tab.map((mark) => (
        <g key={mark.string}>
          <rect
            x={x - 8}
            y={TAB_TOP + (mark.string - 1) * TAB_GAP - 7}
            width={16}
            height={14}
            rx={3}
            className="score__tab-bg"
          />
          <text
            x={x}
            y={TAB_TOP + (mark.string - 1) * TAB_GAP + 4.5}
            textAnchor="middle"
            className="score__fret"
          >
            {mark.fret}
          </text>
        </g>
      ))}
      {event.strum ? (
        <text x={x} y={TAB_TOP + 5 * TAB_GAP + 32} textAnchor="middle" className="score__strum">
          {event.strum}
        </text>
      ) : null}
    </g>
  );
}

function SystemRow({
  row,
  width,
  barWidth,
  first,
  last,
  beatsPerBar,
  current,
  title,
}: {
  readonly row: Row;
  readonly width: number;
  readonly barWidth: number;
  readonly first: boolean;
  readonly last: boolean;
  readonly beatsPerBar: number;
  readonly current: number;
  readonly title: string;
}) {
  const staffLines = [0, 1, 2, 3, 4].map((line) => STAFF_BOTTOM - line * 2 * STEP);
  const tabLines = [0, 1, 2, 3, 4, 5].map((line) => TAB_TOP + line * TAB_GAP);
  const right = LEFT + row.bars.length * barWidth;
  return (
    <svg
      className="score__row"
      viewBox={`0 0 ${width} ${ROW_HEIGHT}`}
      role="img"
      aria-label={title}
    >
      {staffLines.map((y) => (
        <line key={y} x1={8} x2={right} y1={y} y2={y} className="score__line" />
      ))}
      {tabLines.map((y) => (
        <line key={y} x1={8} x2={right} y1={y} y2={y} className="score__line score__line--tab" />
      ))}
      <text x={10} y={STAFF_BOTTOM + 4} className="score__clef" aria-hidden="true">
        𝄞
      </text>
      <text x={14} y={TAB_TOP + 22} className="score__tab-label">
        T
      </text>
      <text x={14} y={TAB_TOP + 36} className="score__tab-label">
        A
      </text>
      <text x={14} y={TAB_TOP + 50} className="score__tab-label">
        B
      </text>
      {first ? (
        <>
          <text x={54} y={STAFF_TOP + 2 * STEP + 3} textAnchor="middle" className="score__meter">
            {beatsPerBar}
          </text>
          <text x={54} y={STAFF_BOTTOM - 3} textAnchor="middle" className="score__meter">
            4
          </text>
        </>
      ) : null}
      <line x1={8} x2={8} y1={STAFF_TOP} y2={STAFF_BOTTOM} className="score__bar-line" />
      {row.bars.map((bar, position) => {
        const start = LEFT + position * barWidth;
        const end = start + barWidth;
        const span = Math.max(bar.beats, beatsPerBar);
        const isLast = last && position === row.bars.length - 1;
        const xs = positionsOf(bar, span, barWidth);
        return (
          <g key={bar.number}>
            <text x={start + 4} y={STAFF_TOP - 44} className="score__bar-number">
              {bar.number}
            </text>
            <line x1={end} x2={end} y1={STAFF_TOP} y2={STAFF_BOTTOM} className="score__bar-line" />
            <line
              x1={end}
              x2={end}
              y1={TAB_TOP}
              y2={TAB_TOP + 5 * TAB_GAP}
              className="score__bar-line"
            />
            {isLast ? (
              <line
                x1={end - 4}
                x2={end - 4}
                y1={STAFF_TOP}
                y2={STAFF_BOTTOM}
                className="score__bar-line"
              />
            ) : null}
            {bar.events.map((event, order) => (
              <Event
                key={event.index}
                event={event}
                x={start + (xs[order] ?? 30)}
                state={
                  event.index < current ? 'hecho' : event.index === current ? 'actual' : 'pendiente'
                }
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * La partitura (clave de Sol, compases y figuras) con su tablatura. Muestra el renglón donde estás y el
 * siguiente, y marca la nota que toca.
 */
export function Score({ song, current }: { readonly song: Song; readonly current: number }) {
  const narrow = useIsNarrow(599);
  const bars = layoutBars(song);
  const densest = Math.max(...bars.map((bar) => bar.events.length));
  const perRow = narrow ? (densest <= 2 ? 2 : 1) : densest <= 2 ? 4 : densest <= 5 ? 3 : 2;
  const rows = rowsOf(bars, perRow);
  const barWidth = narrow ? 300 : 230;
  const width = LEFT + perRow * barWidth + 12;
  const currentRow = Math.max(
    0,
    rows.findIndex((row) =>
      row.bars.some((bar) => bar.events.some((event) => event.index === current)),
    ),
  );
  // El renglón donde estás y el siguiente.
  const shown = rows.slice(currentRow, currentRow + 2);
  return (
    <div className="score" data-testid="score">
      {shown.map((row, position) => {
        const index = currentRow + position;
        const firstBar = row.bars[0]?.number ?? 1;
        const lastBar = row.bars[row.bars.length - 1]?.number ?? firstBar;
        return (
          <SystemRow
            key={index}
            row={row}
            width={width}
            barWidth={barWidth}
            first={index === 0}
            last={index === rows.length - 1}
            beatsPerBar={song.beatsPerBar}
            current={current}
            title={`Partitura y tablatura, compases ${firstBar} a ${lastBar}`}
          />
        );
      })}
    </div>
  );
}
