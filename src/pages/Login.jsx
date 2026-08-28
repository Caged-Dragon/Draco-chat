import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);

    if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) setError(error.message);
    } else {
      if (!username.trim()) {
        setError('Please choose a username.');
        setBusy(false);
        return;
      }
      const { error } = await signUp(email, password, username.trim());
      if (error) {
        setError(error.message);
      } else {
        setInfo('Account created! Check your email to confirm, then log in.');
        setMode('login');
      }
    }
    setBusy(false);
  }

  return (
    <div className="center-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <img src="/logo.png" alt="Dragon Chat" className="auth-logo" />
        <h1>{mode === 'login' ? 'Log in' : 'Sign up'}</h1>
        <p className="tagline">Connect Different. Chat Real.</p>

        {mode === 'signup' && (
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />

        {error && <p className="error-text">{error}</p>}
        {info && <p className="info-text">{info}</p>}

        <button type="submit" disabled={busy}>
          {busy ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>

        <p className="switch-mode">
          {mode === 'login' ? (
            <>
              No account?{' '}
              <span onClick={() => setMode('signup')}>Sign up</span>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <span onClick={() => setMode('login')}>Log in</span>
            </>
          )}
        </p>
      </form>
      <p className="studio-credit">Built by Caged Dragon Studios</p>
    </div>
  );
}
