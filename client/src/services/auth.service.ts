
import { api } from './api'

import type {
  AuthMessageResponse,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  ResendVerificationRequest,
  ResetPasswordRequest,
  SignupRequest,
  SignupResponse,
  VerifyEmailRequest,
} from '../types/auth.types'

/**
 * Authentication service.
 *
 * Contains all frontend requests related to registration,
 * login, email verification and password recovery.
 */

// Register a new ordinary CarPool account.
export const signup = async (
  data: SignupRequest,
): Promise<SignupResponse> => {
  const response = await api.post<SignupResponse>('/auth/signup', data)
  return response.data
}

// Authenticate an existing user.
export const login = async (
  data: LoginRequest,
): Promise<LoginResponse> => {
  const response = await api.post<LoginResponse>('/auth/login', data)

  // Save the JWT so subsequent protected requests are authenticated.
  localStorage.setItem('token', response.data.accessToken)

  return response.data
}

// Verify the user's email address using the OTP.
export const verifyEmail = async (
  data: VerifyEmailRequest,
): Promise<AuthMessageResponse> => {
  const response = await api.post<AuthMessageResponse>(
    '/auth/verify-email',
    data,
  )

  return response.data
}

// Request another email verification OTP.
export const resendVerification = async (
  data: ResendVerificationRequest,
): Promise<AuthMessageResponse> => {
  const response = await api.post<AuthMessageResponse>(
    '/auth/resend-verification',
    data,
  )

  return response.data
}

// Request a password reset OTP.
export const forgotPassword = async (
  data: ForgotPasswordRequest,
): Promise<AuthMessageResponse> => {
  const response = await api.post<AuthMessageResponse>(
    '/auth/forgot-password',
    data,
  )

  return response.data
}

// Reset the user's password using the OTP.
export const resetPassword = async (
  data: ResetPasswordRequest,
): Promise<AuthMessageResponse> => {
  const response = await api.post<AuthMessageResponse>(
    '/auth/reset-password',
    data,
  )

  return response.data
}

// Clear the locally stored authentication token.
export const logout = (): void => {
  localStorage.removeItem('token')
}
