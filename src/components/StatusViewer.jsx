import { useEffect, useRef, useState } from 'react';
import { useStatus } from '../contexts/StatusContext.jsx';
import { formatLastSeen } from '../utils/format.js';

const DURATION_MS = 5000;

export default function StatusViewer({ group, isOwn, onClose, onAddMore }) {
  const { markViewed, deleteStatus, getViewers } = useStatus();
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewers, setViewers] = useState(null);
  const startRef = useRef(null);
  const rafRef = useRef(null);

  const current = group.statuses[index];

  useEffect(() => {
    if (!current) return;
    markViewed(current.id);
    setViewers(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    if (!current || paused) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    setProgress(0);
    startRef.current = performance.now();

    function tick(now) {
      const elapsed = now - startRef.current;
      const pct = Math.min(100, (elapsed / DURATION_MS) * 100);
      setProgress(pct);
      if (pct >= 100) {
        goNext();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused, current?.id]);

  function goNext() {
    if (index < group.statuses.length - 1) {
      setIndex((i) => i + 1);
    } else {
      onClose();
    }
  }

  function goPrev() {
    if (index > 0) {
      setIndex((i) => i - 1);
    } else {
      onClose();
    }
  }

  async function handleShowViewers() {
    setPaused(true);
    const list = await getViewers(current.id);
    setViewers(list);
  }

  async function handleDelete() {
    setPaused(true);
    await deleteStatus(current.id);
    if (group.statuses.length <= 1) onClose();
    else goNext();
  }

  if (!current) return null;

  return (
    <div className="status-viewer-overlay">
      <div className="status-progress-row">
        {group.statuses.map((s, i) => (
          <div className="status-progress-track" key={s.id}>
            <div
              className="status-progress-fill"
              style={{ width: `${i < index ? 100 : i === index ? progress : 0}%` }}
            />
          </div>
        ))}
      </div>

      <div className="status-viewer-header">
        <span className="status-viewer-name">{group.user.username}</span>
        <span className="status-viewer-time">{formatLastSeen(current.created_at)}</span>
        {isOwn && (
          <button className="status-viewer-delete" onClick={handleDelete} aria-label="Delete status">
            🗑
          </button>
        )}
        <button className="status-viewer-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div
        className="status-viewer-content"
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        {current.content_type === 'image' ? (
          <img src={current.media_url} alt="" className="status-viewer-image" />
        ) : (
          <div className="status-viewer-text" style={{ background: current.background_color }}>
            <span>{current.text_content}</span>
          </div>
        )}
        {current.content_type === 'image' && current.text_content && (
          <div className="status-viewer-caption">{current.text_content}</div>
        )}

        <button className="status-nav-zone status-nav-left" onClick={goPrev} aria-label="Previous" />
        <button className="status-nav-zone status-nav-right" onClick={goNext} aria-label="Next" />
      </div>

      {isOwn ? (
        <div className="status-viewer-footer" onClick={handleShowViewers}>
          👁 {current.viewerCount ?? ''} Viewed by
        </div>
      ) : (
        <div className="status-viewer-footer dim">Tap sides to navigate</div>
      )}

      {isOwn && onAddMore && (
        <button className="status-viewer-add-more" onClick={onAddMore}>
          + Add to status
        </button>
      )}

      {viewers && (
        <div className="status-viewers-sheet" onClick={() => setViewers(null)}>
          <div className="status-viewers-list" onClick={(e) => e.stopPropagation()}>
            <h3>Viewed by</h3>
            {viewers.length === 0 && <p className="dim small">No views yet.</p>}
            {viewers.map((v) => (
              <div key={v.viewer_id} className="status-viewer-row">
                <span>{v.viewer?.username}</span>
                <span className="dim small">{formatLastSeen(v.viewed_at)}</span>
              </div>
            ))}
            <button onClick={() => setViewers(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
