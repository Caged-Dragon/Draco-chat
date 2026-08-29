import { useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { FIELD_GROUPS, DEFAULT_THEME } from '../theme/fields.js';
import ThemePreview from './ThemePreview.jsx';

// theme/wallpaperUrl here are only the OVERRIDES for this one chat —
// an empty/unset field means "use the global theme's color instead".
export default function ChatThemeModal({ friend, theme, wallpaperUrl, onChange, onClose }) {
    const { user } = useAuth();
    const { theme: globalTheme } = useTheme();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);

    // What the preview should actually show: this chat's override if
    // set, else the global theme's color, else the hard default.
    const resolved = { ...DEFAULT_THEME, ...globalTheme, ...theme };

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

                <div className="theme-groups">
                    {FIELD_GROUPS.map((group) => (
                        <div className="theme-group" key={group.id}>
                            <h3 className="theme-group-title">{group.title}</h3>
                            <div className="theme-group-body">
                                <ThemePreview type={group.preview} values={resolved} />
                                <div className="field-list">
                                    {group.fields.map((f) => (
                                        <label className="field-row" key={f.key}>
                                            <span>{f.label}</span>
                                            <div className="field-row-controls">
                                                <input
                                                    type="color"
                                                    value={resolved[f.key]}
                                                    onChange={(e) => handleColorChange(f.key, e.target.value)}
                                                />
                                                {theme[f.key] && (
                                                    <button
                                                        type="button"
                                                        className="clear-color-btn"
                                                        onClick={() => handleClearColor(f.key)}
                                                        aria-label={`Reset ${f.label} to global`}
                                                        title="Reset to global theme"
                                                    >
                                                        ↺
                                                    </button>
                                                )}
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}

                    <div className="theme-group">
                        <h3 className="theme-group-title">Wallpaper for this chat</h3>
                        <div className="theme-group-body">
                            <div className="preview-frame">
                                {wallpaperUrl ? (
                                    <img src={wallpaperUrl} alt="Wallpaper preview" className="wallpaper-preview" />
                                ) : (
                                    <span className="preview-tag">Using global</span>
                                )}
                            </div>
                            <div className="field-list">
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
                        </div>
                    </div>
                </div>

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