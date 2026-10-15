import type { PracticeSession } from '@/core/application/practice-session';
import type { PreferencesService } from '@/core/application/preferences-service';
import type { AudioControl } from '@/core/ports/audio-control';
import type { InputMonitor } from '@/core/ports/input-monitor';
import type { NoteInput } from '@/core/ports/note-input';
import { DebugPanel } from './debug/DebugPanel';
import { PracticeScreen } from './practice/PracticeScreen';
import { StatusZone } from './status/StatusZone';
import { useTheme } from './theme/use-theme';

export interface AppProps {
  readonly session: PracticeSession;
  readonly preferences: PreferencesService;
  readonly inputs: readonly NoteInput[];
  readonly audio: AudioControl;
  /** Entrada por micrófono con su monitor (nivel, nota oída). */
  readonly microphone?: (NoteInput & InputMonitor) | undefined;
  readonly debug?: boolean;
  /** Muestra el estado del sonido de la app (solo cuando suena: teclado del PC). */
  readonly showSound?: boolean;
  readonly pcKeysHint?: string | undefined;
}

export function App({
  session,
  preferences,
  inputs,
  audio,
  microphone,
  debug = false,
  showSound = false,
  pcKeysHint,
}: AppProps) {
  const [theme, cycleTheme] = useTheme(preferences);
  const canStartWithoutMic = inputs.some((input) => input.source !== 'microfono');
  return (
    <>
      <PracticeScreen
        session={session}
        theme={theme}
        onCycleTheme={cycleTheme}
        statusZone={
          <StatusZone inputs={inputs} audio={audio} microphone={microphone} showAudio={showSound} />
        }
        pcKeysHint={pcKeysHint}
        microphone={microphone}
        canStartWithoutMic={canStartWithoutMic}
      />
      {debug && <DebugPanel session={session} audio={audio} microphone={microphone} />}
    </>
  );
}
