import pool from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface SshCredential {
  uid: string;
  linux_user: string;
  linux_password: string;
  adb_port: number;
  created_at: Date;
  updated_at: Date;
}

const ADB_PORT_MIN = 10000;
const ADB_PORT_MAX = 19999;
const SHARED_USER  = 'cp_shared';

export class SshCredentialRepository {
  async findByUid(uid: string): Promise<SshCredential | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM ssh_credentials WHERE uid = ? LIMIT 1',
      [uid]
    );
    return (rows[0] as SshCredential) ?? null;
  }

  /**
   * Atomically insert a new credential, auto-assigning the next available port
   * via MAX(adb_port)+1 inside a single INSERT ... SELECT statement.
   * Uses INSERT IGNORE so concurrent calls for the same uid are safe.
   */
  async upsert(uid: string, linux_password: string): Promise<SshCredential> {
    await pool.query<ResultSetHeader>(`
      INSERT IGNORE INTO ssh_credentials (uid, linux_user, linux_password, adb_port)
      SELECT ?, ?, ?, COALESCE(MAX(adb_port), ? - 1) + 1
      FROM ssh_credentials
      HAVING COALESCE(MAX(adb_port), ? - 1) + 1 <= ?
    `, [uid, SHARED_USER, linux_password, ADB_PORT_MIN, ADB_PORT_MIN, ADB_PORT_MAX]);

    const cred = await this.findByUid(uid);
    if (!cred) throw new Error(`Port exhausted: all ports in [${ADB_PORT_MIN}, ${ADB_PORT_MAX}] are taken`);
    return cred;
  }
}
