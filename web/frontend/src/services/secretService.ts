// Service layer — clawpaw secret API calls

export async function fetchSecret(uid: string): Promise<string | null> {
  const res = await fetch(`/api/secret?uid=${encodeURIComponent(uid)}`);
  if (!res.ok) throw new Error('Failed to fetch secret');
  const data = await res.json() as { secret: string | null };
  return data.secret;
}

export async function generateSecret(uid: string): Promise<string> {
  const res = await fetch('/api/secret/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid }),
  });
  if (!res.ok) throw new Error('Failed to generate secret');
  const data = await res.json() as { secret: string };
  return data.secret;
}
