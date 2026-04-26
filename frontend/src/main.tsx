import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

if (import.meta.env.PROD) {
  const base = import.meta.env.VITE_API_BASE?.trim();
  if (!base || base.includes('localhost')) {
    console.error(
      '[CollabDocs] Set VITE_API_BASE in Vercel (Project → Settings → Environment Variables) to your backend URL, then redeploy.'
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
