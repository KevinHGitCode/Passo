import './game.css';
import { STAR_PATH } from './icons';

export type StarCount = 0 | 1 | 2 | 3;

/**
 * Las estrellas de una lección. Las vacías llevan contorno discontinuo (no dependen del color) y el
 * nombre accesible dice «2 de 3 estrellas».
 */
export function Stars({
  value,
  size = 'md',
}: {
  readonly value: StarCount;
  readonly size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span
      className={`game-stars game-stars--${size}`}
      role="img"
      aria-label={`${value} de 3 estrellas`}
      data-stars={value}
    >
      {([1, 2, 3] as const).map((n) => (
        <svg key={n} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d={STAR_PATH}
            className={n <= value ? 'game-star game-star--on' : 'game-star game-star--off'}
          />
        </svg>
      ))}
    </span>
  );
}
