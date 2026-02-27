import { Router, Request, Response } from 'express';
import { SecretRepository } from '../repositories/secret.repository';
import { forwardRpc } from '../ws/wsServer';

const router = Router();
const secretRepo = new SecretRepository();

/**
 * POST /api/mobile
 * Header: Authorization: Bearer <clawpaw_secret>
 * Body:   { uid, method, params }
 *
 * 1. Reads secret from Authorization header
 * 2. Validates secret against DB for the given uid
 * 3. Forwards call to phone via WebSocket
 * 4. Returns { success, data } or { success: false, error }
 */
router.post('/', async (req: Request, res: Response) => {
  // Extract secret from Authorization: Bearer <secret>
  const secret = ((req.headers['x-clawpaw-secret'] as string) ?? '').trim();

  const { uid, method, params } = req.body as {
    uid?: string;
    method?: string;
    params?: Record<string, any>;
  };

  if (!uid || !secret || !method) {
    res.status(400).json({ success: false, error: 'uid and method required in body; secret required in x-clawpaw-secret header' });
    return;
  }

  // Validate secret against DB
  const row = await secretRepo.findByUid(uid);
  if (!row || row.secret !== secret) {
    res.status(401).json({ success: false, error: 'Invalid uid or secret' });
    return;
  }

  // Forward to phone via WS
  const result = await forwardRpc(uid, method, params ?? {});
  res.json(result);
});

export default router;
