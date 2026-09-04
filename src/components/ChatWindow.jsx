import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext.jsx';
import { usePresence } from '../contexts/PresenceContext.jsx';
import { useUnread } from '../contexts/UnreadContext.jsx';
import { useCall } from '../contexts/CallContext.jsx';
import ChatThemeModal from './ChatThemeModal.jsx';
import MessageBubble from './MessageBubble.jsx';
import Avatar from './Avatar.jsx';
import { computeGradient } from '../theme/fields.js';
import { QUICK_EMOJIS, formatLastSeen } from '../utils/format.js';

function sameId(a, b) {
  return (
    typeof a === 'string' &&
    typeof b === 'string' &&
    a.trim().toLowerCase() === b.trim().toLowerCase()
  );
}

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15MB
const TYPING_STOP_DELAY = 3000;

export default function ChatWindow({ friend, onBack }) {
  const { user } = useAuth();
  const { isOnline } = usePresence();
  const { markRead } = useUnread();
  const { startCall, callState } = useCall();

  const [messages, setMessages] = useState([]);
  const [reactionsByMessage, setReactionsByMessage] = useState({});
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState('');
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [friendTyping, setFriendTyping] = useState(false);
  const [recording, setRecording] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // This chat's OWN theme overrides only — merged on top of the global
  // theme via inline CSS variables scoped to this component's root div.
  const [chatTheme, setChatTheme] = useState({});
  const [chatWallpaper, setChatWallpaper] = useState(null);

  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatChannelRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const friendTypingTimeoutRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  // Always-current set of message ids in this conversation, so the
  // reactions realtime handler (set up once per friend.id) never reads
  // a stale closure of `messages` when deciding whether a reaction
  // belongs on screen.
  const messageIdsRef = useRef(new Set());

  useEffect(() => {
    messageIdsRef.current = new Set(messages.map((m) => m.id));
  }, [messages]);

  useEffect(() => {
    loadMessages();
    loadChatSettings();
    markRead(friend.id);

    const channel = supabase
      .channel(`chat-${[user.id, friend.id].sort().join('-')}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new;
          const belongsHere =
            (sameId(m.sender_id, user.id) && sameId(m.receiver_id, friend.id)) ||
            (sameId(m.sender_id, friend.id) && sameId(m.receiver_id, user.id));
          if (belongsHere) {
            setMessages((prev) => [...prev, m]);
            if (sameId(m.sender_id, friend.id)) markRead(friend.id);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new;
          const belongsHere =
            (sameId(m.sender_id, user.id) && sameId(m.receiver_id, friend.id)) ||
            (sameId(m.sender_id, friend.id) && sameId(m.receiver_id, user.id));
          if (belongsHere) {
            setMessages((prev) => prev.map((old) => (old.id === m.id ? m : old)));
          }
        }
      )
      .on('broadcast', { event: 'typing' }, () => {
        setFriendTyping(true);
        if (friendTypingTimeoutRef.current) clearTimeout(friendTypingTimeoutRef.current);
        friendTypingTimeoutRef.current = setTimeout(() => setFriendTyping(false), TYPING_STOP_DELAY + 500);
      })
      .on('broadcast', { event: 'stop-typing' }, () => {
        setFriendTyping(false);
      })
      .subscribe();

    chatChannelRef.current = channel;

    // Live reaction updates for this conversation. Set up once per
    // friend.id (not per loadMessages() call) and cleaned up alongside
    // the chat channel below, so switching conversations never leaks a
    // lingering `reactions-*` realtime channel.
    const reactionsChannel = supabase
      .channel(`reactions-${[user.id, friend.id].sort().join('-')}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (payload) => {
        const row = payload.new || payload.old;
        if (!messageIdsRef.current.has(row.message_id)) return;
        setReactionsByMessage((prev) => {
          const next = { ...prev };
          const list = (next[row.message_id] || []).filter(
            (r) => !(r.user_id === row.user_id && r.emoji === row.emoji)
          );
          if (payload.eventType !== 'DELETE') list.push(row);
          next[row.message_id] = list;
          return next;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(reactionsChannel);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (friendTypingTimeoutRef.current) clearTimeout(friendTypingTimeoutRef.current);
    };
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
    if (data.length) loadReactions(data.map((m) => m.id));
  }

  async function loadReactions(messageIds) {
    const { data } = await supabase
      .from('message_reactions')
      .select('*')
      .in('message_id', messageIds);

    const grouped = {};
    (data || []).forEach((r) => {
      if (!grouped[r.message_id]) grouped[r.message_id] = [];
      grouped[r.message_id].push(r);
    });
    setReactionsByMessage(grouped);
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

  function sendTyping() {
    chatChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: {} });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      chatChannelRef.current?.send({ type: 'broadcast', event: 'stop-typing', payload: {} });
    }, TYPING_STOP_DELAY);
  }

  function handleTextChange(e) {
    setText(e.target.value);
    sendTyping();
  }

  async function sendMessage(e) {
    e?.preventDefault();
    const content = text.trim();
    if (!content) return;

    setText('');
    setReplyingTo(null);
    chatChannelRef.current?.send({ type: 'broadcast', event: 'stop-typing', payload: {} });

    const { error } = await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: friend.id,
      content,
      reply_to_id: replyingTo?.id ?? null,
    });

    if (error) setAttachError(error.message);
  }

  async function handleAttachmentPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachError('File is too large (max 15MB).');
      return;
    }

    setAttachError('');
    setUploading(true);

    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(path, file);

    if (uploadError) {
      setAttachError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data: pub } = supabase.storage.from('chat-attachments').getPublicUrl(path);
    const attachmentType = file.type.startsWith('image/') ? 'image' : 'file';

    const { error: insertError } = await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: friend.id,
      attachment_url: pub.publicUrl,
      attachment_type: attachmentType,
      attachment_name: file.name,
    });

    if (insertError) setAttachError(insertError.message);
    setUploading(false);
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        if (blob.size === 0) return;

        setUploading(true);
        const path = `${user.id}/${Date.now()}-voice-message.webm`;
        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(path, blob, { contentType: 'audio/webm' });

        if (uploadError) {
          setAttachError(uploadError.message);
          setUploading(false);
          return;
        }

        const { data: pub } = supabase.storage.from('chat-attachments').getPublicUrl(path);
        await supabase.from('messages').insert({
          sender_id: user.id,
          receiver_id: friend.id,
          attachment_url: pub.publicUrl,
          attachment_type: 'audio',
          attachment_name: 'Voice message',
        });
        setUploading(false);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setAttachError('Could not access microphone.');
    }
  }

  async function handleReact(messageId, emoji) {
    const existing = (reactionsByMessage[messageId] || []).find(
      (r) => r.user_id === user.id && r.emoji === emoji
    );
    if (existing) {
      await supabase.from('message_reactions').delete().eq('id', existing.id);
    } else {
      await supabase.from('message_reactions').insert({ message_id: messageId, user_id: user.id, emoji });
    }
  }

  async function handleEditMessage(messageId, newContent) {
    await supabase
      .from('messages')
      .update({ content: newContent, edited_at: new Date().toISOString() })
      .eq('id', messageId);
  }

  async function handleDeleteMessage(messageId) {
    await supabase.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', messageId);
  }

  function insertEmoji(emoji) {
    setText((t) => t + emoji);
    setShowEmojiPicker(false);
  }

  const filteredMessages = searchQuery.trim()
    ? messages.filter((m) => m.content?.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : messages;

  // Only the CSS variables this chat has actually overridden get
  // applied here — everything else falls through to the global theme
  // set on <html> by ThemeContext, since custom properties inherit.
  const scopedStyle = { ...chatTheme };
  const scopedGradient = computeGradient(chatTheme);
  if (scopedGradient) scopedStyle['--gradient'] = scopedGradient;
  scopedStyle['--wallpaper-image'] = chatWallpaper ? `url("${chatWallpaper}")` : undefined;

  const online = isOnline(friend.id);

  return (
    <div className="chat-window" style={scopedStyle}>
      <div className="chat-header">
        <button className="back-btn" onClick={onBack} aria-label="Back to friends list">
          ←
        </button>
        <Avatar url={friend.avatar_url} name={friend.username} size={30} online={online} showStatusDot />
        <div className="chat-header-name">
          <div>{friend.username}</div>
          <div className="chat-header-sub">
            {friendTyping
              ? 'typing...'
              : online
              ? 'Online'
              : friend.last_seen_at
              ? `Last seen ${formatLastSeen(friend.last_seen_at)}`
              : ''}
          </div>
        </div>
        <button className="chat-settings-btn" onClick={() => setSearchOpen((s) => !s)} aria-label="Search">
          🔍
        </button>
        <button
          className="chat-settings-btn"
          onClick={() => startCall(friend, 'audio')}
          disabled={callState !== 'idle'}
          aria-label="Voice call"
          title="Voice call"
        >
          📞
        </button>
        <button
          className="chat-settings-btn"
          onClick={() => startCall(friend, 'video')}
          disabled={callState !== 'idle'}
          aria-label="Video call"
          title="Video call"
        >
          🎥
        </button>
        <button
          className="chat-settings-btn"
          onClick={() => setShowThemeModal(true)}
          aria-label="Chat settings"
        >
          🎨
        </button>
      </div>

      {searchOpen && (
        <div className="chat-search-bar">
          <input
            type="text"
            placeholder="Search in this chat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <button
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery('');
            }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="chat-messages">
        {filteredMessages.map((m) => {
          const quoted = m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) : null;
          return (
            <MessageBubble
              key={m.id}
              message={m}
              isMine={sameId(m.sender_id, user.id)}
              quotedMessage={quoted}
              reactions={reactionsByMessage[m.id]}
              currentUserId={user.id}
              onReact={(emoji) => handleReact(m.id, emoji)}
              onEdit={(newContent) => handleEditMessage(m.id, newContent)}
              onDelete={() => handleDeleteMessage(m.id)}
              onReply={() => setReplyingTo(m)}
              highlight={!!searchQuery.trim()}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>

      {attachError && <p className="error-text attach-error">{attachError}</p>}

      {replyingTo && (
        <div className="reply-preview">
          <div>
            <span className="reply-preview-label">Replying to</span>
            <span className="reply-preview-text">
              {replyingTo.content || replyingTo.attachment_name || 'a message'}
            </span>
          </div>
          <button onClick={() => setReplyingTo(null)}>✕</button>
        </div>
      )}

      <form className="chat-input" onSubmit={sendMessage}>
        <button
          type="button"
          className="attach-btn"
          onClick={() => setShowEmojiPicker((s) => !s)}
          aria-label="Emoji"
        >
          😊
        </button>
        <button
          type="button"
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label="Attach image or document"
        >
          {uploading ? '…' : '📎'}
        </button>
        <button
          type="button"
          className={`attach-btn ${recording ? 'recording' : ''}`}
          onClick={toggleRecording}
          aria-label="Record voice message"
        >
          {recording ? '⏹' : '🎙️'}
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
          onChange={handleTextChange}
        />
        <button type="submit">Send</button>
      </form>

      {showEmojiPicker && (
        <div className="emoji-picker">
          {QUICK_EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => insertEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
      )}

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
