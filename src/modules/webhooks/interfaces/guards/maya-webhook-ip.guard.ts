import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class MayaWebhookIpGuard implements CanActivate {
  private readonly logger = new Logger(MayaWebhookIpGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (process.env.NODE_ENV !== 'production') {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const clientIp = this.getClientIp(request);
    const allowedIps =
      this.configService.get<string[]>('maya.webhookAllowedIps') || [];

    if (!clientIp) {
      this.logger.warn('Webhook request missing client IP');
      throw new ForbiddenException('Forbidden');
    }

    if (!allowedIps.includes(clientIp)) {
      this.logger.warn(
        `Webhook request rejected from IP ${clientIp} (allowed: ${allowedIps.join(', ')})`,
      );
      throw new ForbiddenException('Forbidden');
    }

    return true;
  }

  private getClientIp(request: FastifyRequest): string | null {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
      return this.normalizeIp(forwardedFor.split(',')[0]?.trim());
    }

    const realIp = request.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) {
      return this.normalizeIp(realIp.trim());
    }

    const directIp =
      request.ip ||
      (request.raw && request.raw.socket
        ? request.raw.socket.remoteAddress
        : null);

    return this.normalizeIp(directIp || null);
  }

  private normalizeIp(ip: string | null): string | null {
    if (!ip) {
      return null;
    }

    if (ip.startsWith('::ffff:')) {
      return ip.replace('::ffff:', '');
    }

    return ip;
  }
}
