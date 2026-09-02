import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext.jsx';

const UnreadContext = createContext(null);

export function UnreadProvider({ children }) {
  const { user } = useAuth();
  // { [senderId]: count }
  const [counts, setCounts] = useState({});

  useEffect(() => {
    if (!user) {
      setCounts({});
      return;
    }
    loadCounts();

    const channel = supabase
      .channel(`unread-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        (payload) => {
          const senderId = payload.new.sender_id;
          setCounts((prev) => ({ ...prev, [senderId]: (prev[senderId] || 0) + 1 }));
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    document.title = total > 0 ? `(${total}) Dragon Chat` : 'Dragon Chat';
  }, [counts]);

  async function loadCounts() {
    const { data, error } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', user.id)
      .is('read_at', null);

    if (error) return;
    const next = {};
    for (const row of data) {
      next[row.sender_id] = (next[row.sender_id] || 0) + 1;
    }
    setCounts(next);
  }

  // Call when opening a chat with `friendId` — marks their messages to
  // you as read, both in the database and in local state.
  async function markRead(friendId) {
    setCounts((prev) => {
      if (!prev[friendId]) return prev;
      const next = { ...prev };
      delete next[friendId];
      return next;
    });

    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', friendId)
      .eq('receiver_id', user.id)
      .is('read_at', null);
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <UnreadContext.Provider value={{ counts, total, markRead }}>{children}</UnreadContext.Provider>
  );
}

export function useUnread() {
  return useContext(UnreadContext);
}
