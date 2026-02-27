import { Router, Request, Response } from 'express';
import { SecretService } from '../services/secret.service';

// Presentation / routing layer — clawpaw secret endpoints
const router = Router();
const secretService = new SecretService();

// GET /api/secret?uid=<uid>
// Returns the existing secret for a user, or null if none
router.get('/', async (req: Request, res: Response) => {
  const uid = req.query.uid as string | undefined;
  if (!uid) {
    res.status(400).json({ error: 'uid is required' });
    return;
  }

  try {
    const row = await secretService.getSecret(uid);
    res.json({ secret: row?.secret ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[secret] getSecret failed:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/secret/generate
// Body: { uid: string }
// Generates (or regenerates) a clawpaw secret for the user
router.post('/generate', async (req: Request, res: Response) => {
  const { uid } = req.body as { uid?: string };
  if (!uid) {
    res.status(400).json({ error: 'uid is required' });
    return;
  }

  try {
    const row = await secretService.generateSecret(uid);
    res.json({ secret: row.secret });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[secret] generateSecret failed:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
