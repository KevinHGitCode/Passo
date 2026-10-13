import type { PracticeSession } from '@/core/application/practice-session';
import type { AudioControl } from '@/core/ports/audio-control';
import type { NoteInput } from '@/core/ports/note-input';
import { DebugPanel } from './debug/DebugPanel';
import { PracticeScreen } from './practice/PracticeScreen';
import { StatusZone } from './status/StatusZone';
import { useTheme } from './theme/use-theme';

export interface AppProps {
  readonly session: PracticeSession;
  readonly inputs: readonly NoteInput[];
  readonly audio: AudioControl;
  readonly debug?: boolean;
  readonly pcKeysHint?: string | undefined;
}

export function App({ session, inputs, audio, debug = false, pcKeysHint }: AppProps) {
  const [theme, cycleTheme] = useTheme();
  return (
    <>
      <PracticeScreen
        session={session}
        theme={theme}
        onCycleTheme={cycleTheme}
        statusZone={<StatusZone inputs={inputs} audio={audio} />}
        pcKeysHint={pcKeysHint}
      />
      {debug && <DebugPanel session={session} audio={audio} />}
    </>
  );
}
