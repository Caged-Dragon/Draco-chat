import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext.jsx';
import { usePresence } from '../contexts/PresenceContext.jsx';
import { useUnread } from '../contexts/UnreadContext.jsx';
import Avatar from './Avatar.jsx';
import ReportModal from './ReportModal.jsx';
import { formatLastSeen } from '../utils/format.js';

export default function FriendsList({ refreshKey, activeFriendId, onSelectFriend }) {
  const { user } = useAuth();
  const { isOnline } = usePresence();
  const { counts } = useUnread();
  const [friends, setFriends] = useState([]);
  const [blockedIds, setBlockedIds] = useState(new Set());
  const [openMenuId, setOpenMenuId] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);

  useEffect(() => {
    loadFriends();
    loadBlocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, user]);

  async function loadFriends() {
    if (!user) return;

    // An accepted friendship can have the current user as either
    // the original requester or the addressee who accepted it.
    const { data, error } = await supabase
      .from('friendships')
      .select(
        `
        requester_id,
        addressee_id,
        requester:profiles!friendships_requester_id_fkey(id, username, avatar_url, status_message, last_seen_at),
        addressee:profiles!friendships_addressee_id_fkey(id, username, avatar_url, status_message, last_seen_at)
      `
      )
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    if (error) {
      console.error(error);
      return;
    }

    const list = data.map((row) =>
      row.requester_id === user.id ? row.addressee : row.requester
    );
    setFriends(list);
  }

  async function loadBlocks() {
    if (!user) return;
    const { data } = await supabase
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);

    const ids = new Set();
    (data || []).forEach((b) => {
      ids.add(b.blocker_id === user.id ? b.blocked_id : b.blocker_id);
    });
    setBlockedIds(ids);
  }

  async function handleUnfriend(friend) {
    await supabase
      .from('friendships')
      .delete()
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${friend.id}),and(requester_id.eq.${friend.id},addressee_id.eq.${user.id})`
      );
    setOpenMenuId(null);
    loadFriends();
  }

  async function handleBlock(friend) {
    await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: friend.id });
    setOpenMenuId(null);
    loadBlocks();
  }

  async function handleUnblock(friend) {
    await supabase.from('blocks').delete().eq('blocker_id', user.id).eq('blocked_id', friend.id);
    setOpenMenuId(null);
    loadBlocks();
  }

  const visibleFriends = friends.filter((f) => !blockedIds.has(f.id));

  return (
    <div className="friends-list">
      <h3>Friends</h3>
      {visibleFriends.length === 0 && <p className="dim small">No friends yet. Search above.</p>}
      <ul>
        {visibleFriends.map((f) => {
          const unread = counts?.[f.id] || 0;
          const online = isOnline(f.id);
          return (
            <li
              key={f.id}
              className={`friend-row ${f.id === activeFriendId ? 'active' : ''}`}
              onClick={() => onSelectFriend(f)}
            >
              <Avatar url={f.avatar_url} name={f.username} size={34} online={online} showStatusDot />
              <div className="friend-row-text">
                <span className="friend-row-name">{f.username}</span>
                <span className="friend-row-sub">
                  {f.status_message || (online ? 'Online' : `Last seen ${formatLastSeen(f.last_seen_at)}`)}
                </span>
              </div>
              {unread > 0 && <span className="unread-badge">{unread}</span>}
              <button
                className="friend-menu-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(openMenuId === f.id ? null : f.id);
                }}
                aria-label="Friend options"
              >
                ⋮
              </button>
              {openMenuId === f.id && (
                <div className="friend-menu" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => handleUnfriend(f)}>Unfriend</button>
                  <button onClick={() => handleBlock(f)}>Block</button>
                  <button
                    onClick={() => {
                      setReportTarget(f);
                      setOpenMenuId(null);
                    }}
                  >
                    Report
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {blockedIds.size > 0 && (
        <div className="blocked-section">
          <h3>Blocked</h3>
          <ul>
            {friends
              .filter((f) => blockedIds.has(f.id))
              .map((f) => (
                <li key={f.id} className="friend-row blocked">
                  <Avatar url={f.avatar_url} name={f.username} size={34} />
                  <div className="friend-row-text">
                    <span className="friend-row-name">{f.username}</span>
                  </div>
                  <button className="unblock-btn" onClick={() => handleUnblock(f)}>
                    Unblock
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      {reportTarget && (
        <ReportModal targetUser={reportTarget} onClose={() => setReportTarget(null)} />
      )}
    </div>
  );
}
