import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function FriendsList({ refreshKey, activeFriendId, onSelectFriend }) {
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);

  useEffect(() => {
    loadFriends();
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
        requester:profiles!friendships_requester_id_fkey(id, username),
        addressee:profiles!friendships_addressee_id_fkey(id, username)
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

  return (
    <div className="friends-list">
      <h3>Friends</h3>
      {friends.length === 0 && <p className="dim small">No friends yet. Search above.</p>}
      <ul>
        {friends.map((f) => (
          <li
            key={f.id}
            className={f.id === activeFriendId ? 'active' : ''}
            onClick={() => onSelectFriend(f)}
          >
            {f.username}
          </li>
        ))}
      </ul>
    </div>
  );
}
