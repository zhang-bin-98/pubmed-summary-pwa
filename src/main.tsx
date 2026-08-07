import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import './app/styles.css';

const updateSW = registerSW({
  onNeedRefresh() {
    if (document.querySelector('.sw-update')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sw-update';
    button.textContent = '更新应用';
    button.addEventListener('click', () => void updateSW(true));
    document.body.append(button);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
