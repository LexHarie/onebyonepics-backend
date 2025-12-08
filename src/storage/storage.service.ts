import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly logger = new Logger(StorageService.name);
  private readonly cdnEndpoint?: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('spaces.region');
    this.bucket = this.configService.get<string>('spaces.bucket') as string;
    this.cdnEndpoint = this.configService.get<string>('spaces.cdnEndpoint') || undefined;

    this.client = new S3Client({
      region,
      endpoint: `https://${region}.digitaloceanspaces.com`,
      forcePathStyle: false,
      credentials: {
        accessKeyId: this.configService.get<string>('spaces.key') as string,
        secretAccessKey: this.configService.get<string>('spaces.secret') as string,
      },
    });
  }

  async uploadObject(key: string, body: Buffer, mimeType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
        ACL: 'public-read',
      }),
    );

    return this.getPublicUrl(key);
  }

  async deleteObject(key: string) {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      this.logger.warn(`Failed to delete object ${key}: ${(err as Error).message}`);
    }
  }

  async getObjectBuffer(key: string) {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    const chunks: Buffer[] = [];
    const stream = response.Body as NodeJS.ReadableStream;
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600) {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  getPublicUrl(key: string) {
    if (this.cdnEndpoint) {
      return `${this.cdnEndpoint.replace(/\/$/, '')}/${key}`;
    }
    const region = this.configService.get<string>('spaces.region');
    const bucket = this.bucket;
    return `https://${bucket}.${region}.digitaloceanspaces.com/${key}`;
  }
}
