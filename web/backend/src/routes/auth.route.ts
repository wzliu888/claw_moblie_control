import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service';

// Presentation / routing layer — auth endpoints
const router = Router();
const authService = new AuthService();

// POST /api/auth/anonymous
// Body: { deviceId: string }
router.post('/anonymous', async (req: Request, res: Response) => {
  const { deviceId } = req.body as { deviceId?: string };
  if (!deviceId) {
    res.status(400).json({ error: 'deviceId is required' });
    return;
  }
  try {
    const user = await authService.loginAnonymous(deviceId);
    res.json({ uid: user.uid, login_type: user.login_type, created_at: user.created_at });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[auth] Anonymous login failed:', message);
    res.status(500).json({ error: 'Anonymous login failed', detail: message });
  }
});

export default router;
