import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config/env';
import { AppLogger } from '../../lib/logger';

export class StorageService {
  private readonly logger = new AppLogger('StorageService');
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly cdnEndpoint?: string;
  private readonly region: string;

  constructor() {
    const region = config.spaces.region;
    const bucket = config.spaces.bucket;
    const key = config.spaces.key;
    const secret = config.spaces.secret;

    if (!region || !bucket || !key || !secret) {
      throw new Error('Storage configuration is missing');
    }

    this.region = region;
    this.bucket = bucket;
    this.cdnEndpoint = config.spaces.cdnEndpoint || undefined;

    this.client = new S3Client({
      region,
      endpoint: `https://${region}.digitaloceanspaces.com`,
      forcePathStyle: false,
      credentials: {
        accessKeyId: key,
        secretAccessKey: secret,
      },
    });
  }

  async uploadObject(key: string, body: Buffer, mimeType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
      }),
    );

    return key;
  }

  async deleteObject(key: string) {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to delete object ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getObjectBuffer(key: string) {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    const chunks: Buffer[] = [];
    const stream = response.Body as AsyncIterable<Uint8Array> | undefined;
    if (!stream) {
      return Buffer.alloc(0);
    }

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  async getSignedUrl(
    key: string,
    expiresInSeconds = 3600,
    downloadFilename?: string,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(downloadFilename && {
        ResponseContentDisposition: `attachment; filename="${downloadFilename}"`,
      }),
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  getPublicUrl(key: string) {
    if (this.cdnEndpoint) {
      return `${this.cdnEndpoint.replace(/\/$/, '')}/${key}`;
    }

    return `https://${this.bucket}.${this.region}.digitaloceanspaces.com/${key}`;
  }
}
