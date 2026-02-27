// Service layer — clawpaw secret API calls
export async function fetchSecret(uid) {
    const res = await fetch(`/api/secret?uid=${encodeURIComponent(uid)}`);
    if (!res.ok)
        throw new Error('Failed to fetch secret');
    const data = await res.json();
    return data.secret;
}
export async function generateSecret(uid) {
    const res = await fetch('/api/secret/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
    });
    if (!res.ok)
        throw new Error('Failed to generate secret');
    const data = await res.json();
    return data.secret;
}
