import { useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext.jsx';
import { COLOR_FIELDS } from '../theme/fields.js';

// theme/wallpaperUrl here are only the OVERRIDES for this one chat —
// an empty/unset field means "use the global theme's color instead".
export default function ChatThemeModal({ friend, theme, wallpaperUrl, onChange, onClose }) {
    const { user } = useAuth();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);

    async function saveTheme(nextTheme, nextWallpaperUrl) {
        const { error } = await supabase.from('chat_settings').upsert(
            {
                owner_id: user.id,
                friend_id: friend.id,
                theme: nextTheme,
                wallpaper_url: nextWallpaperUrl,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'owner_id,friend_id' }
        );
        if (error) {
            setError(error.message);
            return;
        }
        onChange(nextTheme, nextWallpaperUrl);
    }

    function handleColorChange(key, value) {
        saveTheme({ ...theme, [key]: value }, wallpaperUrl);
    }

    function handleClearColor(key) {
        const next = { ...theme };
        delete next[key];
        saveTheme(next, wallpaperUrl);
    }

    async function handleWallpaperPick(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setBusy(true);
        setError('');

        const path = `${user.id}/chat-${friend.id}-${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
            .from('chat-wallpapers')
            .upload(path, file, { upsert: true });

        if (uploadError) {
            setError(uploadError.message);
            setBusy(false);
            return;
        }

        const { data: pub } = supabase.storage.from('chat-wallpapers').getPublicUrl(path);
        await saveTheme(theme, pub.publicUrl);
        setBusy(false);
    }

    async function handleResetAll() {
        setBusy(true);
        await saveTheme({}, null);
        setBusy(false);
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Chat settings — {friend.username}</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                        ✕
                    </button>
                </div>
                <p className="dim small">
                    These only change how this one conversation looks for you. Leave a
                    color untouched to keep using your global theme.
                </p>

                <div className="color-grid">
                    {COLOR_FIELDS.map((f) => (
                        <label className="color-field" key={f.key}>
                            <span>{f.label}</span>
                            <div className="color-field-controls">
                                <input
                                    type="color"
                                    value={theme[f.key] || f.default}
                                    onChange={(e) => handleColorChange(f.key, e.target.value)}
                                />
                                {theme[f.key] && (
                                    <button
                                        type="button"
                                        className="clear-color-btn"
                                        onClick={() => handleClearColor(f.key)}
                                        aria-label={`Reset ${f.label} to global`}
                                    >
                                        ↺
                                    </button>
                                )}
                            </div>
                        </label>
                    ))}
                </div>

                <div className="wallpaper-row">
                    <span>Wallpaper for this chat</span>
                    <div className="wallpaper-actions">
                        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                            {busy ? 'Uploading...' : wallpaperUrl ? 'Change image' : 'Upload image'}
                        </button>
                        {wallpaperUrl && (
                            <button type="button" className="ghost-btn" onClick={() => saveTheme(theme, null)}>
                                Remove
                            </button>
                        )}
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleWallpaperPick}
                        hidden
                    />
                </div>
                {wallpaperUrl && <img src={wallpaperUrl} alt="Wallpaper preview" className="wallpaper-preview" />}

                {error && <p className="error-text">{error}</p>}

                <div className="modal-footer">
                    <button type="button" className="ghost-btn" onClick={handleResetAll} disabled={busy}>
                        Reset this chat
                    </button>
                    <button type="button" onClick={onClose}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}