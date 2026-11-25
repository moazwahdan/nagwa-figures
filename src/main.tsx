import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@nagwa-limited/mathlive/dist/mathlive-fonts.css';
import '@nagwa-limited/mathlive/dist/mathlive-static.css';
void import('@nagwa-limited/mathlive').then(() => {
  const Ctor = customElements.get('math-field') as (CustomElementConstructor & { fontsDirectory?: string | null }) | undefined;
  if (Ctor) Ctor.fontsDirectory = null;
});
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { appFontCss } from './core/fonts';
import { installVerify } from './core/verifyHook';
import './styles.css';
if (import.meta.env.DEV) installVerify();

const style = document.createElement('style');
style.textContent = appFontCss();
document.head.appendChild(style);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
);
