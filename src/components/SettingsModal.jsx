import { useRef, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { THEME_TABS, DARK_THEME, DEFAULT_THEME } from '../theme/fields.js';
import AppPreviewMock from './AppPreviewMock.jsx';

export default function SettingsModal({ onClose }) {
  const { theme, wallpaperUrl, updateTheme, uploadWallpaper, clearWallpaper, resetTheme } =
    useTheme();
  const [activeTab, setActiveTab] = useState(THEME_TABS[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const currentTab = THEME_TABS.find((t) => t.id === activeTab);

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
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>App theme</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="preset-row">
          <span className="dim small">Quick presets:</span>
          <button type="button" className="preset-btn" onClick={() => updateTheme(DEFAULT_THEME)}>
            ☀️ Light
          </button>
          <button type="button" className="preset-btn" onClick={() => updateTheme(DARK_THEME)}>
            🌙 Dark
          </button>
        </div>

        <AppPreviewMock values={theme} wallpaperUrl={wallpaperUrl} />

        <div className="theme-tabs">
          {THEME_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <span className="theme-tab-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
          <button
            type="button"
            className={`theme-tab ${activeTab === 'wallpaper' ? 'active' : ''}`}
            onClick={() => setActiveTab('wallpaper')}
          >
            <span className="theme-tab-icon">🖼️</span>
            Wallpaper
          </button>
        </div>

        <div className="theme-tab-panel">
          {activeTab === 'wallpaper' ? (
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
          ) : (
            <div className="field-list">
              {currentTab.fields.map((f) => (
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
          )}
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
