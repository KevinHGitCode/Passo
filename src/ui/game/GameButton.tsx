import './game.css';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

export type GameButtonVariant = 'primary' | 'secondary' | 'success' | 'locked';

interface CommonProps {
  readonly variant?: GameButtonVariant | undefined;
  readonly size?: 'md' | 'lg' | undefined;
  /** Ocupa todo el ancho disponible. */
  readonly block?: boolean | undefined;
  readonly children: ReactNode;
}

function classes({
  variant = 'primary',
  size = 'md',
  block = false,
}: Omit<CommonProps, 'children'>): string {
  return [
    'game-btn',
    `game-btn--${variant}`,
    size === 'lg' ? 'game-btn--lg' : '',
    block ? 'game-btn--block' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Botón 3D del juego. Una sola acción principal por pantalla (`primary` o `success`). */
export function GameButton({
  variant,
  size,
  block,
  children,
  className,
  type = 'button',
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  const own = classes({ variant, size, block });
  return (
    <button type={type} className={className ? `${own} ${className}` : own} {...rest}>
      {children}
    </button>
  );
}

/** Lo mismo como enlace (cambia de pantalla por la dirección). */
export function GameLink({
  variant,
  size,
  block,
  children,
  className,
  ...rest
}: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const own = classes({ variant, size, block });
  return (
    <a className={className ? `${own} ${className}` : own} {...rest}>
      {children}
    </a>
  );
}
