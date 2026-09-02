import { useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import { PRESENCE_LABELS } from '../utils/format.js';

const STATUS_OPTIONS = ['online', 'away', 'busy', 'dnd'];

export default function ProfileModal({ onClose }) {
  const { user, profile, refreshProfile } = useAuth();
  const [statusMessage, setStatusMessage] = useState(profile?.status_message || '');
  const [presenceStatus, setPresenceStatus] = useState(profile?.presence_status || 'online');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef(null);

  async function handleAvatarPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');

    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
      upsert: true,
    });
    if (uploadError) {
      setError(uploadError.message);
      setBusy(false);
      return;
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: pub.publicUrl })
      .eq('id', user.id);

    if (updateError) setError(updateError.message);
    else await refreshProfile();
    setBusy(false);
  }

  async function handleSave() {
    setBusy(true);
    setError('');
    const { error } = await supabase
      .from('profiles')
      .update({ status_message: statusMessage.trim() || null, presence_status: presenceStatus })
      .eq('id', user.id);

    if (error) {
      setError(error.message);
    } else {
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
    setBusy(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Your profile</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="profile-avatar-row">
          <Avatar url={profile?.avatar_url} name={profile?.username} size={72} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            {busy ? 'Uploading...' : 'Change photo'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarPick}
            hidden
          />
        </div>

        <div className="field-list">
          <label className="field-row field-row-stacked">
            <span>Username</span>
            <input type="text" value={profile?.username || ''} disabled />
          </label>

          <label className="field-row field-row-stacked">
            <span>Status message</span>
            <input
              type="text"
              placeholder="What's on your mind?"
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
              maxLength={80}
            />
          </label>

          <label className="field-row field-row-stacked">
            <span>Status</span>
            <select value={presenceStatus} onChange={(e) => setPresenceStatus(e.target.value)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {PRESENCE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="error-text">{error}</p>}
        {saved && <p className="info-text">Saved!</p>}

        <div className="modal-footer">
          <span />
          <button type="button" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
