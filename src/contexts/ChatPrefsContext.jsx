import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext.jsx';

// Per-chat mute / archive choices, stored in the chat_preferences table.
// kind is 'f' for a friend chat and 'g' for a group chat.
const ChatPrefsContext = createContext(null);
const EMPTY = { muted: false, archived: false };

export function ChatPrefsProvider({ children }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState({});

  const load = useCallback(async () => {
    if (!user) {
      setPrefs({});
      return;
    }
    const { data, error } = await supabase
      .from('chat_preferences')
      .select('friend_id, group_id, muted, archived')
      .eq('owner_id', user.id);
    if (error) return;
    const next = {};
    (data || []).forEach((row) => {
      const key = row.friend_id ? `f:${row.friend_id}` : `g:${row.group_id}`;
      next[key] = { muted: row.muted, archived: row.archived };
    });
    setPrefs(next);
  }, [user]);

  useEffect(() => {
    load();
    if (!user) return undefined;
    const channel = supabase
      .channel(`chat-prefs-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_preferences', filter: `owner_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user, load]);

  const getPref = useCallback((kind, id) => prefs[`${kind}:${id}`] || EMPTY, [prefs]);

  const setPref = useCallback(
    async (kind, id, patch) => {
      if (!user) return;
      const key = `${kind}:${id}`;
      const merged = { ...(prefs[key] || EMPTY), ...patch };
      setPrefs((prev) => ({ ...prev, [key]: merged })); // optimistic

      const row = {
        owner_id: user.id,
        friend_id: kind === 'f' ? id : null,
        group_id: kind === 'g' ? id : null,
        muted: merged.muted,
        archived: merged.archived,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('chat_preferences')
        .upsert(row, { onConflict: kind === 'f' ? 'owner_id,friend_id' : 'owner_id,group_id' });
      if (error) load(); // roll back to the server's truth
    },
    [user, prefs, load]
  );

  return <ChatPrefsContext.Provider value={{ getPref, setPref }}>{children}</ChatPrefsContext.Provider>;
}

export function useChatPrefs() {
  return useContext(ChatPrefsContext);
}
