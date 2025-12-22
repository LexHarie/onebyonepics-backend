import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { User } from '@buiducnhat/nest-better-auth';

type AdminRoleUser = User & { role?: string | string[] | null };

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AdminRoleUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Admin access required');
    }

    const role = user.role;
    const roles = Array.isArray(role) ? role : role ? [role] : [];
    const isAdmin = roles.some((value) => value.toLowerCase() === 'admin');

    if (!isAdmin) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
