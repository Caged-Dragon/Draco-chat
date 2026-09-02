// `values` is a plain object of resolved hex colors keyed by CSS
// variable name (e.g. values['--panel']) — never var() references, so
// the preview updates instantly as the person picks colors, with no
// dependency on the real stylesheet.
export default function ThemePreview({ type, values }) {
    const v = (key, fallback) => values[key] || fallback;

    switch (type) {
        case 'page':
            return (
                <div className="preview-frame" style={{ background: v('--bg', '#f6f3ff') }}>
                    <span className="preview-tag">Page</span>
                </div>
            );

        case 'friend-item':
            return (
                <div className="preview-frame" style={{ background: v('--sidebar-bg', '#fff') }}>
                    <div className="preview-friend-item">
                        <div className="preview-avatar" />
                        <span style={{ color: v('--text', '#241a3d'), fontWeight: 600 }}>Ash</span>
                    </div>
                </div>
            );

        case 'card':
            return (
                <div className="preview-frame">
                    <div className="preview-card" style={{ background: v('--panel', '#fff') }}>
                        Card
                    </div>
                </div>
            );

        case 'textbox':
            return (
                <div className="preview-frame">
                    <div
                        className="preview-textbox"
                        style={{ background: v('--panel-alt', '#f3eefc'), color: v('--text', '#241a3d') }}
                    >
                        Type a message...
                    </div>
                </div>
            );

        case 'border':
            return (
                <div className="preview-frame">
                    <div className="preview-bordered" style={{ borderColor: v('--border', '#e6def7') }}>
                        Border
                    </div>
                </div>
            );

        case 'text':
            return (
                <div className="preview-frame">
                    <div>
                        <div style={{ color: v('--text', '#241a3d'), fontWeight: 700, fontSize: 14 }}>
                            Main text
                        </div>
                        <div style={{ color: v('--text-dim', '#7c718f'), fontSize: 12 }}>Secondary text</div>
                    </div>
                </div>
            );

        case 'button':
            return (
                <div className="preview-frame">
                    <button
                        className="preview-button"
                        style={{
                            background: `linear-gradient(135deg, ${v('--accent-from', '#ef4444')}, ${v(
                                '--accent-to',
                                '#8b5cf6'
                            )})`,
                        }}
                    >
                        Send
                    </button>
                </div>
            );

        case 'chatbg':
            return (
                <div className="preview-frame">
                    <div className="preview-chatbg" style={{ background: v('--chat-bg-color', '#f6f3ff') }}>
                        Chat area
                    </div>
                </div>
            );

        case 'bubble-mine':
            return (
                <div className="preview-frame preview-frame-end">
                    <div
                        className="preview-bubble"
                        style={{
                            background: v('--bubble-mine-bg', '#ef4444'),
                            color: v('--bubble-mine-text', '#ffffff'),
                            borderBottomRightRadius: 4,
                        }}
                    >
                        Hey there! 👋
                    </div>
                </div>
            );

        case 'bubble-theirs':
            return (
                <div className="preview-frame preview-frame-start">
                    <div
                        className="preview-bubble"
                        style={{
                            background: v('--bubble-theirs-bg', '#ffffff'),
                            color: v('--bubble-theirs-text', '#241a3d'),
                            border: `1px solid ${v('--border', '#e6def7')}`,
                            borderBottomLeftRadius: 4,
                        }}
                    >
                        Hi! 👋
                    </div>
                </div>
            );

        default:
            return null;
    }
}