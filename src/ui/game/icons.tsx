import type { ReactNode } from 'react';

/** Los iconos del juego: trazos simples, siempre decorativos (el texto acompaña). */
export type IconName =
  | 'check'
  | 'cross'
  | 'lock'
  | 'play'
  | 'review'
  | 'trophy'
  | 'flame'
  | 'bolt'
  | 'home'
  | 'chart'
  | 'keys'
  | 'gear'
  | 'target';

interface Shape {
  readonly paths: readonly string[];
  /** Relleno en vez de trazo. */
  readonly filled?: boolean;
  readonly strokeWidth?: number;
}

export const STAR_PATH =
  'M12 2.8l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 17l-5.8 3.3 1.4-6.4L2.7 9.5l6.5-.7L12 2.8Z';

const SHAPES: Readonly<Record<IconName, Shape>> = {
  check: { paths: ['M5 12.5l4.5 4.5L19 7.5'], strokeWidth: 3.2 },
  cross: { paths: ['M6 6l12 12M18 6 6 18'], strokeWidth: 3.2 },
  lock: {
    paths: [
      'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z',
      'M8 11V8a4 4 0 0 1 8 0v3',
    ],
  },
  play: {
    paths: ['M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z'],
    filled: true,
  },
  review: { paths: ['M20 12a8 8 0 1 1-2.6-5.9', 'M20 4v5h-5'], strokeWidth: 2.8 },
  trophy: {
    paths: [
      'M8 4h8v5a4 4 0 0 1-8 0V4Z',
      'M8 6H4c0 3 1.5 4.5 4 4.5M16 6h4c0 3-1.5 4.5-4 4.5M12 13v4M8 21h8M9.5 17h5',
    ],
  },
  flame: {
    paths: [
      'M12 2.5c.5 3 3.5 4.7 3.5 8.2a3.5 3.5 0 0 1-7 0c0-1.5.6-2.5 1.3-3.2.2 1 .7 1.6 1.4 1.8-.4-2.7-.2-4.7.8-6.8Z',
    ],
    filled: true,
  },
  bolt: { paths: ['M13 2 4 14h7l-1 8 9-12h-7l1-8Z'], filled: true },
  home: { paths: ['M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9Z'] },
  chart: { paths: ['M5 20V10M12 20V4M19 20v-7'] },
  keys: { paths: ['M3 4h18v16H3Z', 'M9 4v9M15 4v9M12 13v7'], strokeWidth: 2 },
  gear: {
    paths: [
      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
      'M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8',
    ],
    strokeWidth: 2.2,
  },
  target: {
    paths: [
      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
      'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
      'M12 12h.01',
    ],
  },
};

export function Icon({
  name,
  size = 24,
}: {
  readonly name: IconName;
  readonly size?: number;
}): ReactNode {
  const shape = SHAPES[name];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill={shape.filled ? 'currentColor' : 'none'}
      stroke={shape.filled ? 'none' : 'currentColor'}
      strokeWidth={shape.strokeWidth ?? 2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shape.paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
