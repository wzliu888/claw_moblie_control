import { SshCredentialRepository } from '../repositories/ssh_credential.repository';

const SHARED_PASSWORD = process.env.SSH_SHARED_PASSWORD;
if (!SHARED_PASSWORD) throw new Error('SSH_SHARED_PASSWORD env var is required');
const sharedPassword: string = SHARED_PASSWORD;

export class SshProvisionService {
  private repo = new SshCredentialRepository();

  async provision(uid: string): Promise<{ username: string; password: string; adbPort: number }> {
    // Return existing credentials if already provisioned (INSERT IGNORE is idempotent)
    const existing = await this.repo.findByUid(uid);
    if (existing) {
      return { username: existing.linux_user, password: existing.linux_password, adbPort: existing.adb_port };
    }

    // All users share the Linux user 'cp_shared' on the tunnel node.
    // The shared password comes from SSH_SHARED_PASSWORD env var (must match the Linux user on the tunnel node).
    // Port is auto-assigned atomically via MAX(adb_port)+1 in the DB.
    const cred = await this.repo.upsert(uid, sharedPassword);
    return { username: cred.linux_user, password: cred.linux_password, adbPort: cred.adb_port };
  }
}
