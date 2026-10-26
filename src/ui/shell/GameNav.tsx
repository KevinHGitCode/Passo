import { Icon } from '../game/icons';
import type { IconName } from '../game/icons';
import { CAMINO, PRACTICA, PROGRESO, hrefOf } from '../router/routes';
import type { Route, RouteName } from '../router/routes';

interface Item {
  readonly route: Route;
  readonly label: string;
  readonly icon: IconName;
  /** Rutas en las que este elemento figura como el actual (una lección cuenta como «Aprender»). */
  readonly active: readonly RouteName[];
}

const ITEMS: readonly Item[] = [
  { route: CAMINO, label: 'Aprender', icon: 'home', active: ['camino', 'leccion'] },
  { route: PROGRESO, label: 'Progreso', icon: 'chart', active: ['progreso'] },
  { route: PRACTICA, label: 'Práctica libre', icon: 'keys', active: ['practica'] },
];

/** La navegación principal: barra lateral en pantallas anchas y barra inferior en las estrechas. */
export function GameNav({
  route,
  bottom = false,
}: {
  readonly route: Route;
  readonly bottom?: boolean;
}) {
  return (
    <nav
      className={bottom ? 'game-nav game-nav--bottom' : 'game-nav'}
      aria-label="Principal"
      data-testid={bottom ? 'game-nav-bottom' : 'game-nav'}
    >
      {ITEMS.map((item) => {
        const current = item.active.includes(route.name);
        return (
          <a
            key={item.label}
            className="game-link"
            href={hrefOf(item.route)}
            aria-current={current ? 'page' : undefined}
          >
            <Icon name={item.icon} size={bottom ? 24 : 26} />
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
