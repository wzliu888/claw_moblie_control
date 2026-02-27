// HTTP client — sends phone control commands to the ClawPaw backend
// Transport: LLM → MCP (stdio) → HTTP POST /api/mobile → backend WS → phone
//
// Required env vars:
//   CLAWPAW_BACKEND_URL  e.g. http://localhost:3000
//   CLAWPAW_UID          user uid from ClawPaw web console
//   CLAWPAW_SECRET       clawpaw_secret from ClawPaw web console

const backendUrl = process.env.CLAWPAW_BACKEND_URL ?? 'http://localhost:3000';
const uid        = process.env.CLAWPAW_UID    ?? '';
const secret     = process.env.CLAWPAW_SECRET ?? '';

if (!uid || !secret) {
  console.error('[clawpaw-mcp] CLAWPAW_UID and CLAWPAW_SECRET must be set');
  process.exit(1);
}

export interface MobileResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Send a phone control command to the backend.
 * POST /api/mobile
 *   Header: x-clawpaw-secret: <secret>
 *   Body:   { uid, method, params }
 */
export async function sendCommand(method: string, params: Record<string, any> = {}): Promise<MobileResult> {
  const res = await fetch(`${backendUrl}/api/mobile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-clawpaw-secret': secret,
    },
    body: JSON.stringify({ uid, method, params }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { success: false, error: `Backend error ${res.status}: ${text}` };
  }

  return res.json() as Promise<MobileResult>;
}

/**
 * Send a UI command via adb (reverse SSH tunnel).
 * POST /api/adb/:method
 *   Header: x-clawpaw-secret: <secret>
 *   Body:   { uid, ...params }
 */
export async function sendAdb(method: string, params: Record<string, any> = {}): Promise<MobileResult> {
  const res = await fetch(`${backendUrl}/api/adb/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-clawpaw-secret': secret,
    },
    body: JSON.stringify({ uid, ...params }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { success: false, error: `Backend error ${res.status}: ${text}` };
  }

  return res.json() as Promise<MobileResult>;
}
