// Every customizable color in the app, expressed as a CSS custom
// property. Both the global Settings modal and the per-chat theme
// modal render inputs from this same list, so adding a new
// customizable color only ever needs to happen in one place.
export const COLOR_FIELDS = [
    { key: '--bg', label: 'Page background', default: '#f6f3ff' },
    { key: '--sidebar-bg', label: 'Sidebar / friends list background', default: '#ffffff' },
    { key: '--panel', label: 'Card / panel background', default: '#ffffff' },
    { key: '--panel-alt', label: 'Text box background', default: '#f3eefc' },
    { key: '--border', label: 'Border color', default: '#e6def7' },
    { key: '--text', label: 'Main text color', default: '#241a3d' },
    { key: '--text-dim', label: 'Secondary text color', default: '#7c718f' },
    { key: '--accent-from', label: 'Accent gradient — start', default: '#ef4444' },
    { key: '--accent-to', label: 'Accent gradient — end', default: '#8b5cf6' },
    { key: '--chat-bg-color', label: 'Chat background color', default: '#f6f3ff' },
    { key: '--bubble-mine-bg', label: 'Your message bubble', default: '#ef4444' },
    { key: '--bubble-mine-text', label: 'Your message text', default: '#ffffff' },
    { key: '--bubble-theirs-bg', label: "Friend's message bubble", default: '#ffffff' },
    { key: '--bubble-theirs-text', label: "Friend's message text", default: '#241a3d' },
];

export const DEFAULT_THEME = COLOR_FIELDS.reduce((acc, f) => {
    acc[f.key] = f.default;
    return acc;
}, {});

// The rest of the stylesheet references a single var(--gradient) for
// every accent use (buttons, active states, "mine" bubbles, etc).
// Since accent color is edited as two separate pickers (start/end),
// this combines them into that one gradient value.
// Returns undefined if neither accent color is present in `theme` —
// used for per-chat overrides, where "not present" should mean
// "inherit the global gradient" rather than reset to defaults.
export function computeGradient(theme) {
    const from = theme['--accent-from'];
    const to = theme['--accent-to'];
    if (!from && !to) return undefined;
    return `linear-gradient(135deg, ${from || DEFAULT_THEME['--accent-from']} 0%, ${to || DEFAULT_THEME['--accent-to']
        } 100%)`;
}