import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import FriendRequests from '../components/FriendRequests.jsx';
import FriendsList from '../components/FriendsList.jsx';
import SearchFriends from '../components/SearchFriends.jsx';
import ChatWindow from '../components/ChatWindow.jsx';
import SettingModal from '../src/components/SettingModel.jsx';

export default function Dashboard() {
  const { profile, signOut } = useAuth();
  const [activeFriend, setActiveFriend] = useState(null);
  // Bump this to force FriendsList / FriendRequests to refetch
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);
  const [showSettings, setShowSettings] = useState(false);

  // On mobile, "chat-open" swaps from the friends list to the full-screen
  // chat window. On desktop this class has no visual effect (see CSS).
  const shellClass = `app-shell${activeFriend ? ' chat-open' : ''}`;

  return (
    <div className={shellClass}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <img src="/logo.png" alt="Dragon Chat" className="brand-logo" />
            <span className="brand-name">Dragon Chat</span>
          </div>
          <div className="sidebar-header-actions">
            <button
              className="settings-btn"
              onClick={() => setShowSettings(true)}
              aria-label="App settings"
            >
              ⚙️
            </button>
            <button className="logout-btn" onClick={signOut}>
              Log out
            </button>
          </div>
        </div>

        <div className="me-row">Logged in as {profile?.username ?? 'you'}</div>

        <SearchFriends onRequestSent={bump} />
        <FriendRequests refreshKey={refreshKey} onChange={bump} />
        <FriendsList
          refreshKey={refreshKey}
          activeFriendId={activeFriend?.id}
          onSelectFriend={setActiveFriend}
        />
      </aside>

      <main className="chat-area">
        {activeFriend ? (
          <ChatWindow friend={activeFriend} onBack={() => setActiveFriend(null)} />
        ) : (
          <div className="center-screen dim">Select a friend to start chatting</div>
        )}
      </main>

      {showSettings && <SettingModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}