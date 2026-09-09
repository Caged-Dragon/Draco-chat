import { useEffect, useState } from 'react';

const DISMISS_KEY = 'dragonchat-install-dismissed-at';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SHOW_DELAY_MS = 2500;

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // iOS Safari's own flag
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

function recentlyDismissed() {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  return Date.now() - Number(raw) < DISMISS_COOLDOWN_MS;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [showIOSSteps, setShowIOSSteps] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    // Chrome/Edge/Android fire this when the site meets install
    // criteria — capture it so we can trigger the native prompt from
    // our own styled button instead of the browser's default banner.
    function handleBeforeInstall(e) {
      e.preventDefault();
      setDeferredPrompt(e);
      setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // iOS never fires beforeinstallprompt — there's no programmatic
    // install API, only the manual Share -> Add to Home Screen flow.
    // Show our own instructions instead after the same delay.
    let iosTimer;
    if (isIOS()) {
      iosTimer = setTimeout(() => {
        setShowIOSSteps(true);
        setVisible(true);
      }, SHOW_DELAY_MS);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="install-prompt-overlay" onClick={dismiss}>
      <div className="install-prompt-card" onClick={(e) => e.stopPropagation()}>
        <img src="/logo.png" alt="Dragon Chat" className="install-prompt-logo" />
        <div className="install-prompt-text">
          <h3>Install Dragon Chat</h3>
          <p>Add it to your home screen for quick, full-screen access — like a real app.</p>
        </div>

        {showIOSSteps ? (
          <div className="install-prompt-ios-steps">
            <p>
              Tap <strong>Share</strong> <span className="install-ios-icon">⬆️</span> then{' '}
              <strong>Add to Home Screen</strong>.
            </p>
            <button onClick={dismiss}>Got it</button>
          </div>
        ) : (
          <div className="install-prompt-actions">
            <button className="ghost-btn" onClick={dismiss}>
              Not now
            </button>
            <button onClick={handleInstall}>Install</button>
          </div>
        )}
      </div>
    </div>
  );
}
