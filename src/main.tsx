import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

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
