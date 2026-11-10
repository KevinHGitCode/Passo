import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { LessonFlow } from '@/core/application/lesson-flow';
import type { ProgressService } from '@/core/application/progress-service';
import type { ChordsService } from '@/core/application/chords-service';
import type { PianoSetupService } from '@/core/application/piano-setup-service';
import type { PianoSongService } from '@/core/application/piano-song-service';
import type { SongService } from '@/core/application/song-service';
import type { TunerService } from '@/core/application/tuner-service';
import type { PlayContext } from '@/core/domain/lessons';
import { App } from '../App';
import type { AppProps } from '../App';
import { activeInstrument, useInstrumentAttribute } from '../instrument/active-instrument';
import { InstrumentChip } from '../instrument/InstrumentChip';
import { useIsNarrow } from '../practice/hooks';
import { CaminoScreen } from '../screens/CaminoScreen';
import { LessonScreen } from '../screens/LessonScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { findPianoSong } from '@/core/domain/piano-songs';
import { ChordsScreen } from '../screens/ChordsScreen';
import { PianoSongScreen } from '../screens/PianoSongScreen';
import { SongScreen } from '../screens/SongScreen';
import { SongsScreen } from '../screens/SongsScreen';
import { TunerScreen } from '../screens/TunerScreen';
import { usePlayContext } from '../screens/use-play-context';
import { SettingsButton, SettingsScreen } from '../settings/SettingsScreen';
import { useSettingsShortcut } from '../settings/use-settings-shortcut';
import { useTheme } from '../theme/use-theme';
import {
  AJUSTES,
  CAMINO,
  ajustesOf,
  caminoOf,
  hrefOf,
  navigate,
  progresoOf,
  routeKey,
} from '../router/routes';
import type { Route } from '../router/routes';
import { useCanonicalRoute, useInstrumentFromRoute } from '../router/use-instrument-route';
import { useRoute, useRouteAnnouncer, useRouteLifecycle } from '../router/use-route';
import { Toaster } from '../toast/Toaster';
import { GameNav } from './GameNav';
import '../game/game.css';
import './shell.css';

export interface ShellProps extends AppProps {
  readonly progress: ProgressService;
  readonly lessonFlow: LessonFlow;
  readonly tuner: TunerService;
  readonly songs: SongService;
  readonly chords: ChordsService;
  readonly piano: PianoSongService;
  readonly pianoSetup: PianoSetupService;
}

/** Debajo de este ancho la navegación pasa a una barra inferior y los ajustes a la cabecera. */
const NARROW_MAX_WIDTH = 899;

const openSettings = (): void => navigate(AJUSTES);

function Screen({
  route,
  shell,
  play,
  gear,
  openSettings,
}: {
  readonly route: Route;
  readonly shell: ShellProps;
  readonly play: PlayContext;
  readonly gear: ReactNode;
  readonly openSettings: () => void;
}): ReactNode {
  const prefs = useSyncExternalStore(shell.preferences.subscribe, shell.preferences.getSnapshot);
  const { notation } = prefs;
  const instrument = activeInstrument(route, prefs.instrument);
  switch (route.name) {
    case 'camino':
      return (
        <CaminoScreen
          key={instrument}
          instrument={instrument}
          progress={shell.progress}
          play={play}
          notation={notation}
          onOpenSettings={openSettings}
        />
      );
    case 'leccion': {
      // El micrófono solo cuenta si es una de las entradas con las que se toca ahora.
      const microphone = play.sources.includes('microfono') ? shell.microphone : undefined;
      return (
        <LessonScreen
          lessonId={route.lessonId}
          flow={shell.lessonFlow}
          session={shell.session}
          progress={shell.progress}
          play={play}
          microphone={microphone}
          canStartWithoutMic={play.sources.some((source) => source !== 'microfono')}
          midi={shell.inputs.find((input) => input.source === 'midi')}
          gear={gear}
          onOpenSettings={openSettings}
        />
      );
    }
    case 'progreso':
      return (
        <ProgressScreen
          key={instrument}
          progress={shell.progress}
          notation={notation}
          instrument={instrument}
        />
      );
    case 'afinador':
      return <TunerScreen tuner={shell.tuner} microphone={shell.microphone} notation={notation} />;
    case 'canciones':
      return <SongsScreen instrument={instrument} />;
    case 'ajustes':
      return (
        <SettingsScreen
          instrument={instrument}
          preferences={shell.preferences}
          pianoSetup={shell.pianoSetup}
          micIsInput={play.sources.includes('microfono')}
          inputs={shell.inputs}
          inputManager={shell.inputManager}
          microphone={shell.microphone}
        />
      );
    case 'acordes':
      return <ChordsScreen chords={shell.chords} microphone={shell.microphone} />;
    case 'cancion':
      if (findPianoSong(route.songId)) {
        return (
          <PianoSongScreen
            songId={route.songId}
            piano={shell.piano}
            microphone={shell.microphone}
            // Con el micrófono como única entrada hay que activarlo antes de tocar.
            needsMicrophone={play.sources.length === 1 && play.sources[0] === 'microfono'}
            notation={notation}
          />
        );
      }
      return (
        <SongScreen
          songId={route.songId}
          songs={shell.songs}
          microphone={shell.microphone}
          notation={notation}
        />
      );
    case 'practica':
      return null;
  }
}

