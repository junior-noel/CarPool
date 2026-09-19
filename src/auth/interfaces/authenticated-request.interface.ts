import { Request } from 'express';

// This interface extends the normal Express Request object.
// Passport adds the "user" property after the JWT has been successfully validated by JwtStrategy.
export interface AuthenticatedRequest extends Request {
  // Cridengtials of the authenticated user.
  user: {
    userId: number;
    email: string;
    role: string;
  };
}
