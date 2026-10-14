import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { composeApp } from '@/compose';
import { App } from '@/ui/App';
import { initTheme } from '@/ui/theme/use-theme';
import '@/ui/styles/tokens.css';
import '@/ui/styles/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root');

initTheme();
const { session, inputs, audio, microphone, debug, showSound, pcKeysHint } = composeApp();

createRoot(root).render(
  <StrictMode>
    <App
      session={session}
      inputs={inputs}
      audio={audio}
      microphone={microphone}
      debug={debug}
      showSound={showSound}
      pcKeysHint={pcKeysHint}
    />
  </StrictMode>,
);
