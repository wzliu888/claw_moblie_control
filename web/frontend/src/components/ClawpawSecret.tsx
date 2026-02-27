import { useEffect, useState } from 'react';
import { fetchSecret, generateSecret } from '../services/secretService';

// UI component layer — display and generate clawpaw secret
interface Props {
  uid: string;
}

export function ClawpawSecret({ uid }: Props) {
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSecret(uid)
      .then(setSecret)
      .catch(() => setError('Failed to load secret'))
      .finally(() => setLoading(false));
  }, [uid]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const next = await generateSecret(uid);
      setSecret(next);
    } catch {
      setError('Failed to generate secret');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <p style={styles.hint}>Loading secret…</p>;

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Clawpaw Secret</h3>

      {secret ? (
        <>
          <code style={styles.code}>{secret}</code>
          <button onClick={handleGenerate} disabled={generating} style={styles.regenBtn}>
            {generating ? 'Regenerating…' : 'Regen'}
          </button>
        </>
      ) : (
        <button onClick={handleGenerate} disabled={generating} style={styles.generateBtn}>
          {generating ? 'Generating…' : 'Generate Secret'}
        </button>
      )}

      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginTop: '2rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
  },
  title: {
    margin: 0,
    fontSize: '1rem',
    color: '#333',
  },
  code: {
    background: '#f4f4f4',
    border: '1px solid #ddd',
    borderRadius: '6px',
    padding: '0.5rem 1rem',
    fontSize: '0.85rem',
    wordBreak: 'break-all',
    maxWidth: '480px',
    textAlign: 'center',
  },
  generateBtn: {
    padding: '0.5rem 1.5rem',
    background: '#4285F4',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  regenBtn: {
    padding: '0.35rem 1rem',
    background: '#fff',
    color: '#555',
    border: '1px solid #ccc',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  error: { color: 'red', fontSize: '0.85rem', margin: 0 },
  hint: { color: '#999', fontSize: '0.85rem' },
};
