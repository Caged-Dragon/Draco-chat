import { useEffect, useRef, useState } from 'react';

// GIF search is powered by GIPHY (Tenor's API was shut down in 2026).
// Get a free key at https://developers.giphy.com and set VITE_GIPHY_API_KEY.
const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY;

// The GIF buttons in the chat windows only render when a key is configured.
export const gifsEnabled = Boolean(GIPHY_KEY);

const API = 'https://api.giphy.com/v1/gifs';

export default function GifPicker({ onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  async function load(term) {
    setLoading(true);
    setError('');
    try {
      const url = term.trim()
        ? `${API}/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(term)}&limit=20&rating=pg-13&lang=en`
        : `${API}/trending?api_key=${GIPHY_KEY}&limit=20&rating=pg-13`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'GIF search failed');
      setResults(data.data || []);
    } catch (err) {
      setError(err.message || 'GIF search failed');
    }
    setLoading(false);
  }

  // Show trending GIFs as soon as the picker opens
  useEffect(() => {
    load('');
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(e) {
    const value = e.target.value;
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(value), 400);
  }

  return (
    <div className="gif-picker">
      <div className="gif-picker-search">
        <input type="text" placeholder="Search GIFs..." value={query} onChange={handleChange} autoFocus />
        <button type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      {loading && <p className="dim small">Loading...</p>}
      {error && <p className="error-text small">{error}</p>}
      <div className="gif-picker-grid">
        {results.map((g) => {
          const url = g.images?.fixed_height?.url || g.images?.original?.url;
          const preview = g.images?.fixed_height_small?.url || url;
          if (!url) return null;
          return (
            <button key={g.id} type="button" className="gif-picker-item" onClick={() => onSelect(url)}>
              <img src={preview} alt={g.title || 'GIF'} loading="lazy" />
            </button>
          );
        })}
      </div>
      {!loading && query.trim() && results.length === 0 && !error && <p className="dim small">No GIFs found.</p>}
      <p className="dim small gif-attribution">Powered by GIPHY</p>
    </div>
  );
}
