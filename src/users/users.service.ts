import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { User, UserRow, rowToUser } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async create(email: string, passwordHash: string, name?: string): Promise<User> {
    const rows = await this.db.sql<UserRow[]>`
      INSERT INTO users (email, password_hash, name)
      VALUES (${email}, ${passwordHash}, ${name ?? null})
      RETURNING *
    `;
    return rowToUser(rows[0]);
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db.sql<UserRow[]>`
      SELECT * FROM users WHERE email = ${email} LIMIT 1
    `;
    return rows.length > 0 ? rowToUser(rows[0]) : null;
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.db.sql<UserRow[]>`
      SELECT * FROM users WHERE id = ${id} LIMIT 1
    `;
    return rows.length > 0 ? rowToUser(rows[0]) : null;
  }
}
