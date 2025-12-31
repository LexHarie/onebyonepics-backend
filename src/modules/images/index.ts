import { Elysia } from 'elysia';
import { getAuthSession } from '../../lib/auth-session';
import { httpError } from '../../lib/http-error';
import { StorageService } from '../storage/storage.service';
import { createImagesRepository } from './images.repository';
import { ImagesService } from './images.service';
import { imagesSchema } from './images.schema';
import { authContextPlugin } from '../../plugins/auth.plugin';

const imagesService = new ImagesService(
  createImagesRepository(),
  new StorageService(),
);

export const imagesModule = new Elysia({ name: 'images' })
  .use(authContextPlugin)
  .decorate('images', imagesService)
  .post(
    '/images/upload',
    async ({ body, request, auth }) => {
    const session = await getAuthSession(auth, request);
    const user = session?.user ?? null;
    const file = body.file;
    if (!file) {
      throw httpError(400, 'File is required');
    }

    const filename = 'name' in file ? file.name : 'upload';
    const mimeType = 'type' in file ? file.type : 'application/octet-stream';
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sessionId = body.sessionId;

    const uploaded = await imagesService.uploadImage({
      user: user ?? undefined,
      sessionId: sessionId ?? undefined,
      file: buffer,
      filename,
      mimeType,
    });

    const signedUrl = await imagesService.getSignedUrl(uploaded, 3600);

    return {
      id: uploaded.id,
      url: signedUrl,
      expiresAt: uploaded.expiresAt,
    };
    },
    {
      body: imagesSchema.upload,
    },
  )
  .get(
    '/images/:id',
    async ({ params, query, request, auth }) => {
      const session = await getAuthSession(auth, request);
      const user = session?.user ?? null;

      return imagesService.getImageForRequester(
        params.id,
        user ?? undefined,
        query.sessionId,
      );
    },
    {
      params: imagesSchema.params,
      query: imagesSchema.query,
    },
  )
  .delete(
    '/images/:id',
    async ({ params, query, request, auth }) => {
      const session = await getAuthSession(auth, request);
      const user = session?.user ?? null;

      return imagesService.deleteImage(
        params.id,
        user ?? undefined,
        query.sessionId,
      );
    },
    {
      params: imagesSchema.params,
      query: imagesSchema.query,
    },
  );
