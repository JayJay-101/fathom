import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AchievementsPage } from './pages/AchievementsPage';
import App from './App.tsx';
import './index.css';

// Two routes, no guards. There is no account to be signed in to, and no
// paywall to be on the wrong side of. First-run onboarding is local state
// inside App, not a route you can be redirected into.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/achievements" element={<AchievementsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
