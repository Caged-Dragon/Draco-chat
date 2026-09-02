import { useState } from 'react';
import { useAuth } from './contexts/AuthContext.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import IncomingCallModal from './components/IncomingCallModal.jsx';
import ActiveCallScreen from './components/ActiveCallScreen.jsx';
import GroupCallScreen from './components/GroupCallScreen.jsx';

export default function App() {
  const { user, loading, recoveryMode } = useAuth();
  // Only relevant while logged out: show the marketing landing page
  // first, then move to the actual login/signup form once the visitor
  // taps a call-to-action.
  const [showAuth, setShowAuth] = useState(false);

  if (loading) {
    return <div className="center-screen">Loading...</div>;
  }

  // A password-reset email link logs the user in via a special "recovery"
  // session — intercept that before showing the normal dashboard so they
  // land on the "set a new password" screen instead.
  if (recoveryMode) {
    return <ResetPassword />;
  }

  if (user) {
    return (
      <>
        <Dashboard />
        <IncomingCallModal />
        <ActiveCallScreen />
        <GroupCallScreen />
      </>
    );
  }

  if (!showAuth) {
    return <Landing onGetStarted={() => setShowAuth(true)} onLogin={() => setShowAuth(true)} />;
  }

  return <Login onBackToLanding={() => setShowAuth(false)} />;
}
