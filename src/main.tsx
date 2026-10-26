import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { composeApp } from '@/compose';
import { Shell } from '@/ui/shell/Shell';
import { initTheme } from '@/ui/theme/use-theme';
import '@fontsource-variable/nunito';
import '@/ui/styles/tokens.css';
import '@/ui/styles/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root');

const {
  session,
  preferences,
  progress,
  lessonFlow,
  inputs,
  inputManager,
  audio,
  microphone,
  debug,
  devShowSound,
} = composeApp();
initTheme(preferences.getSnapshot().theme);

createRoot(root).render(
  <StrictMode>
    <Shell
      session={session}
      preferences={preferences}
      progress={progress}
      lessonFlow={lessonFlow}
      inputs={inputs}
      inputManager={inputManager}
      audio={audio}
      microphone={microphone}
      debug={debug}
      devShowSound={devShowSound}
    />
  </StrictMode>,
);
