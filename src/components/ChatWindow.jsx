import { useEffect, useRef, useState } from 'react';

import { supabase } from '../supabaseClient';

import { useAuth } from '../contexts/AuthContext.jsx';

import ChatThemeModal from './ChatThemeModal.jsx';

import { computeGradient } from '../theme/fields.js';

// Normalize a UUID for comparison — lowercase and trimmed. Guards
// against subtle id-format mismatches across devices/browsers.

function sameId(a, b) {
  return (
    typeof a === 'string' &&
    typeof b === 'string' &&
    a.trim().toLowerCase() === b.trim().toLowerCase()
  );
}

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15MB

export default function ChatWindow({ friend, onBack }) {
  const { user } = useAuth();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState('');
  const [showThemeModal, setShowThemeModal] = useState(false);

  // This chat's OWN theme overrides only — merged on top of the global
  // theme via inline CSS variables scoped to this component's root div.

  const [chatTheme, setChatTheme] = useState({});
  const [chatWallpaper, setChatWallpaper] = useState(null);

  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadMessages();
    loadChatSettings();

    // Live updates: listen for any new message and keep it if it
    // belongs to this conversation (either direction).

    const channel = supabase
      .channel(`chat-${[user.id, friend.id].sort().join('-')}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const m = payload.new;

          const belongsHere =
            (sameId(m.sender_id, user.id) &&
              sameId(m.receiver_id, friend.id)) ||
            (sameId(m.sender_id, friend.id) &&
              sameId(m.receiver_id, user.id));

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

  async function loadChatSettings() {
    const { data } = await supabase
      .from('chat_settings')
      .select('theme, wallpaper_url')
      .eq('owner_id', user.id)
      .eq('friend_id', friend.id)
      .maybeSingle();

    setChatTheme(data?.theme ?? {});
    setChatWallpaper(data?.wallpaper_url ?? null);
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

    if (error) {
      console.error(error);
    }
  }

  async function handleAttachmentPick(e) {
    const file = e.target.files?.[0];

    e.target.value = ''; // allow picking the same file again later

    if (!file) return;

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachError('File is too large (max 15MB).');
      return;
    }

    setAttachError('');
    setUploading(true);

    const path = `${user.id}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(path, file);

    if (uploadError) {
      setAttachError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data: pub } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(path);

    const attachmentType = file.type.startsWith('image/')
      ? 'image'
      : 'file';

    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        receiver_id: friend.id,
        attachment_url: pub.publicUrl,
        attachment_type: attachmentType,
        attachment_name: file.name,
      });

    if (insertError) {
      setAttachError(insertError.message);
    }

    setUploading(false);
  }

  // Only the CSS variables this chat has actually overridden get
  // applied here — everything else falls through to the global theme
  // set on <html> by ThemeContext, since custom properties inherit.

  const scopedStyle = { ...chatTheme };

  const scopedGradient = computeGradient(chatTheme);

  if (scopedGradient) {
    scopedStyle['--gradient'] = scopedGradient;
  }

  scopedStyle['--wallpaper-image'] = chatWallpaper
    ? `url("${chatWallpaper}")`
    : undefined;

  return (
    <div className="chat-window" style={scopedStyle}>
      <div className="chat-header">
        <button
          className="back-btn"
          onClick={onBack}
          aria-label="Back to friends list"
        >
          ←
        </button>

        <span className="chat-header-name">
          {friend.username}
        </span>

        <button
          className="chat-settings-btn"
          onClick={() => setShowThemeModal(true)}
          aria-label="Chat settings"
        >
          🎨
        </button>
      </div>

      <div className="chat-messages">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`bubble ${sameId(m.sender_id, user.id) ? 'mine' : 'theirs'
              }`}
          >
            {m.attachment_type === 'image' && (
              <a
                href={m.attachment_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={m.attachment_url}
                  alt={m.attachment_name || 'image'}
                  className="message-image"
                />
              </a>
            )}

            {m.attachment_type === 'file' && (
              <a
                href={m.attachment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="message-file"
              >
                📄 {m.attachment_name}
              </a>
            )}

            {m.content && (
              <div className="bubble-text">
                {m.content}
              </div>
            )}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {attachError && (
        <p className="error-text attach-error">
          {attachError}
        </p>
      )}

      <form
        className="chat-input"
        onSubmit={sendMessage}
      >
        <button
          type="button"
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label="Attach image or document"
        >
          {uploading ? '…' : '📎'}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.doc,.docx,.txt,.zip"
          onChange={handleAttachmentPick}
          hidden
        />

        <input
          type="text"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <button type="submit">
          Send
        </button>
      </form>

      {showThemeModal && (
        <ChatThemeModal
          friend={friend}
          theme={chatTheme}
          wallpaperUrl={chatWallpaper}
          onChange={(nextTheme, nextWallpaper) => {
            setChatTheme(nextTheme);
            setChatWallpaper(nextWallpaper);
          }}
          onClose={() => setShowThemeModal(false)}
        />
      )}
    </div>
  );
}