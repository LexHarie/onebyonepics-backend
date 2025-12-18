import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  AuthGuard,
  CurrentUser,
  type User,
} from '@buiducnhat/nest-better-auth';
import { SessionMigrationService } from '../../application/session-migration.service';

class MigrateSessionDto {
  sessionId!: string;
}

@Controller('session')
export class SessionMigrationController {
  constructor(private readonly migrationService: SessionMigrationService) {}

  /**
   * Migrate anonymous session data to the authenticated user
   */
  @Post('migrate')
  @UseGuards(AuthGuard)
  async migrateSession(
    @CurrentUser() user: User,
    @Body() dto: MigrateSessionDto,
  ) {
    if (!user) {
      throw new UnauthorizedException('Must be authenticated to migrate session');
    }

    const result = await this.migrationService.migrateSession(
      dto.sessionId,
      user.id,
    );

    return {
      success: true,
      message: 'Session migrated successfully',
      ...result,
    };
  }
}
