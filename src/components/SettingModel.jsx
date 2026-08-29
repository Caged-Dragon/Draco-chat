import { useRef, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { COLOR_FIELDS } from '../theme/fields.js';

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

                <div className="color-grid">
                    {COLOR_FIELDS.map((f) => (
                        <label className="color-field" key={f.key}>
                            <span>{f.label}</span>
                            <input
                                type="color"
                                value={theme[f.key] || f.default}
                                onChange={(e) => handleColorChange(f.key, e.target.value)}
                            />
                        </label>
                    ))}
                </div>

                <div className="wallpaper-row">
                    <span>Chat wallpaper image</span>
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
                {wallpaperUrl && <img src={wallpaperUrl} alt="Wallpaper preview" className="wallpaper-preview" />}

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