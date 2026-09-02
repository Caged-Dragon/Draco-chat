export default function Avatar({ url, name, size = 36, online, showStatusDot = false }) {
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?';

  return (
    <span className="avatar-wrap" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt={name || 'avatar'} className="avatar-img" />
      ) : (
        <span className="avatar-fallback">{initial}</span>
      )}
      {showStatusDot && (
        <span className={`avatar-status-dot ${online ? 'online' : 'offline'}`} />
      )}
    </span>
  );
}
