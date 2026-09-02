export function formatLastSeen(iso) {
  if (!iso) return 'a while ago';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatMessageTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const PRESENCE_LABELS = {
  online: 'Online',
  away: 'Away',
  busy: 'Busy',
  dnd: 'Do Not Disturb',
  offline: 'Offline',
};

// A small, curated emoji set — not a full emoji library, just enough
// for quick reactions and message composition.
export const QUICK_EMOJIS = [
  '😀', '😂', '😍', '😢', '😮', '😡', '👍', '👎', '❤️', '🔥',
  '🎉', '🙏', '👏', '😎', '🤔', '😴', '🥳', '💀', '😅', '🙌',
];

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// Turns any http(s) URL inside a message into a clickable link. Full
// rich-preview unfurling (fetching the page title/image) would need a
// backend fetcher to get around CORS, which this app doesn't have —
// so links are clickable but not shown as preview cards.
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export function linkifyParts(text) {
  if (!text) return [];
  // String.split with a capturing group keeps the matches in the
  // output, alternating: [text, url, text, url, ...] — so odd indices
  // are always the captured URLs, never re-run the regex to check.
  return text
    .split(URL_REGEX)
    .map((part, i) => ({ type: i % 2 === 1 ? 'link' : 'text', text: part, key: i }))
    .filter((p) => p.text !== '');
}
