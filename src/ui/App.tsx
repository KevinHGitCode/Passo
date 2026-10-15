import type { InputManager } from '@/core/application/input-manager';
import type { PracticeSession } from '@/core/application/practice-session';
import type { PreferencesService } from '@/core/application/preferences-service';
import type { AudioControl } from '@/core/ports/audio-control';
import type { InputMonitor } from '@/core/ports/input-monitor';
import type { NoteInput } from '@/core/ports/note-input';
import { DebugPanel } from './debug/DebugPanel';
import { useInputSelection } from './practice/hooks';
import { PracticeScreen } from './practice/PracticeScreen';
import { StatusZone } from './status/StatusZone';
import { useTheme } from './theme/use-theme';

export interface AppProps {
  readonly session: PracticeSession;
  readonly preferences: PreferencesService;
  /** Todas las entradas que existen. */
  readonly inputs: readonly NoteInput[];
  /** Con gestor, solo escucha la entrada elegida; sin él (modo de desarrollo) valen todas las de `inputs`. */
  readonly inputManager?: InputManager | undefined;
  readonly audio: AudioControl;
  /** Entrada por micrófono con su monitor (nivel, nota oída). */
  readonly microphone?: (NoteInput & InputMonitor) | undefined;
  readonly debug?: boolean;
  /** Modo de desarrollo: muestra el estado del sonido de la app (solo suena con el teclado del PC). */
  readonly devShowSound?: boolean;
}

export function App({
  session,
  preferences,
  inputs,
  inputManager,
  audio,
  microphone,
  debug = false,
  devShowSound = false,
}: AppProps) {
  const [theme, cycleTheme] = useTheme(preferences);
  const selected = useInputSelection(inputManager);

  // Con gestor, la pantalla solo muestra la entrada elegida; sin gestor, las que se pidieron en la dirección.
  const activeInputs = selected === null ? inputs : inputs.filter((i) => i.source === selected);
  const micActive = microphone !== undefined && (selected === null || selected === 'microfono');
  const canStartWithoutMic = activeInputs.some((input) => input.source !== 'microfono');
  const showSound =
    selected === null ? devShowSound : selected === 'teclado-pc' && activeInputs.length > 0;
  const showPcKeys = activeInputs.some((input) => input.source === 'teclado-pc');

  return (
    <>
      <PracticeScreen
        session={session}
        theme={theme}
        onCycleTheme={cycleTheme}
        statusZone={
          <StatusZone
            inputs={activeInputs}
            audio={audio}
            microphone={micActive ? microphone : undefined}
            showAudio={showSound}
          />
        }
        showPcKeys={showPcKeys}
        microphone={micActive ? microphone : undefined}
        canStartWithoutMic={canStartWithoutMic}
      />
      {debug && (
        <DebugPanel
          session={session}
          audio={audio}
          microphone={micActive ? microphone : undefined}
        />
      )}
    </>
  );
}
