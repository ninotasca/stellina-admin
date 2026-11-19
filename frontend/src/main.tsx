import React from 'react';
import ReactDOM from 'react-dom/client';
import '@ninotasca/web-platform/ui/styles.css';
import './index.css';
import Application from './app/Application';
import BuildVersion from './platform/ui/BuildVersion';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Application />
    <BuildVersion />
  </React.StrictMode>
);
