import { Icon } from '../game/icons';
import type { IconName } from '../game/icons';
import type { Instrument } from '@/core/domain/instrument';
import { AFINADOR, CAMINO, PRACTICA, PROGRESO, hrefOf } from '../router/routes';
import type { Route, RouteName } from '../router/routes';

interface Item {
  readonly route: Route;
  readonly label: string;
  readonly icon: IconName;
  /** Rutas en las que este elemento figura como el actual (una lección cuenta como «Aprender»). */
  readonly active: readonly RouteName[];
}

const COMMON: readonly Item[] = [
  { route: CAMINO, label: 'Aprender', icon: 'home', active: ['camino', 'leccion'] },
  { route: PROGRESO, label: 'Progreso', icon: 'chart', active: ['progreso'] },
];

/** Lo último de la navegación depende del instrumento: piano tiene práctica libre, guitarra el afinador. */
const LAST: Readonly<Record<Instrument, Item>> = {
  piano: { route: PRACTICA, label: 'Práctica libre', icon: 'keys', active: ['practica'] },
  guitarra: { route: AFINADOR, label: 'Afinador', icon: 'tuner', active: ['afinador'] },
};

/** La navegación principal: barra lateral en pantallas anchas y barra inferior en las estrechas. */
export function GameNav({
  route,
  bottom = false,
  instrument = 'piano',
}: {
  readonly route: Route;
  readonly bottom?: boolean;
  readonly instrument?: Instrument;
}) {
  const items = [...COMMON, LAST[instrument]];
  return (
    <nav
      className={bottom ? 'game-nav game-nav--bottom' : 'game-nav'}
      aria-label="Principal"
      data-testid={bottom ? 'game-nav-bottom' : 'game-nav'}
    >
      {items.map((item) => {
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
