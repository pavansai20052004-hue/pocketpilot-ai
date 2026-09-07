import type { ReactElement } from 'react';

export interface User {
  readonly name: string;
}

interface UserProfileProps {
  readonly user: User | null;
}

export function UserProfile({ user }: UserProfileProps): ReactElement {
  return <h1>{user.name}</h1>;
}
