import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ImagesService } from './images.service';
import type { User } from '../users/entities/user.entity';

@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('upload')
  @UseGuards(OptionalAuthGuard)
  async upload(
    @Req() req: FastifyRequest & { user?: User },
    @CurrentUser() user?: User,
  ) {
    const file = await (req as any).file();
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const buffer = await file.toBuffer();
    const sessionId =
      (file.fields?.sessionId?.value as string | undefined) ||
      ((req.body as any)?.sessionId as string | undefined);

    const uploaded = await this.imagesService.uploadImage({
      user,
      sessionId,
      file: buffer,
      filename: file.filename,
      mimeType: file.mimetype,
    });

    // Return a signed URL (valid for 1 hour) instead of public URL
    const signedUrl = await this.imagesService.getSignedUrl(uploaded, 3600);

    return {
      id: uploaded.id,
      url: signedUrl,
      expiresAt: uploaded.expiresAt,
    };
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  async getImage(
    @Param('id') id: string,
    @CurrentUser() user?: User,
    @Query('sessionId') sessionId?: string,
  ) {
    const image = await this.imagesService.getImageForRequester(
      id,
      user,
      sessionId,
    );
    return image;
  }

  @Delete(':id')
  @UseGuards(OptionalAuthGuard)
  async deleteImage(
    @Param('id') id: string,
    @CurrentUser() user?: User,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.imagesService.deleteImage(id, user, sessionId);
  }
}
