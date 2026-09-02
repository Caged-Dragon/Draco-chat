import { createContext, useContext, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext.jsx';

const GroupCallContext = createContext(null);

const TURN_URL = import.meta.env.VITE_TURN_URL;
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME;
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL;

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...(TURN_URL ? [{ urls: TURN_URL, username: TURN_USERNAME, credential: TURN_CREDENTIAL }] : []),
];

// This is a full-mesh call: every participant connects directly to
// every other participant. That's simple and needs no media server,
// but bandwidth/CPU cost grows with each additional person — it works
// well for small groups (roughly up to 5-6 people) and degrades past
// that, unlike a "real" group call service which routes everyone
// through a central media server (SFU).
export function GroupCallProvider({ children }) {
  const { user, profile } = useAuth();

  const [activeCall, setActiveCall] = useState(null); // {groupId, groupName, type}
  const [participants, setParticipants] = useState({}); // { [userId]: { stream, username } }
  const [localStream, setLocalStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [error, setError] = useState('');

  const channelRef = useRef(null);
  const pcsRef = useRef(new Map()); // userId -> RTCPeerConnection
  const pendingCandidatesRef = useRef(new Map()); // userId -> RTCIceCandidate[]
  const localStreamRef = useRef(null);
  const namesRef = useRef({}); // userId -> username, from presence payload

  function getOrCreatePeer(peerId) {
    if (pcsRef.current.has(peerId)) return pcsRef.current.get(peerId);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: { from: user.id, to: peerId, candidate: e.candidate },
        });
      }
    };
    pc.ontrack = (e) => {
      setParticipants((prev) => {
        const existing = prev[peerId]?.stream || new MediaStream();
        existing.addTrack(e.track);
        return { ...prev, [peerId]: { stream: existing, username: namesRef.current[peerId] || '?' } };
      });
    };
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));
    }
    pcsRef.current.set(peerId, pc);
    return pc;
  }

  async function flushPending(peerId, pc) {
    const list = pendingCandidatesRef.current.get(peerId) || [];
    for (const c of list) await pc.addIceCandidate(c);
    pendingCandidatesRef.current.set(peerId, []);
  }

  async function connectToPeer(peerId) {
    const pc = getOrCreatePeer(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'offer',
      payload: { from: user.id, to: peerId, sdp: offer },
    });
  }

  async function joinCall(group, type) {
    if (activeCall) return;
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
    setActiveCall({ groupId: group.id, groupName: group.name, type });

    const channel = supabase.channel(`groupcall-${group.id}`, {
      config: { presence: { key: user.id } },
    });
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (payload.to !== user.id) return;
        const pc = getOrCreatePeer(payload.from);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        await flushPending(payload.from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        channel.send({
          type: 'broadcast',
          event: 'answer',
          payload: { from: user.id, to: payload.from, sdp: answer },
        });
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload.to !== user.id) return;
        const pc = pcsRef.current.get(payload.from);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        await flushPending(payload.from, pc);
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.to !== user.id) return;
        const candidate = new RTCIceCandidate(payload.candidate);
        const pc = pcsRef.current.get(payload.from);
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(candidate);
        } else {
          const list = pendingCandidatesRef.current.get(payload.from) || [];
          list.push(candidate);
          pendingCandidatesRef.current.set(payload.from, list);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        Object.entries(state).forEach(([peerId, metas]) => {
          if (peerId === user.id) return;
          namesRef.current[peerId] = metas[0]?.username || namesRef.current[peerId];
          // Deterministic tie-break: the lexicographically smaller id
          // always initiates, so both sides don't race to offer.
          if (!pcsRef.current.has(peerId) && user.id < peerId) {
            connectToPeer(peerId);
          } else if (!pcsRef.current.has(peerId)) {
            getOrCreatePeer(peerId); // ready to receive their offer
          }
        });
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        const pc = pcsRef.current.get(key);
        if (pc) {
          pc.close();
          pcsRef.current.delete(key);
        }
        setParticipants((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ username: profile?.username || 'Someone' });
        }
      });
  }

  function leaveCall() {
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    pendingCandidatesRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setLocalStream(null);
    setParticipants({});
    setActiveCall(null);
    setMuted(false);
    setCameraOff(false);
  }

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

  return (
    <GroupCallContext.Provider
      value={{
        activeCall,
        participants,
        localStream,
        muted,
        cameraOff,
        error,
        joinCall,
        leaveCall,
        toggleMute,
        toggleCamera,
      }}
    >
      {children}
    </GroupCallContext.Provider>
  );
}

export function useGroupCall() {
  return useContext(GroupCallContext);
}
