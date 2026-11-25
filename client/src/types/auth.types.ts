
/**
 * Authentication types for the CarPool frontend.
 * These interfaces describe the data exchanged with the NestJS API.
 */

// User information returned by the backend.
// Password is deliberately excluded.
export interface AuthUser {
  id: string
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  role: string
  emailVerified: boolean
  createdAt?: string
  updatedAt?: string
}

// Data required when creating a standard CarPool account.
export interface SignupRequest {
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  password: string
}

// Response returned after successful registration.
export interface SignupResponse {
  message: string
  user: AuthUser
}

// Data required when logging into CarPool.
export interface LoginRequest {
  email: string
  password: string
}

// Response returned after successful login.
export interface LoginResponse {
  message: string
  accessToken: string
  user: AuthUser
}

// Data required to verify an email address.
export interface VerifyEmailRequest {
  email: string
  otp: string
}

// Data required to resend the email verification code.
export interface ResendVerificationRequest {
  email: string
}

// Data required to request a password reset.
export interface ForgotPasswordRequest {
  email: string
}

// Data required to reset a password.
export interface ResetPasswordRequest {
  email: string
  otp: string
  newPassword: string
}

// General response for authentication operations that return a confirmation message.
export interface AuthMessageResponse {
  message: string
}
