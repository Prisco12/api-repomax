export interface UserForAuthentication {
  id: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  accountStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  authorizationVersion: number;
  emailVerifiedAt: Date | null;
  emailVerificationTokenHash: string | null;
  emailVerificationTokenExpiresAt: Date | null;
  passwordResetTokenHash: string | null;
  passwordResetTokenExpiresAt: Date | null;
  roles: Array<{
    role: {
      permissions: Array<{
        permission: {
          code: string;
        };
      }>;
    };
  }>;
}
