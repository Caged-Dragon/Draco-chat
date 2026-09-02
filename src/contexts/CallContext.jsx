import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext.jsx';

const CallContext = createContext(null);

// Public STUN servers, plus an optional TURN server read from env vars
// (VITE_TURN_URL / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL). Without
// a TURN server, calls across some strict corporate/carrier NATs may
// fail to connect — set those three env vars (e.g. from a provider
// like Twilio or Metered.ca) to close that gap.
const TURN_URL = import.meta.env.VITE_TURN_URL;
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME;
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL;

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...(TURN_URL ? [{ urls: TURN_URL, username: TURN_USERNAME, credential: TURN_CREDENTIAL }] : []),
];

const RING_TIMEOUT_MS = 30000;

export function CallProvider({ children }) {
  const { user, profile } = useAuth();

  const [incomingCall, setIncomingCall] = useState(null); // {callId, callerId, callerName, type, offer}
  const [callState, setCallState] = useState('idle'); // idle | calling | connecting | connected
  const [callType, setCallType] = useState(null); // 'audio' | 'video'
  const [remoteName, setRemoteName] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [error, setError] = useState('');

  const pcRef = useRef(null);
  const callChannelRef = useRef(null);
  const callIdRef = useRef(null);
  const ringTimeoutRef = useRef(null);
  const callStateRef = useRef('idle');
  const pendingCandidatesRef = useRef([]);
  const localStreamRef = useRef(null);
  const cameraTrackRef = useRef(null);

  // For call-history logging
  const callerIdRef = useRef(null);
  const calleeIdRef = useRef(null);
  const callTypeForLogRef = useRef(null);
  const connectedAtRef = useRef(null);
  const statusRef = useRef('missed'); // 'completed' | 'missed' | 'declined'

  function updateCallState(next) {
    callStateRef.current = next;
    setCallState(next);
  }

  // Always-on personal channel: this is how a call "rings" — the
  // caller broadcasts here, and only someone actively subscribed
  // (i.e. logged in with the app open) will receive it.
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`signal-${user.id}`);
    channel
      .on('broadcast', { event: 'incoming-call' }, ({ payload }) => {
        setIncomingCall(payload);
      })
      .on('broadcast', { event: 'cancel-call' }, ({ payload }) => {
        setIncomingCall((cur) => (cur && cur.callId === payload.callId ? null : cur));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  async function logCallHistory() {
    if (!callerIdRef.current || !calleeIdRef.current) return;
    const duration = connectedAtRef.current
      ? Math.round((Date.now() - connectedAtRef.current) / 1000)
      : 0;

    await supabase.from('calls').insert({
      caller_id: callerIdRef.current,
      callee_id: calleeIdRef.current,
      call_type: callTypeForLogRef.current || 'audio',
      status: statusRef.current,
      duration_seconds: duration,
    });

    callerIdRef.current = null;
    calleeIdRef.current = null;
    callTypeForLogRef.current = null;
    connectedAtRef.current = null;
    statusRef.current = 'missed';
  }

  function cleanupCall() {
    logCallHistory();

    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    ringTimeoutRef.current = null;
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (callChannelRef.current) {
      supabase.removeChannel(callChannelRef.current);
      callChannelRef.current = null;
    }
    pendingCandidatesRef.current = [];
    callIdRef.current = null;
    cameraTrackRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallType(null);
    setRemoteName('');
    setMuted(false);
    setCameraOff(false);
    setScreenSharing(false);
    updateCallState('idle');
  }

  function createPeerConnection(onIceCandidate) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate) onIceCandidate(e.candidate);
    };
    pc.ontrack = (e) => {
      setRemoteStream((prev) => {
        const stream = prev || new MediaStream();
        stream.addTrack(e.track);
        return stream;
      });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        if (!connectedAtRef.current) connectedAtRef.current = Date.now();
        statusRef.current = 'completed';
        updateCallState('connected');
      }
    };
    return pc;
  }

  const startCall = useCallback(
    async (friend, type) => {
      if (callStateRef.current !== 'idle') return;
      setError('');
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'video',
        });
      } catch {
        setError('Could not access camera/microphone.');
        return;
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      setCallType(type);
      setRemoteName(friend.username);
      updateCallState('calling');

      callerIdRef.current = user.id;
      calleeIdRef.current = friend.id;
      callTypeForLogRef.current = type;
      statusRef.current = 'missed';

      const callId = crypto.randomUUID();
      callIdRef.current = callId;

      const callChannel = supabase.channel(`call-${callId}`);
      callChannelRef.current = callChannel;

      const pc = createPeerConnection((candidate) => {
        callChannel.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: { from: 'caller', candidate },
        });
      });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      callChannel
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
          for (const c of pendingCandidatesRef.current) await pc.addIceCandidate(c);
          pendingCandidatesRef.current = [];
          if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
          updateCallState('connecting'); // connected fires from onconnectionstatechange
        })
        .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
          if (payload.from !== 'callee') return;
          const candidate = new RTCIceCandidate(payload.candidate);
          if (pc.remoteDescription) await pc.addIceCandidate(candidate);
          else pendingCandidatesRef.current.push(candidate);
        })
        .on('broadcast', { event: 'reject' }, () => {
          statusRef.current = 'declined';
          setError(`${friend.username} declined the call.`);
          cleanupCall();
        })
        .on('broadcast', { event: 'end' }, () => {
          cleanupCall();
        })
        .subscribe(async (status) => {
          if (status !== 'SUBSCRIBED') return;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          const pingChannel = supabase.channel(`signal-${friend.id}`);
          pingChannel.subscribe((pingStatus) => {
            if (pingStatus !== 'SUBSCRIBED') return;
            pingChannel.send({
              type: 'broadcast',
              event: 'incoming-call',
              payload: {
                callId,
                callerId: user.id,
                callerName: profile?.username || 'Someone',
                type,
                offer: pc.localDescription,
              },
            });
            supabase.removeChannel(pingChannel);
          });

          ringTimeoutRef.current = setTimeout(() => {
            if (callStateRef.current === 'calling') {
              // Clear the ringing popup on the other end too
              const cancelChannel = supabase.channel(`signal-${friend.id}`);
              cancelChannel.subscribe((s) => {
                if (s !== 'SUBSCRIBED') return;
                cancelChannel.send({
                  type: 'broadcast',
                  event: 'cancel-call',
                  payload: { callId },
                });
                supabase.removeChannel(cancelChannel);
              });
              setError('No answer.');
              cleanupCall();
            }
          }, RING_TIMEOUT_MS);
        });
    },
    [user, profile]
  );

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    const { callId, callerId, callerName, type, offer } = incomingCall;
    setIncomingCall(null);
    setError('');

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
    } catch {
      setError('Could not access camera/microphone.');
      return;
    }

    localStreamRef.current = stream;
    setLocalStream(stream);
    setCallType(type);
    setRemoteName(callerName);
    updateCallState('connecting');
    callIdRef.current = callId;

    callerIdRef.current = callerId;
    calleeIdRef.current = user.id;
    callTypeForLogRef.current = type;
    statusRef.current = 'completed';

    const callChannel = supabase.channel(`call-${callId}`);
    callChannelRef.current = callChannel;

    const pc = createPeerConnection((candidate) => {
      callChannel.send({
        type: 'broadcast',
        event: 'ice-candidate',
        payload: { from: 'callee', candidate },
      });
    });
    pcRef.current = pc;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    callChannel
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.from !== 'caller') return;
        const candidate = new RTCIceCandidate(payload.candidate);
        if (pc.remoteDescription) await pc.addIceCandidate(candidate);
        else pendingCandidatesRef.current.push(candidate);
      })
      .on('broadcast', { event: 'end' }, () => {
        cleanupCall();
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        for (const c of pendingCandidatesRef.current) await pc.addIceCandidate(c);
        pendingCandidatesRef.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        callChannel.send({ type: 'broadcast', event: 'answer', payload: { answer } });
      });
  }, [incomingCall, user]);

  const declineCall = useCallback(() => {
    if (!incomingCall) return;
    const { callId, callerId, type } = incomingCall;
    setIncomingCall(null);

    // Log this as a declined call even though we never fully connect
    callerIdRef.current = callerId;
    calleeIdRef.current = user.id;
    callTypeForLogRef.current = type;
    statusRef.current = 'declined';
    logCallHistory();

    const ch = supabase.channel(`call-${callId}`);
    ch.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      ch.send({ type: 'broadcast', event: 'reject', payload: {} });
      supabase.removeChannel(ch);
    });
  }, [incomingCall, user]);

  const endCall = useCallback(() => {
    if (callChannelRef.current) {
      callChannelRef.current.send({ type: 'broadcast', event: 'end', payload: {} });
    }
    cleanupCall();
  }, []);

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  }

  function toggleCamera() {
    setCameraOff((c) => {
      const next = !c;
      localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  }

  async function toggleScreenShare() {
    if (!pcRef.current) return;

    if (screenSharing) {
      const sender = pcRef.current.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender && cameraTrackRef.current) await sender.replaceTrack(cameraTrackRef.current);
      setScreenSharing(false);
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      const sender = pcRef.current.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        cameraTrackRef.current = sender.track;
        await sender.replaceTrack(screenTrack);
      }
      screenTrack.onended = () => toggleScreenShare();
      setScreenSharing(true);
    } catch {
      setError('Could not start screen sharing.');
    }
  }

  return (
    <CallContext.Provider
      value={{
        incomingCall,
        callState,
        callType,
        remoteName,
        localStream,
        remoteStream,
        muted,
        cameraOff,
        screenSharing,
        error,
        startCall,
        acceptCall,
        declineCall,
        endCall,
        toggleMute,
        toggleCamera,
        toggleScreenShare,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  return useContext(CallContext);
}
