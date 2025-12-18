import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, type User } from '@buiducnhat/nest-better-auth';
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';
import { CreateGenerationDto } from './dto/create-generation.dto';
import { GenerationService } from './generation.service';

@Controller('generation')
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post('create')
  @UseGuards(OptionalAuthGuard)
  createJob(
    @Body() dto: CreateGenerationDto,
    @CurrentUser() user?: User,
  ) {
    return this.generationService.createJob({
      user,
      sessionId: dto.sessionId,
      uploadedImageId: dto.uploadedImageId,
      gridConfigId: dto.gridConfigId,
      variationCount: dto.variationCount,
    });
  }

  @Get('history')
  @UseGuards(OptionalAuthGuard)
  history(
    @CurrentUser() user?: User,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.generationService.getHistory(user, sessionId);
  }

  @Get(':jobId/status')
  @UseGuards(OptionalAuthGuard)
  status(
    @Param('jobId') jobId: string,
    @CurrentUser() user?: User,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.generationService.getStatus(jobId, user, sessionId);
  }

  @Get(':jobId/result')
  @UseGuards(OptionalAuthGuard)
  result(
    @Param('jobId') jobId: string,
    @CurrentUser() user?: User,
    @Query('sessionId') sessionId?: string,
    @Query('includeData') includeData?: string,
  ) {
    return this.generationService.getResult(
      jobId,
      user,
      sessionId,
      includeData === 'true',
    );
  }
}
