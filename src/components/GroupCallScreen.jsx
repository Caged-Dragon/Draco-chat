import { useEffect, useRef } from 'react';
import { useGroupCall } from '../contexts/GroupCallContext.jsx';

function ParticipantTile({ stream, username, isVideo }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null;
  }, [stream]);

  return (
    <div className="group-call-tile">
      {isVideo ? (
        <video ref={videoRef} autoPlay playsInline className="group-call-video" />
      ) : (
        <div className="call-avatar-big">{username?.[0]?.toUpperCase() || '?'}</div>
      )}
      <span className="group-call-tile-name">{username}</span>
    </div>
  );
}

export default function GroupCallScreen() {
  const { activeCall, participants, localStream, muted, cameraOff, error, leaveCall, toggleMute, toggleCamera } =
    useGroupCall();
  const localVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream || null;
  }, [localStream]);

  if (!activeCall) return null;
  const isVideo = activeCall.type === 'video';
  const list = Object.entries(participants);

  return (
    <div className="call-overlay group-call-overlay">
      <div className="group-call-header">
        <span>{activeCall.groupName}</span>
      </div>

      <div className="group-call-grid">
        <div className="group-call-tile">
          {isVideo ? (
            <video ref={localVideoRef} autoPlay playsInline muted className="group-call-video" />
          ) : (
            <div className="call-avatar-big">You</div>
          )}
          <span className="group-call-tile-name">You</span>
        </div>
        {list.map(([id, p]) => (
          <ParticipantTile key={id} stream={p.stream} username={p.username} isVideo={isVideo} />
        ))}
      </div>

      {error && <div className="call-error">{error}</div>}

      <div className="call-controls">
        <button className={`call-btn ${muted ? 'active' : ''}`} onClick={toggleMute} aria-label="Toggle mute">
          {muted ? '🔇' : '🎙️'}
        </button>
        {isVideo && (
          <button
            className={`call-btn ${cameraOff ? 'active' : ''}`}
            onClick={toggleCamera}
            aria-label="Toggle camera"
          >
            {cameraOff ? '📷' : '🎥'}
          </button>
        )}
        <button className="call-btn end" onClick={leaveCall} aria-label="Leave call">
          📞
        </button>
      </div>
    </div>
  );
}
