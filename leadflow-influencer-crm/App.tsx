
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import InfluencerList from './pages/InfluencerList';
import InfluencerDetail from './pages/InfluencerDetail';
import EmailMarketing from './pages/EmailMarketing';
import SubAccounts from './pages/SubAccounts';
import Settings from './pages/Settings';
import ApiSettings from './pages/ApiSettings';
import Login from './pages/Login';
import { FeedbackProvider } from './components/FeedbackProvider';

// Main Layout Component
const MainLayout: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  return (
    <div className="flex h-screen w-full bg-[#f6f7f8] dark:bg-[#101922] overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <Header onLogout={onLogout} />
        <main className="flex-1 overflow-hidden flex flex-col relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for token on load
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const handleLogin = (user: any) => {
    setIsAuthenticated(true);
    console.log('User logged in:', user);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <FeedbackProvider>
      <Router>
        <Routes>
          <Route path="/login" element={
            isAuthenticated ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />
          } />
          
          <Route path="/" element={
            isAuthenticated ? <MainLayout onLogout={handleLogout} /> : <Navigate to="/login" replace />
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="influencers" element={<InfluencerList />} />
            <Route path="details/:id" element={<InfluencerDetail />} />
            <Route path="marketing" element={<EmailMarketing />} />
            <Route path="sub-accounts" element={<SubAccounts />} />
            <Route path="settings" element={<Settings />} />
            <Route path="api-keys" element={<ApiSettings />} />
          </Route>
        </Routes>
      </Router>
    </FeedbackProvider>
  );
}

export default App;
