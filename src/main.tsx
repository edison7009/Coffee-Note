import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { readStorageValue, storageKey } from './storage';

type StartupTheme = 'system' | 'light' | 'dark';

function applyStartupTheme() {
  let themeMode: StartupTheme = 'light';
  try {
    const stored = readStorageValue(storageKey('theme'));
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed === 'light' || parsed === 'dark' || parsed === 'system') themeMode = parsed;
    }
  } catch {
    // React applies the default system theme after mounting.
  }

  const resolvedTheme = themeMode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : themeMode;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
}

applyStartupTheme();

// Suppress the WebView's built-in context menu. App-level components render
// their own right-click menus via onContextMenu, so the native menu (Back /
// Reload / Save As / Inspect…) never appears.
window.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
