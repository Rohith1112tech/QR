import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import CreateQR from './pages/CreateQR';
import ViewQR from './pages/ViewQR';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<CreateQR />} />
        <Route path="/view/:shortId" element={<ViewQR />} />
        {/* Redirect any invalid route back to the home/create page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
