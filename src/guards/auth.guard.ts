export type AuthUser = {
  id: string;
  email?: string | null;
  role?: string | null;
};

export const requireAuth = ({
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
};
