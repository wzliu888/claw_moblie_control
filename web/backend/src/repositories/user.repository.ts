import { randomUUID } from 'crypto';
import pool from '../db/connection';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface User {
  uid: string;
  login_type: string;
  login_id: string;
  created_at: Date;
  updated_at: Date;
}

// Data access layer — all SQL for users table lives here
export class UserRepository {
  async findByLogin(loginType: string, loginId: string): Promise<User | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM users WHERE login_type = ? AND login_id = ? LIMIT 1',
      [loginType, loginId]
    );
    return (rows[0] as User) ?? null;
  }

  async create(loginType: string, loginId: string): Promise<User> {
    const uid = randomUUID();
    await pool.query<ResultSetHeader>(
      'INSERT INTO users (uid, login_type, login_id) VALUES (?, ?, ?)',
      [uid, loginType, loginId]
    );
    const user = await this.findByUid(uid);
    return user!;
  }

  async findByUid(uid: string): Promise<User | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM users WHERE uid = ? LIMIT 1',
      [uid]
    );
    return (rows[0] as User) ?? null;
  }

  // Find existing user or create a new one (upsert pattern)
  async findOrCreate(loginType: string, loginId: string): Promise<User> {
    const existing = await this.findByLogin(loginType, loginId);
    if (existing) return existing;
    return this.create(loginType, loginId);
  }
}
