import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
// Brand fonts are bundled with the site (no third-party font requests): Cormorant Garamond for
// display headings, Jost for text, with Rozha One / Hind covering Hindi (Devanagari) characters.
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/jost/latin-400.css';
import '@fontsource/jost/latin-500.css';
import '@fontsource/jost/latin-600.css';
import '@fontsource/hind/devanagari-400.css';
import '@fontsource/hind/devanagari-600.css';
import '@fontsource/rozha-one/devanagari-400.css';
import './styles/app.css';
import './styles/mobile.css';
import './styles/luxe.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
