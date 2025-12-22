import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from './infrastructure/database.service';
import { PgPoolService } from './infrastructure/pg-pool.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [DatabaseService, PgPoolService],
  exports: [DatabaseService, PgPoolService],
})
export class DatabaseModule {}
