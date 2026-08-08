/** Credentials used by login tests. */
export interface UserCredentials {
  username: string;
  password: string;
}

/** A known-good account provisioned in the mock/test environment. */
export const validUser: UserCredentials = {
  username: 'testuser',
  password: 'Passw0rd!',
};

/** An intentionally invalid account to exercise the error path. */
export const invalidUser: UserCredentials = {
  username: 'testuser',
  password: 'wrong-password',
};
