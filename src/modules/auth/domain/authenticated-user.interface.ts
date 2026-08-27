export interface AuthenticatedUser {
  id: string;
  email: string;
  permissions: string[];
  authorizationVersion: number;
}
