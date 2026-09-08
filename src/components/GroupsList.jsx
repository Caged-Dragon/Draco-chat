import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext.jsx';
import CreateGroupModal from './CreateGroupModal.jsx';

export default function GroupsList({ activeGroupId, onSelectGroup, refreshKey }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadGroups();

    // Live updates: someone adding you to a new group should show up
    // immediately, not just after a reload.
    const channel = supabase
      .channel(`group-members-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members' },
        (payload) => {
          const row = payload.new?.user_id ? payload.new : payload.old;
          if (row?.user_id === user.id) loadGroups();
        }
      )
      .subscribe();

    // Safety-net poll: guarantees being added to a group shows up
    // within ~15s even if realtime replication isn't enabled.
    const poll = setInterval(loadGroups, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, refreshKey]);

  async function loadGroups() {
    if (!user) return;
    const { data } = await supabase
      .from('group_members')
      .select('groups(id, name, avatar_url)')
      .eq('user_id', user.id);

    setGroups((data || []).map((row) => row.groups).filter(Boolean));
  }

  return (
    <div className="friends-list">
      <div className="groups-list-header">
        <h3>Groups</h3>
        <button className="create-group-btn" onClick={() => setShowCreate(true)} aria-label="New group">
          +
        </button>
      </div>
      {groups.length === 0 && <p className="dim small">No groups yet.</p>}
      <ul>
        {groups.map((g) => (
          <li
            key={g.id}
            className={g.id === activeGroupId ? 'active' : ''}
            onClick={() => onSelectGroup(g)}
          >
            👥 {g.name}
          </li>
        ))}
      </ul>

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={(group) => {
            setShowCreate(false);
            loadGroups();
            onSelectGroup(group);
          }}
        />
      )}
    </div>
  );
}
