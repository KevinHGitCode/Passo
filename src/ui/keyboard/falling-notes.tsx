import type { ReactNode } from 'react';
import { noteName } from '@/core/domain/note';
import type { NotationMode } from '@/core/domain/note';
import { speedFactorOf } from '@/core/application/piano-song-service';
import type { PianoSpeed, StepState } from '@/core/application/piano-song-service';
import { stepLengthMs, stepStartMs } from '@/core/domain/piano-songs';
import type { PianoSong } from '@/core/domain/piano-songs';
import type { KeyboardLayout } from './geometry';

/** Alto de la zona de caída (unidades del viewBox del teclado) y cuántos ms de canción caben en ella. */
export const FALL_HEIGHT = 250;
export const LOOKAHEAD_MS = 2600;
const PX_PER_MS = FALL_HEIGHT / LOOKAHEAD_MS;

/** De esta nota hacia abajo se toca con la mano izquierda (el Do4 y por encima, con la derecha). */
const LEFT_HAND_BELOW = 60;
/** Cuánto se queda a la vista el ✓ o el ✕ de una nota que ya pasó (ms de canción). */
const MARK_MS = 700;

/**
 * Las notas de la canción cayendo sobre su tecla: cada barra llega a la tecla justo cuando toca y mide lo
 * que dura. Se dibuja en las mismas coordenadas que el teclado, así cada barra cae sobre su tecla.
 */
export function FallingNotes({
  layout,
  song,
  speed,
  playhead,
  states,
  current,
  notation,
}: {
  readonly layout: KeyboardLayout;
  readonly song: PianoSong;
  readonly speed: PianoSpeed;
  /** Dónde va la canción (ms). */
  readonly playhead: number;
  readonly states: readonly StepState[];
  /** El paso que toca ahora. */
  readonly current: number;
  readonly notation: NotationMode;
}) {
  const factor = speedFactorOf(speed);
  const bars: ReactNode[] = [];
  song.steps.forEach((step, index) => {
    const start = stepStartMs(song, step, factor);
    const length = stepLengthMs(song, step, factor);
    // La barra sube desde la tecla (y = 0) tanto como falte para su hora.
    const bottom = -(start - playhead) * PX_PER_MS;
    const height = Math.max(8, length * PX_PER_MS - 3);
    const top = bottom - height;
    const state = states[index] ?? 'pendiente';
    // Un momento después de pasar por la tecla, un ✓ o un ✕ dice cómo salió la nota.
    const sincePassed = playhead - (start + length);
    if (state !== 'pendiente' && sincePassed >= 0 && sincePassed < MARK_MS) {
      for (const midi of step.notes) {
        const key = layout.keys.find((item) => item.midi === midi);
        if (!key) continue;
        bars.push(
          <text
            key={`mark-${index}-${midi}`}
            x={key.x + key.width / 2}
            y={-8 - sincePassed / 40}
            textAnchor="middle"
            className={
              state === 'bien' ? 'fall__mark fall__mark--ok' : 'fall__mark fall__mark--miss'
            }
            data-testid={`fall-mark-${index}-${midi}`}
            opacity={1 - sincePassed / MARK_MS}
          >
            {state === 'bien' ? '✓' : '✕'}
          </text>,
        );
      }
    }
    if (top > 6 || bottom < -FALL_HEIGHT - 10) return;
    for (const midi of step.notes) {
      const key = layout.keys.find((item) => item.midi === midi);
      if (!key) continue;
      const width = key.isBlack ? key.width - 1 : key.width - 3;
      const x = key.x + (key.width - width) / 2;
      const clippedTop = Math.max(top, -FALL_HEIGHT);
      bars.push(
        <g
          key={`${index}-${midi}`}
          className="fall__bar"
          data-state={state}
          data-hand={midi < LEFT_HAND_BELOW ? 'izquierda' : 'derecha'}
          data-current={index === current}
          data-testid={`fall-${index}-${midi}`}
        >
          <rect
            x={x}
            y={clippedTop}
            width={width}
            height={Math.min(bottom, 4) - clippedTop}
            rx={4}
          />
          {height > 14 ? (
            <text
              x={x + width / 2}
              y={Math.min(bottom, 0) - 4}
              textAnchor="middle"
              className="fall__label"
            >
              {noteName(midi, notation)}
            </text>
          ) : null}
        </g>,
      );
    }
  });
  return (
    <g className="fall" aria-hidden="true">
      <rect
        x={0}
        y={-FALL_HEIGHT}
        width={layout.width}
        height={FALL_HEIGHT}
        className="fall__lane"
      />
      <line x1={0} x2={layout.width} y1={0} y2={0} className="fall__line" />
      {bars}
    </g>
  );
}