/** El marco de las pantallas del juego: navegación, ajustes y la pantalla que toque. */
function GameLayout({ route, shell }: { readonly route: Route; readonly shell: ShellProps }) {
  const { preferences, inputs, inputManager } = shell;
  const prefs = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);
  const instrument = activeInstrument(route, prefs.instrument);
  useSettingsShortcut(route.name === 'ajustes', instrument);
  const narrow = useIsNarrow(NARROW_MAX_WIDTH);
  const play = usePlayContext(preferences, inputManager, inputs);

  const skipToContent = (
    <button
      type="button"
      className="skip-link"
      onClick={() => document.getElementById('contenido')?.focus({ preventScroll: false })}
    >
      Saltar al contenido
    </button>
  );
  const instrumentChip = (
    <InstrumentChip
      instrument={instrument}
      preferences={preferences}
      progress={shell.progress}
      onChosen={(next) => {
        // La dirección sigue al instrumento; el afinador (de guitarra) vuelve al camino del elegido.
        if (route.name === 'progreso') navigate(progresoOf(next));
        else if (route.name === 'ajustes') navigate(ajustesOf(next));
        else if (
          route.name === 'camino' ||
          route.name === 'afinador' ||
          route.name === 'canciones' ||
          route.name === 'acordes' ||
          route.name === 'cancion'
        )
          navigate(caminoOf(next));
      }}
    />
  );
  // Cada pantalla (y cada instrumento dentro de ella) entra con la misma transición.
  const viewKey = `${routeKey(route)}:${instrument}`;
  const gear = <SettingsButton current={route.name === 'ajustes'} instrument={instrument} />;
  const screen = (
    <Screen route={route} shell={shell} play={play} gear={gear} openSettings={openSettings} />
  );
  // Una lección ocupa toda la pantalla: sin barra lateral ni inferior (se sale con la X).
  if (route.name === 'leccion') {
    return (
      <div className="game game-shell game-shell--focus" data-testid="game-shell">
        {skipToContent}
        <main
          key={viewKey}
          className="game-main game-main--lesson route-enter route-enter--fade"
          id="contenido"
          tabIndex={-1}
        >
          {screen}
        </main>
      </div>
    );
  }

  return (
    <div
      className={`game game-shell${narrow ? ' game-shell--narrow' : ''}`}
      data-testid="game-shell"
    >
      {skipToContent}
      {narrow ? (
        <header className="game-top">
          <a className="game-brand" href={hrefOf(caminoOf(instrument))}>
            Passo
          </a>
          <div className="game-top__instrument">{instrumentChip}</div>
          {gear}
        </header>
      ) : (
        <aside className="game-side">
          <a className="game-brand" href={hrefOf(caminoOf(instrument))}>
            Passo
          </a>
          {instrumentChip}
          <GameNav route={route} instrument={instrument} />
          <div className="game-side__foot">{gear}</div>
        </aside>
      )}
      <main key={viewKey} className="game-main route-enter" id="contenido" tabIndex={-1}>
        {screen}
      </main>
      {narrow ? <GameNav route={route} bottom instrument={instrument} /> : null}
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
  const prefs = useSyncExternalStore(props.preferences.subscribe, props.preferences.getSnapshot);
  const shown = activeInstrument(route, prefs.instrument);
  useInstrumentAttribute(shown);
  useInstrumentFromRoute(route, props.preferences);
  useCanonicalRoute(route, shown);
  useRouteLifecycle(route, props.session, props.lessonFlow, props.microphone);
  useRouteAnnouncer(route);

  if (route.name === 'practica') {
    return (
      <>
        <div className="route-enter route-enter--fade">
          {prefs.instrument === 'guitarra' ? (
            <p className="practice-notice" role="status" data-testid="practica-aviso">
              La práctica libre es de piano. Tu camino de guitarra sigue en «Aprender».
            </p>
          ) : null}
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
        </div>
        <Toaster />
      </>
    );
  }
  return (
    <>
      <GameLayout route={route} shell={props} />
      <Toaster />
    </>
  );
}
