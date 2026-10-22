import { useRef, useState } from 'react';

const TENOR_KEY = import.meta.env.VITE_TENOR_API_KEY || 'LIVDSRZULELA';

export default function GifPicker({ onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  async function runSearch(term) {
    if (!term.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(term)}&key=${TENOR_KEY}&client_key=dragon_chat&limit=20&media_filter=gif`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'GIF search failed');
      setResults(data.results || []);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  function handleChange(e) {
    const value = e.target.value;
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), 400);
  }

  return (
    <div className="gif-picker">
      <div className="gif-picker-search">
        <input
          type="text"
          placeholder="Search GIFs..."
          value={query}
          onChange={handleChange}
          autoFocus
        />
        <button type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      {loading && <p className="dim small">Searching...</p>}
      {error && <p className="error-text small">{error}</p>}
      <div className="gif-picker-grid">
        {results.map((g) => {
          const url = g.media_formats?.gif?.url || g.media_formats?.tinygif?.url;
          const preview = g.media_formats?.tinygif?.url || url;
          if (!url) return null;
          return (
            <button
              key={g.id}
              type="button"
              className="gif-picker-item"
              onClick={() => onSelect(url)}
            >
              <img src={preview} alt={g.content_description || 'GIF'} />
            </button>
          );
        })}
      </div>
      {!loading && query.trim() && results.length === 0 && !error && (
        <p className="dim small">No GIFs found.</p>
      )}
    </div>
  );
}
