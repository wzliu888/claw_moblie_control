import { Router, Request, Response } from 'express';
import { SshProvisionService } from '../services/ssh_provision.service';
import { SecretRepository } from '../repositories/secret.repository';

const router = Router();
const provisionService = new SshProvisionService();
const secretRepo = new SecretRepository();

// POST /api/ssh/provision
// Header: x-clawpaw-secret: <secret>
// Body:   { uid }
// Returns: { username, password, adbPort }  — Linux SSH credentials + assigned ADB port
router.post('/provision', async (req: Request, res: Response) => {
  const secret = req.headers['x-clawpaw-secret'] as string | undefined;
  const { uid } = req.body as { uid?: string };

  if (!uid || !secret) {
    res.status(400).json({ error: 'uid and x-clawpaw-secret required' });
    return;
  }

  // Validate secret
  const stored = await secretRepo.findByUid(uid);
  if (!stored || stored.secret !== secret) {
    res.status(401).json({ error: 'Invalid secret' });
    return;
  }

  try {
    const creds = await provisionService.provision(uid);
    res.json({ username: creds.username, password: creds.password, adbPort: creds.adbPort });
  } catch (e: any) {
    console.error('[ssh/provision]', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
