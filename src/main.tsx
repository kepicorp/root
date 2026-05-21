import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { autoConnectFromUrl } from './ui/network';
import './styles.css';

autoConnectFromUrl();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
