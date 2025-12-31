import type { AuthUser } from './auth.guard';

export const optionalAuth = ({
  user,
}: {
  user?: AuthUser;
}) => {
  return user;
};
