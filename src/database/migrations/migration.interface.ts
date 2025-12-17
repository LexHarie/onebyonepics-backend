import type { SQL } from 'bun';

export interface Migration {
  name: string;
  up(sql: SQL): Promise<void>;
  down(sql: SQL): Promise<void>;
}
