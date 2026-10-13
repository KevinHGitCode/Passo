import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { composeApp } from '@/compose';
import { App } from '@/ui/App';
import '@/ui/styles/tokens.css';
import '@/ui/styles/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root');

const { session } = composeApp();

createRoot(root).render(
  <StrictMode>
    <App session={session} pcKeysHint="Teclado del PC: A S D F G = Do Re Mi Fa Sol" />
  </StrictMode>,
);
