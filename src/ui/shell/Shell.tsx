import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { LessonFlow } from '@/core/application/lesson-flow';
import type { ProgressService } from '@/core/application/progress-service';
import { App } from '../App';
import type { AppProps } from '../App';
import { useIsNarrow, useSessionSnapshot } from '../practice/hooks';
import { CaminoScreen } from '../screens/CaminoScreen';
import { LessonScreen } from '../screens/LessonScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { SettingsButton, SettingsPanel } from '../settings/SettingsPanel';
import { useSettingsPanel } from '../settings/use-settings-panel';
import { useTheme } from '../theme/use-theme';
import { hrefOf, CAMINO } from '../router/routes';
import type { Route } from '../router/routes';
import { useRoute, useRouteAnnouncer, useRouteLifecycle } from '../router/use-route';
import { GameNav } from './GameNav';
import '../game/game.css';
import './shell.css';

export interface ShellProps extends AppProps {
  readonly progress: ProgressService;
  readonly lessonFlow: LessonFlow;
}

/** Debajo de este ancho la navegación pasa a una barra inferior y los ajustes a la cabecera. */
const NARROW_MAX_WIDTH = 899;

function Screen({
  route,
  shell,
}: {
  readonly route: Route;
  readonly shell: ShellProps;
}): ReactNode {
  switch (route.name) {
    case 'camino':
      return <CaminoScreen />;
    case 'leccion':
      return <LessonScreen lessonId={route.lessonId} flow={shell.lessonFlow} />;
    case 'progreso':
      return <ProgressScreen />;
    case 'practica':
      return null;
  }
}

/** El marco de las pantallas del juego: navegación, ajustes y la pantalla que toque. */
function GameLayout({ route, shell }: { readonly route: Route; readonly shell: ShellProps }) {
  const { session, preferences, inputs, inputManager, microphone, lessonFlow } = shell;
  const settings = useSettingsPanel(session);
  const gearRef = useRef<HTMLButtonElement>(null);
  // Al cerrar los ajustes el foco vuelve al engranaje (si no, se perdería).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !settings.open) gearRef.current?.focus({ preventScroll: true });
    wasOpen.current = settings.open;
  }, [settings.open]);
  const narrow = useIsNarrow(NARROW_MAX_WIDTH);
  const { phase } = useSessionSnapshot(session);
  const lessonActive = useSyncExternalStore(lessonFlow.subscribe, lessonFlow.isActive);

  const gear = (
    <SettingsButton open={settings.open} onToggle={settings.toggle} buttonRef={gearRef} />
  );
  return (
    <div
      className={`game game-shell${narrow ? ' game-shell--narrow' : ''}`}
      data-testid="game-shell"
    >
      {narrow ? (
        <header className="game-top">
          <a className="game-brand" href={hrefOf(CAMINO)}>
            Passo
          </a>
          {gear}
        </header>
      ) : (
        <aside className="game-side">
          <a className="game-brand" href={hrefOf(CAMINO)}>
            Passo
          </a>
          <GameNav route={route} />
          <div className="game-side__foot">{gear}</div>
        </aside>
      )}
      <main className="game-main" id="contenido">
        <Screen route={route} shell={shell} />
      </main>
      {narrow ? <GameNav route={route} bottom /> : null}
      <SettingsPanel
        open={settings.open}
        onClose={settings.close}
        preferences={preferences}
        inputs={inputs}
        inputManager={inputManager}
        microphone={microphone}
        roundPaused={phase === 'pausada'}
        lessonActive={lessonActive}
      />
    </div>
  );
}

/**
 * La raíz de la interfaz: según la dirección muestra el camino, una lección, el progreso o la
 * práctica libre (la pantalla de siempre, que sigue siendo `App`).
 */
export function Shell(props: ShellProps) {
  const route = useRoute();
  useTheme(props.preferences);
  useRouteLifecycle(route, props.session, props.lessonFlow);
  useRouteAnnouncer(route);

  if (route.name === 'practica') {
    return (
      <App
        session={props.session}
        preferences={props.preferences}
        inputs={props.inputs}
        inputManager={props.inputManager}
        audio={props.audio}
        microphone={props.microphone}
        debug={props.debug ?? false}
        devShowSound={props.devShowSound ?? false}
        brandHref={hrefOf(CAMINO)}
      />
    );
  }
  return <GameLayout route={route} shell={props} />;
}
