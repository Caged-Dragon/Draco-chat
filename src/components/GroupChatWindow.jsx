import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useGroupCall } from '../contexts/GroupCallContext.jsx';
import Avatar from './Avatar.jsx';
import GifPicker from './GifPicker.jsx';
import ForwardModal from './ForwardModal.jsx';
import { linkifyParts, formatMessageTime, QUICK_EMOJIS, REACTION_EMOJIS } from '../utils/format.js';
import { useViewportWidth } from '../hooks/useViewportWidth.js';
import { sendPushNotification } from '../hooks/usePushNotifications.js';

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const TYPING_STOP_DELAY = 3000;
const DISAPPEAR_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '24 hours', value: 24 * 3600 },
  { label: '7 days', value: 7 * 24 * 3600 },
];

function highlightMentions(text, mentionUsernames) {
  if (!mentionUsernames?.length) return [{ type: 'text', text, key: 0 }];
  const pattern = new RegExp(
    `(@(?:${mentionUsernames.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`,
    'gi'
  );
  return text
    .split(pattern)
    .map((part, i) => ({ type: pattern.test(part) ? 'mention' : 'text', text: part, key: i }))
    .filter((p) => p.text !== '');
}

export default function GroupChatWindow({ group, onBack }) {
  const { user, profile } = useAuth();
  const { joinCall, activeCall } = useGroupCall();

  const [messages, setMessages] = useState([]);
  const [reactionsByMessage, setReactionsByMessage] = useState({});
  const [members, setMembers] = useState([]);
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [typingUsers, setTypingUsers] = useState({});
  const [showMembers, setShowMembers] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [disappearingSeconds, setDisappearingSeconds] = useState(0);

  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const channelRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    loadMessages();
    loadMembers();
    loadGroupSettings();
    markRead();

    const channel = supabase
      .channel(`group-${group.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${group.id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
          if (payload.new.sender_id !== user.id) markRead();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'group_messages', filter: `group_id=eq.${group.id}` },
        (payload) => setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? payload.new : m)))
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_message_reactions' },
        (payload) => {
          const row = payload.new?.id ? payload.new : payload.old;
          setReactionsByMessage((prev) => {
            const list = (prev[row.message_id] || []).filter(
              (r) => !(r.user_id === row.user_id && r.emoji === row.emoji)
            );
            if (payload.eventType !== 'DELETE') list.push(row);
            return { ...prev, [row.message_id]: list };
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'group_members', filter: `group_id=eq.${group.id}` },
        () => loadMembers()
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
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from('group_messages')
      .select('*, sender:profiles!group_messages_sender_id_fkey(id, username, avatar_url)')
      .eq('group_id', group.id)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('created_at', { ascending: true });
    setMessages(data || []);

    if (data?.length) {
      const { data: reactions } = await supabase
        .from('group_message_reactions')
        .select('*')
        .in(
          'message_id',
          data.map((m) => m.id)
        );
      const grouped = {};
      (reactions || []).forEach((r) => {
        if (!grouped[r.message_id]) grouped[r.message_id] = [];
        grouped[r.message_id].push(r);
      });
      setReactionsByMessage(grouped);
    }
  }

  async function loadMembers() {
    const { data } = await supabase
      .from('group_members')
      .select('user_id, last_read_at, profiles(id, username, avatar_url)')
      .eq('group_id', group.id);
    setMembers(
      (data || []).map((r) => ({ ...r.profiles, last_read_at: r.last_read_at })).filter((m) => m.id)
    );
  }

  async function loadGroupSettings() {
    const { data } = await supabase
      .from('groups')
      .select('disappearing_seconds')
      .eq('id', group.id)
      .single();
    setDisappearingSeconds(data?.disappearing_seconds || 0);
  }

  async function markRead() {
    await supabase
      .from('group_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('group_id', group.id)
      .eq('user_id', user.id);
  }

  async function updateDisappearing(seconds) {
    setDisappearingSeconds(seconds);
    await supabase.from('groups').update({ disappearing_seconds: seconds || null }).eq('id', group.id);
  }

  function handleTextChange(e) {
    const value = e.target.value;
    setText(value);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: user.id, username: profile?.username || 'Someone' },
    });

    const lastWord = value.split(/\s/).pop();
    if (lastWord.startsWith('@') && lastWord.length >= 1) {
      setMentionQuery(lastWord.slice(1).toLowerCase());
    } else {
      setMentionQuery(null);
    }
  }

  function pickMention(username) {
    setText((t) => {
      const parts = t.split(/\s/);
      parts[parts.length - 1] = `@${username} `;
      return parts.join(' ');
    });
    setMentionQuery(null);
  }

  async function notifyRecipients(content, mentionedIds) {
    const others = members.filter((m) => m.id !== user.id);
    for (const m of others) {
      const isMentioned = mentionedIds.includes(m.id);
      sendPushNotification(
        m.id,
        isMentioned ? `${profile?.username} mentioned you in ${group.name}` : group.name,
        content || 'Sent an attachment',
        '/'
      );
    }
  }

  async function sendMessage(e) {
    e?.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText('');
    setReplyingTo(null);
    setMentionQuery(null);

    const mentionedIds = members
      .filter((m) => new RegExp(`@${m.username}\\b`, 'i').test(content))
      .map((m) => m.id);

    const expiresAt = disappearingSeconds
      ? new Date(Date.now() + disappearingSeconds * 1000).toISOString()
      : null;

    await supabase.from('group_messages').insert({
      group_id: group.id,
      sender_id: user.id,
      content,
      reply_to_id: replyingTo?.id ?? null,
      mentions: mentionedIds,
      expires_at: expiresAt,
    });

    notifyRecipients(content, mentionedIds);
  }

  async function sendAttachmentMessage({ attachment_url, attachment_type, attachment_name }) {
    const expiresAt = disappearingSeconds
      ? new Date(Date.now() + disappearingSeconds * 1000).toISOString()
      : null;
    await supabase.from('group_messages').insert({
      group_id: group.id,
      sender_id: user.id,
      attachment_url,
      attachment_type,
      attachment_name,
      expires_at: expiresAt,
    });
    notifyRecipients(attachment_type === 'gif' ? 'Sent a GIF' : 'Sent an attachment', []);
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
    await sendAttachmentMessage({
      attachment_url: pub.publicUrl,
      attachment_type: file.type.startsWith('image/') ? 'image' : 'file',
      attachment_name: file.name,
    });
    setUploading(false);
  }

  async function handleGifSelect(url) {
    setShowGifPicker(false);
    await sendAttachmentMessage({ attachment_url: url, attachment_type: 'gif', attachment_name: 'GIF' });
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

  async function handleTogglePin(message) {
    await supabase
      .from('group_messages')
      .update({ pinned_at: message.pinned_at ? null : new Date().toISOString() })
      .eq('id', message.id);
  }

  async function handleReact(messageId, emoji) {
    const existing = (reactionsByMessage[messageId] || []).find(
      (r) => r.user_id === user.id && r.emoji === emoji
    );
    if (existing) {
      await supabase.from('group_message_reactions').delete().eq('id', existing.id);
    } else {
      await supabase
        .from('group_message_reactions')
        .insert({ message_id: messageId, user_id: user.id, emoji });
    }
  }

  function insertEmoji(emoji) {
    setText((t) => t + emoji);
    setShowEmojiPicker(false);
  }

  const typingNames = Object.values(typingUsers);
  const memberUsernames = members.map((m) => m.username);
  const mentionSuggestions =
    mentionQuery !== null
      ? members.filter((m) => m.id !== user.id && m.username.toLowerCase().startsWith(mentionQuery))
      : [];

  const pinnedMessage = [...messages].reverse().find((m) => m.pinned_at && !m.deleted_at);

  const lastMessage = messages[messages.length - 1];
  const seenByCount =
    lastMessage && lastMessage.sender_id === user.id
      ? members.filter((m) => m.id !== user.id && m.last_read_at >= lastMessage.created_at).length
      : null;

  const viewportWidth = useViewportWidth();
  const isSmall = viewportWidth <= 400;
  const isMobile = viewportWidth <= 640;

  const headerStyle = isMobile
    ? { padding: isSmall ? '8px 10px' : '10px 14px', gap: isSmall ? '4px' : '6px' }
    : undefined;
  const iconBtnStyle = isMobile
    ? { fontSize: isSmall ? 13 : 15, padding: '4px 2px', flexShrink: 0 }
    : undefined;
  const nameWrapStyle = isMobile
    ? { minWidth: 0, flex: '1 1 auto', overflow: 'hidden', cursor: 'pointer' }
    : { cursor: 'pointer' };
  const nameTextStyle = isMobile
    ? { fontSize: isSmall ? 13 : 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
    : undefined;
  const inputRowStyle = isMobile
    ? { padding: isSmall ? '8px' : '10px 12px', gap: isSmall ? '4px' : '6px' }
    : undefined;
  const textInputStyle = { flex: '1 1 auto', minWidth: 0 };
  const sendBtnStyle = isMobile
    ? { padding: isSmall ? '8px 12px' : '9px 16px', fontSize: isSmall ? 13 : 14, flexShrink: 0, whiteSpace: 'nowrap' }
    : { flexShrink: 0 };
  const attachIconStyle = isMobile ? { fontSize: isSmall ? 16 : 18, flexShrink: 0 } : { flexShrink: 0 };

  return (
    <div className="chat-window">
      <div className="chat-header" style={headerStyle}>
        <button className="back-btn" onClick={onBack} aria-label="Back" style={iconBtnStyle}>
          ←
        </button>
        <div className="chat-header-name" onClick={() => setShowMembers((s) => !s)} style={nameWrapStyle}>
          <div style={nameTextStyle}>👥 {group.name}</div>
          <div className="chat-header-sub">
            {typingNames.length > 0 ? `${typingNames.join(', ')} typing...` : `${members.length} members`}
          </div>
        </div>
        <button
          className="chat-settings-btn"
          onClick={() => joinCall(group, 'audio')}
          disabled={!!activeCall}
          aria-label="Group voice call"
          style={iconBtnStyle}
        >
          📞
        </button>
        <button
          className="chat-settings-btn"
          onClick={() => joinCall(group, 'video')}
          disabled={!!activeCall}
          aria-label="Group video call"
          style={iconBtnStyle}
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
          <div className="disappearing-row">
            <span>⏱ Disappearing messages</span>
            <select
              value={disappearingSeconds}
              onChange={(e) => updateDisappearing(Number(e.target.value))}
            >
              {DISAPPEAR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {pinnedMessage && (
        <div className="pinned-banner">
          📌 {pinnedMessage.content || pinnedMessage.attachment_name || 'Pinned message'}
          <button onClick={() => handleTogglePin(pinnedMessage)}>Unpin</button>
        </div>
      )}

      <div className="chat-messages">
        {messages.map((m, idx) => {
          const isMine = m.sender_id === user.id;
          const quoted = m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) : null;
          const isLastOfMine = isMine && idx === messages.length - 1;
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
                {!m.deleted_at && m.attachment_type === 'gif' && (
                  <img src={m.attachment_url} alt="GIF" className="message-image" />
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
                      {highlightMentions(m.content, memberUsernames).map((part) => {
                        if (part.type === 'mention') {
                          return (
                            <span key={part.key} className="mention-tag">
                              {part.text}
                            </span>
                          );
                        }
                        return linkifyParts(part.text).map((p, j) =>
                          p.type === 'link' ? (
                            <a key={`${part.key}-${j}`} href={p.text} target="_blank" rel="noopener noreferrer">
                              {p.text}
                            </a>
                          ) : (
                            <span key={`${part.key}-${j}`}>{p.text}</span>
                          )
                        );
                      })}
                    </div>
                  )
                )}
                <div className="bubble-meta">
                  <span>{formatMessageTime(m.created_at)}</span>
                  {m.edited_at && !m.deleted_at && <span className="edited-tag">edited</span>}
                  {m.expires_at && !m.deleted_at && (
                    <span className="edited-tag" title="Disappearing message">
                      ⏱
                    </span>
                  )}
                </div>

                {(reactionsByMessage[m.id] || []).length > 0 && (
                  <div className="reaction-chips">
                    {Object.entries(
                      (reactionsByMessage[m.id] || []).reduce((acc, r) => {
                        if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false };
                        acc[r.emoji].count += 1;
                        if (r.user_id === user.id) acc[r.emoji].mine = true;
                        return acc;
                      }, {})
                    ).map(([emoji, info]) => (
                      <button
                        key={emoji}
                        className={`reaction-chip ${info.mine ? 'mine' : ''}`}
                        onClick={() => handleReact(m.id, emoji)}
                      >
                        {emoji} {info.count}
                      </button>
                    ))}
                  </div>
                )}

                {isLastOfMine && seenByCount !== null && (
                  <div className="seen-by-text">{seenByCount > 0 ? `Seen by ${seenByCount}` : 'Sent'}</div>
                )}

                {!m.deleted_at && (
                  <div className="bubble-hover-actions">
                    {REACTION_EMOJIS.slice(0, 3).map((e) => (
                      <button key={e} onClick={() => handleReact(m.id, e)} title="React">
                        {e}
                      </button>
                    ))}
                    <button onClick={() => setReplyingTo(m)} title="Reply">
                      ↩
                    </button>
                    <button onClick={() => setForwardingMessage(m)} title="Forward">
                      ➡️
                    </button>
                    <button onClick={() => handleTogglePin(m)} title={m.pinned_at ? 'Unpin' : 'Pin'}>
                      📌
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

      {mentionSuggestions.length > 0 && (
        <div className="mention-suggestions">
          {mentionSuggestions.map((m) => (
            <button key={m.id} type="button" onClick={() => pickMention(m.username)}>
              <Avatar url={m.avatar_url} name={m.username} size={22} />
              {m.username}
            </button>
          ))}
        </div>
      )}

      <form className="chat-input" onSubmit={sendMessage} style={inputRowStyle}>
        <button
          type="button"
          className="attach-btn"
          onClick={() => setShowEmojiPicker((s) => !s)}
          style={attachIconStyle}
        >
          😊
        </button>
        <button
          type="button"
          className="attach-btn"
          onClick={() => setShowGifPicker((s) => !s)}
          style={attachIconStyle}
        >
          GIF
        </button>
        <button
          type="button"
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={attachIconStyle}
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
          placeholder="Message the group... (@ to mention)"
          value={text}
          onChange={handleTextChange}
          style={textInputStyle}
        />
        <button type="submit" style={sendBtnStyle}>
          Send
        </button>
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

      {showGifPicker && <GifPicker onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} />}

      {forwardingMessage && (
        <ForwardModal message={forwardingMessage} onClose={() => setForwardingMessage(null)} />
      )}
    </div>
  );
}
