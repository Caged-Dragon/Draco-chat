import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function SearchFriends({ onRequestSent }) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState('');

  async function handleSearch(e) {
    e.preventDefault();
    setMessage('');
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', `%${query.trim()}%`)
      .neq('id', user.id)
      .limit(10);

    if (error) {
      setMessage(error.message);
      return;
    }
    setResults(data);
  }

  async function sendRequest(addresseeId) {
    setMessage('');
    const { error } = await supabase.from('friendships').insert([
      { requester_id: user.id, addressee_id: addresseeId },
    ]);

    if (error) {
      if (error.code === '23505') {
        setMessage('Request already sent (or you\u2019re already friends).');
      } else {
        setMessage(error.message);
      }
      return;
    }

    setMessage('Friend request sent!');
    onRequestSent?.();
  }

  return (
    <div className="search-friends">
      <form onSubmit={handleSearch}>
        <input
          type="text"
          placeholder="Search by username"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>

      {message && <p className="info-text small">{message}</p>}

      {results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.id}>
              <span>{r.username}</span>
              <button onClick={() => sendRequest(r.id)}>Add</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
