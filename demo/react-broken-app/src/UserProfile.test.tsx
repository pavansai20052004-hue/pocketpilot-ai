import { describe, expect, it } from 'vitest';

import { UserProfile } from './UserProfile';

describe('UserProfile', () => {
  it('renders the user name', () => {
    expect(UserProfile({ user: { name: 'Ada' } }).props.children).toBe('Ada');
  });

  it('renders Guest while user data is missing', () => {
    expect(UserProfile({ user: null }).props.children).toBe('Guest');
  });
});
