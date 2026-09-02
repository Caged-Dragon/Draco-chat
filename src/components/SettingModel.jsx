import { useRef, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { FIELD_GROUPS } from '../theme/fields.js';
import ThemePreview from './ThemePreview.jsx';

export default function SettingsModal({ onClose }) {
    const { theme, wallpaperUrl, updateTheme, uploadWallpaper, clearWallpaper, resetTheme } =
        useTheme();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);

    function handleColorChange(key, value) {
        updateTheme({ [key]: value });
    }

    async function handleWallpaperPick(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setBusy(true);
        setError('');
        const { error } = await uploadWallpaper(file);
        if (error) setError(error.message);
        setBusy(false);
    }

    async function handleReset() {
        setBusy(true);
        await resetTheme();
        setBusy(false);
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>App theme</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                        ✕
                    </button>
                </div>
                <p className="dim small">
                    These colors apply everywhere in Dragon Chat. You can still override
                    any individual chat's look from that chat's own settings.
                </p>

                <div className="theme-groups">
                    {FIELD_GROUPS.map((group) => (
                        <div className="theme-group" key={group.id}>
                            <h3 className="theme-group-title">{group.title}</h3>
                            <div className="theme-group-body">
                                <ThemePreview type={group.preview} values={theme} />
                                <div className="field-list">
                                    {group.fields.map((f) => (
                                        <label className="field-row" key={f.key}>
                                            <span>{f.label}</span>
                                            <input
                                                type="color"
                                                value={theme[f.key] || f.default}
                                                onChange={(e) => handleColorChange(f.key, e.target.value)}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}

                    <div className="theme-group">
                        <h3 className="theme-group-title">Chat wallpaper image</h3>
                        <div className="theme-group-body">
                            <div className="preview-frame">
                                {wallpaperUrl ? (
                                    <img src={wallpaperUrl} alt="Wallpaper preview" className="wallpaper-preview" />
                                ) : (
                                    <span className="preview-tag">No wallpaper</span>
                                )}
                            </div>
                            <div className="field-list">
                                <div className="wallpaper-actions">
                                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                                        {busy ? 'Uploading...' : wallpaperUrl ? 'Change image' : 'Upload image'}
                                    </button>
                                    {wallpaperUrl && (
                                        <button type="button" className="ghost-btn" onClick={clearWallpaper}>
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
                    <button type="button" className="ghost-btn" onClick={handleReset} disabled={busy}>
                        Reset to default
                    </button>
                    <button type="button" onClick={onClose}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}