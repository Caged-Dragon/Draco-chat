import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function ChatWindow({ friend, onBack }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    loadMessages();

    // Live updates: listen for any new message and keep it if it
    // belongs to this conversation (either direction).
    const channel = supabase
      .channel(`chat-${[user.id, friend.id].sort().join('-')}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new;
          const belongsHere =
            (m.sender_id === user.id && m.receiver_id === friend.id) ||
            (m.sender_id === friend.id && m.receiver_id === user.id);
          if (belongsHere) {
            setMessages((prev) => [...prev, m]);
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friend.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${friend.id}),and(sender_id.eq.${friend.id},receiver_id.eq.${user.id})`
      )
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error);
      return;
    }
    setMessages(data);
  }

  async function sendMessage(e) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;

    setText('');
    const { error } = await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: friend.id,
      content,
    });

    if (error) console.error(error);
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <button className="back-btn" onClick={onBack} aria-label="Back to friends list">
          ←
        </button>
        <span>{friend.username}</span>
      </div>

      <div className="chat-messages">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`bubble ${m.sender_id === user.id ? 'mine' : 'theirs'}`}
          >
            {m.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input" onSubmit={sendMessage}>
        <input
          type="text"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}