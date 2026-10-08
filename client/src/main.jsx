import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/app.css';

// Web fonts load without blocking the first paint (system fonts show until they arrive).
if (!document.querySelector('link[data-fonts]')) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Hind:wght@400;500;600;700&family=Rozha+One&display=swap';
  l.dataset.fonts = '1';
  document.head.appendChild(l);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
