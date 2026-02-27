import { randomBytes } from 'crypto';
import { SecretRepository, ClawpawSecret } from '../repositories/secret.repository';

// Business logic layer — clawpaw secret generation and retrieval
export class SecretService {
  private repository: SecretRepository;

  constructor() {
    this.repository = new SecretRepository();
  }

  async getSecret(uid: string): Promise<ClawpawSecret | null> {
    return this.repository.findByUid(uid);
  }

  async generateSecret(uid: string): Promise<ClawpawSecret> {
    const secret = `clawpaw_${randomBytes(24).toString('hex')}`;
    return this.repository.upsert(uid, secret);
  }
}
