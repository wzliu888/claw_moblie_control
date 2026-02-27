import pool from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface ClawpawSecret {
  uid: string;
  secret: string;
  created_at: Date;
  updated_at: Date;
}

// Data access layer — all SQL for clawpaw_secrets table lives here
export class SecretRepository {
  async findByUid(uid: string): Promise<ClawpawSecret | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM clawpaw_secrets WHERE uid = ? LIMIT 1',
      [uid]
    );
    return (rows[0] as ClawpawSecret) ?? null;
  }

  async upsert(uid: string, secret: string): Promise<ClawpawSecret> {
    await pool.query<ResultSetHeader>(
      `INSERT INTO clawpaw_secrets (uid, secret)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE secret = VALUES(secret)`,
      [uid, secret]
    );
    return (await this.findByUid(uid))!;
  }
}
