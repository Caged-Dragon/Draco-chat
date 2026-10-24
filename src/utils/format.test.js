import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatLastSeen, linkifyParts, PRESENCE_LABELS } from './format.js';

afterEach(() => vi.useRealTimers());

describe('formatLastSeen', () => {
  it('handles a missing timestamp', () => {
    expect(formatLastSeen(null)).toBe('a while ago');
  });

  it('formats minutes, hours and days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
    expect(formatLastSeen('2026-10-24T11:59:40Z')).toBe('just now');
    expect(formatLastSeen('2026-10-24T11:15:00Z')).toBe('45m ago');
    expect(formatLastSeen('2026-10-24T07:00:00Z')).toBe('5h ago');
    expect(formatLastSeen('2026-10-21T12:00:00Z')).toBe('3d ago');
  });
});

describe('linkifyParts', () => {
  it('returns nothing for empty text', () => {
    expect(linkifyParts('')).toEqual([]);
  });

  it('splits text and links in order', () => {
    const parts = linkifyParts('see https://example.com now');
    expect(parts.map((p) => p.type)).toEqual(['text', 'link', 'text']);
    expect(parts[1].text).toBe('https://example.com');
  });

  it('keeps plain text as one part', () => {
    expect(linkifyParts('hello there')).toHaveLength(1);
  });
});

describe('PRESENCE_LABELS', () => {
  it('covers every status the database allows', () => {
    expect(Object.keys(PRESENCE_LABELS).sort()).toEqual(['away', 'busy', 'dnd', 'offline', 'online']);
  });
});
