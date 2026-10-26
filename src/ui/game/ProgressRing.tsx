import './game.css';
const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Anillo de progreso (precisión): `value` de 0 a 1. El texto va al lado, no dentro. */
export function ProgressRing({
  value,
  label,
  size = 64,
}: {
  readonly value: number;
  /** Nombre accesible: «Precisión 94 %». */
  readonly label: string;
  readonly size?: number;
}) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className="game-ring"
    >
      <circle cx="32" cy="32" r={RADIUS} className="game-ring__track" />
      <circle
        cx="32"
        cy="32"
        r={RADIUS}
        className="game-ring__fill"
        strokeDasharray={`${CIRCUMFERENCE * clamped} ${CIRCUMFERENCE}`}
        transform="rotate(-90 32 32)"
      />
    </svg>
  );
}
