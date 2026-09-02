import { useState } from 'react';
import { linkifyParts, formatMessageTime, REACTION_EMOJIS } from '../utils/format.js';

export default function MessageBubble({
  message,
  isMine,
  quotedMessage,
  reactions,
  currentUserId,
  onReact,
  onEdit,
  onDelete,
  onReply,
  highlight,
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content || '');

  const isDeleted = !!message.deleted_at;

  function submitEdit() {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== message.content) onEdit(trimmed);
    setEditing(false);
  }

  // Group reactions by emoji -> count + whether I reacted
  const grouped = {};
  (reactions || []).forEach((r) => {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, mine: false };
    grouped[r.emoji].count += 1;
    if (r.user_id === currentUserId) grouped[r.emoji].mine = true;
  });

  return (
    <div className={`bubble-row ${isMine ? 'mine' : 'theirs'}`}>
      <div
        className={`bubble ${isMine ? 'mine' : 'theirs'} ${highlight ? 'highlighted' : ''}`}
        onMouseEnter={() => setShowMenu(true)}
        onMouseLeave={() => {
          setShowMenu(false);
          setShowReactionPicker(false);
        }}
      >
        {quotedMessage && (
          <div className="bubble-quote">
            <span className="bubble-quote-text">
              {quotedMessage.deleted_at
                ? 'Message deleted'
                : quotedMessage.content || (quotedMessage.attachment_name ?? 'Attachment')}
            </span>
          </div>
        )}

        {!isDeleted && message.attachment_type === 'image' && (
          <a href={message.attachment_url} target="_blank" rel="noopener noreferrer">
            <img
              src={message.attachment_url}
              alt={message.attachment_name || 'image'}
              className="message-image"
            />
          </a>
        )}
        {!isDeleted && message.attachment_type === 'file' && (
          <a
            href={message.attachment_url}
            target="_blank"
            rel="noopener noreferrer"
            className="message-file"
          >
            📄 {message.attachment_name}
          </a>
        )}
        {!isDeleted && message.attachment_type === 'audio' && (
          <audio controls src={message.attachment_url} className="message-audio" />
        )}

        {isDeleted ? (
          <div className="bubble-text deleted-text">This message was deleted</div>
        ) : editing ? (
          <div className="bubble-edit">
            <input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
              autoFocus
            />
            <button onClick={submitEdit}>Save</button>
          </div>
        ) : (
          message.content && (
            <div className="bubble-text">
              {linkifyParts(message.content).map((p) =>
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
          <span>{formatMessageTime(message.created_at)}</span>
          {message.edited_at && !isDeleted && <span className="edited-tag">edited</span>}
          {isMine && !isDeleted && (
            <span className={`read-tick ${message.read_at ? 'read' : ''}`}>
              {message.read_at ? '✓✓' : '✓'}
            </span>
          )}
        </div>

        {Object.keys(grouped).length > 0 && (
          <div className="reaction-chips">
            {Object.entries(grouped).map(([emoji, info]) => (
              <button
                key={emoji}
                className={`reaction-chip ${info.mine ? 'mine' : ''}`}
                onClick={() => onReact(emoji)}
              >
                {emoji} {info.count}
              </button>
            ))}
          </div>
        )}

        {showMenu && !isDeleted && (
          <div className="bubble-hover-actions">
            <button onClick={() => setShowReactionPicker((s) => !s)} title="React">
              😊
            </button>
            <button onClick={onReply} title="Reply">
              ↩
            </button>
            {isMine && (
              <>
                {message.content && (
                  <button onClick={() => setEditing(true)} title="Edit">
                    ✏️
                  </button>
                )}
                <button onClick={onDelete} title="Delete">
                  🗑
                </button>
              </>
            )}
          </div>
        )}

        {showReactionPicker && (
          <div className="reaction-picker">
            {REACTION_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => {
                  onReact(e);
                  setShowReactionPicker(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
