import type { ReactNode } from 'react';
import type { PracticeSession } from '@/core/application/practice-session';
import { PracticeScreen } from './practice/PracticeScreen';
import { useTheme } from './theme/use-theme';

export interface AppProps {
  readonly session: PracticeSession;
  readonly statusZone?: ReactNode | undefined;
  readonly pcKeysHint?: string | undefined;
}

export function App({ session, statusZone, pcKeysHint }: AppProps) {
  const [theme, cycleTheme] = useTheme();
  return (
    <PracticeScreen
      session={session}
      theme={theme}
      onCycleTheme={cycleTheme}
      statusZone={statusZone}
      pcKeysHint={pcKeysHint}
    />
  );
}
