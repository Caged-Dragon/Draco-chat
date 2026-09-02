import { useCall } from '../contexts/CallContext.jsx';

export default function IncomingCallModal() {
  const { incomingCall, acceptCall, declineCall } = useCall();
  if (!incomingCall) return null;

  return (
    <div className="modal-overlay">
      <div className="incoming-call-card">
        <div className="call-avatar-big pulsing">
          {incomingCall.callerName?.[0]?.toUpperCase() || '?'}
        </div>
        <h2>{incomingCall.callerName}</h2>
        <p className="dim">
          {incomingCall.type === 'video' ? 'Incoming video call' : 'Incoming voice call'}
        </p>
        <div className="incoming-call-actions">
          <button className="call-btn decline" onClick={declineCall} aria-label="Decline">
            ✕
          </button>
          <button className="call-btn accept" onClick={acceptCall} aria-label="Accept">
            📞
          </button>
        </div>
      </div>
    </div>
  );
}
