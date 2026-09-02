import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useGroupCall } from '../contexts/GroupCallContext.jsx';
import Avatar from './Avatar.jsx';
import { linkifyParts, formatMessageTime, QUICK_EMOJIS } from '../utils/format.js';

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const TYPING_STOP_DELAY = 3000;

export default function GroupChatWindow({ group, onBack }) {
  const { user, profile } = useAuth();
  const { joinCall, activeCall } = useGroupCall();

  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [typingUsers, setTypingUsers] = useState({}); // userId -> username
  const [showMembers, setShowMembers] = useState(false);

  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const channelRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    loadMessages();
    loadMembers();

    const channel = supabase
      .channel(`group-${group.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${group.id}` },
        (payload) => setMessages((prev) => [...prev, payload.new])
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'group_messages', filter: `group_id=eq.${group.id}` },
        (payload) =>
          setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? payload.new : m)))
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === user.id) return;
        setTypingUsers((prev) => ({ ...prev, [payload.userId]: payload.username }));
        setTimeout(() => {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[payload.userId];
            return next;
          });
        }, TYPING_STOP_DELAY + 500);
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadMessages() {
    const { data } = await supabase
      .from('group_messages')
      .select('*, sender:profiles!group_messages_sender_id_fkey(id, username, avatar_url)')
      .eq('group_id', group.id)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  }

  async function loadMembers() {
    const { data } = await supabase
      .from('group_members')
      .select('profiles(id, username, avatar_url)')
      .eq('group_id', group.id);
    setMembers((data || []).map((r) => r.profiles).filter(Boolean));
  }

  function handleTextChange(e) {
    setText(e.target.value);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: user.id, username: profile?.username || 'Someone' },
    });
  }

  async function sendMessage(e) {
    e?.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText('');
    setReplyingTo(null);

    await supabase.from('group_messages').insert({
      group_id: group.id,
      sender_id: user.id,
      content,
      reply_to_id: replyingTo?.id ?? null,
    });
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
    await supabase.from('group_messages').insert({
      group_id: group.id,
      sender_id: user.id,
      attachment_url: pub.publicUrl,
      attachment_type: file.type.startsWith('image/') ? 'image' : 'file',
      attachment_name: file.name,
    });
    setUploading(false);
  }

  async function handleEdit(messageId, newContent) {
    await supabase
      .from('group_messages')
      .update({ content: newContent, edited_at: new Date().toISOString() })
      .eq('id', messageId);
  }

  async function handleDelete(messageId) {
    await supabase.from('group_messages').update({ deleted_at: new Date().toISOString() }).eq('id', messageId);
  }

  function insertEmoji(emoji) {
    setText((t) => t + emoji);
    setShowEmojiPicker(false);
  }

  const typingNames = Object.values(typingUsers);

  return (
    <div className="chat-window">
      <div className="chat-header">
        <button className="back-btn" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="chat-header-name" onClick={() => setShowMembers((s) => !s)} style={{ cursor: 'pointer' }}>
          <div>👥 {group.name}</div>
          <div className="chat-header-sub">
            {typingNames.length > 0 ? `${typingNames.join(', ')} typing...` : `${members.length} members`}
          </div>
        </div>
        <button
          className="chat-settings-btn"
          onClick={() => joinCall(group, 'audio')}
          disabled={!!activeCall}
          aria-label="Group voice call"
        >
          📞
        </button>
        <button
          className="chat-settings-btn"
          onClick={() => joinCall(group, 'video')}
          disabled={!!activeCall}
          aria-label="Group video call"
        >
          🎥
        </button>
      </div>

      {showMembers && (
        <div className="group-members-panel">
          {members.map((m) => (
            <div key={m.id} className="group-member-row">
              <Avatar url={m.avatar_url} name={m.username} size={26} />
              <span>{m.username}</span>
            </div>
          ))}
        </div>
      )}

      <div className="chat-messages">
        {messages.map((m) => {
          const isMine = m.sender_id === user.id;
          const quoted = m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) : null;
          return (
            <div key={m.id} className={`bubble-row ${isMine ? 'mine' : 'theirs'}`}>
              <div className={`bubble ${isMine ? 'mine' : 'theirs'}`}>
                {!isMine && <div className="group-sender-name">{m.sender?.username}</div>}
                {quoted && (
                  <div className="bubble-quote">
                    <span className="bubble-quote-text">
                      {quoted.deleted_at ? 'Message deleted' : quoted.content || quoted.attachment_name}
                    </span>
                  </div>
                )}
                {!m.deleted_at && m.attachment_type === 'image' && (
                  <a href={m.attachment_url} target="_blank" rel="noopener noreferrer">
                    <img src={m.attachment_url} alt={m.attachment_name} className="message-image" />
                  </a>
                )}
                {!m.deleted_at && m.attachment_type === 'file' && (
                  <a href={m.attachment_url} target="_blank" rel="noopener noreferrer" className="message-file">
                    📄 {m.attachment_name}
                  </a>
                )}
                {m.deleted_at ? (
                  <div className="bubble-text deleted-text">This message was deleted</div>
                ) : (
                  m.content && (
                    <div className="bubble-text">
                      {linkifyParts(m.content).map((p) =>
                        p.type === 'link' ? (
                          <a key={p.key} href={p.text} target="_blank" rel="noopener noreferrer">
                            {p.text}
                          </a>
                        ) : (
                          <span key={p.key}>{p.text}</span>
                        )
                      )}
                    </div>
                  )
                )}
                <div className="bubble-meta">
                  <span>{formatMessageTime(m.created_at)}</span>
                  {m.edited_at && !m.deleted_at && <span className="edited-tag">edited</span>}
                </div>
                {!m.deleted_at && (
                  <div className="bubble-hover-actions">
                    <button onClick={() => setReplyingTo(m)} title="Reply">
                      ↩
                    </button>
                    {isMine && m.content && (
                      <button
                        onClick={() => {
                          const next = prompt('Edit message', m.content);
                          if (next && next.trim()) handleEdit(m.id, next.trim());
                        }}
                        title="Edit"
                      >
                        ✏️
                      </button>
                    )}
                    {isMine && (
                      <button onClick={() => handleDelete(m.id)} title="Delete">
                        🗑
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
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
        <button type="button" className="attach-btn" onClick={() => setShowEmojiPicker((s) => !s)}>
          😊
        </button>
        <button
          type="button"
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
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
        <input type="text" placeholder="Message the group..." value={text} onChange={handleTextChange} />
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
    </div>
  );
}
