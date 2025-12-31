import type { AuthUser } from './auth.guard';

export const requireAdmin = ({
  user,
  set,
}: {
  user?: AuthUser;
  set: { status: number };
}) => {
  if (!user) {
    set.status = 401;
    return { error: 'Unauthorized' };
  }

  if (user.role !== 'admin') {
    set.status = 403;
    return { error: 'Forbidden' };
  }
};
