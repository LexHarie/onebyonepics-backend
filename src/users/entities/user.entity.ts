export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name?: string | null;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  is_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    isVerified: row.is_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
