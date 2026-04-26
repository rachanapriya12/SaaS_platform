import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { getApiBase } from './lib/apiBase';
import './index.css';

if (import.meta.env.PROD) {
  const base = getApiBase();
  if (base.includes('localhost')) {
    console.error(
      '[CollabDocs] Production build is still using localhost for the API. Set VITE_API_BASE in frontend/.env.production or Vercel, then rebuild.'
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
