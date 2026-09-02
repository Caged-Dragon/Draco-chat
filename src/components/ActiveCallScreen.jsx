import { useEffect, useRef, useState } from 'react';
import { useCall } from '../contexts/CallContext.jsx';

export default function ActiveCallScreen() {
  const {
    callState,
    callType,
    remoteName,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    screenSharing,
    error,
    endCall,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
  } = useCall();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream || null;
  }, [localStream]);

  useEffect(() => {
    if (callType === 'video' && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream || null;
    }
    if (callType === 'audio' && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream || null;
    }
  }, [remoteStream, callType]);

  useEffect(() => {
    if (callState !== 'connected') {
      setSeconds(0);
      return;
    }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [callState]);

  if (callState === 'idle') return null;

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const statusText =
    callState === 'connected' ? `${mm}:${ss}` : callState === 'calling' ? 'Calling...' : 'Connecting...';

  return (
    <div className="call-overlay">
      {callType === 'video' ? (
        <>
          <video ref={remoteVideoRef} autoPlay playsInline className="call-remote-video" />
          <video ref={localVideoRef} autoPlay playsInline muted className="call-local-video" />
        </>
      ) : (
        <audio ref={remoteAudioRef} autoPlay />
      )}

      <div className="call-info">
        {callType !== 'video' && (
          <div className="call-avatar-big">{remoteName?.[0]?.toUpperCase() || '?'}</div>
        )}
        <div className="call-name">{remoteName}</div>
        <div className="call-status">
          {statusText}
          {screenSharing && ' · Sharing screen'}
        </div>
        {error && <div className="call-error">{error}</div>}
      </div>

      <div className="call-controls">
        <button
          className={`call-btn ${muted ? 'active' : ''}`}
          onClick={toggleMute}
          aria-label="Toggle mute"
        >
          {muted ? '🔇' : '🎙️'}
        </button>
        {callType === 'video' && (
          <>
            <button
              className={`call-btn ${cameraOff ? 'active' : ''}`}
              onClick={toggleCamera}
              aria-label="Toggle camera"
            >
              {cameraOff ? '📷' : '🎥'}
            </button>
            <button
              className={`call-btn ${screenSharing ? 'active' : ''}`}
              onClick={toggleScreenShare}
              aria-label="Share screen"
              title="Share screen"
            >
              🖥️
            </button>
          </>
        )}
        <button className="call-btn end" onClick={endCall} aria-label="End call">
          📞
        </button>
      </div>
    </div>
  );
}
