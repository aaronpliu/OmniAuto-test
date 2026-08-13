/** Credentials used by login tests. */
export interface UserCredentials {
  username: string;
  password: string;
}

/** A known-good account provisioned in the mock/test environment. */
export const validUser: UserCredentials = {
  username: "admin",
  password: "123456",
};

/** An intentionally invalid account to exercise the error path. */
export const invalidUser: UserCredentials = {
  username: "testuser",
  password: "wrong-password",
};
