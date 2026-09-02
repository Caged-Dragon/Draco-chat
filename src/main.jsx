import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import { PresenceProvider } from './contexts/PresenceContext.jsx';
import { UnreadProvider } from './contexts/UnreadContext.jsx';
import { CallProvider } from './contexts/CallContext.jsx';
import { GroupCallProvider } from './contexts/GroupCallContext.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <PresenceProvider>
          <UnreadProvider>
            <CallProvider>
              <GroupCallProvider>
                <App />
              </GroupCallProvider>
            </CallProvider>
          </UnreadProvider>
        </PresenceProvider>
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>
);
