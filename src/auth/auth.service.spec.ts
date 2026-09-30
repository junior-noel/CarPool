import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { UserService } from '../users/user.service.js';
import type { OtpService } from '../otp/otp-service.js';
import type { EmailService } from '../email/email.service.js';
import { OtpPurpose } from '../otp/otp-purpose.enum.js';
import { User } from '../users/user.entity.js';
import { AuthService } from './auth.service.js';

const INVALID_VERIFICATION_MESSAGE = 'Invalid or expired verification code.';

function createAuthService() {
  const findByEmail = vi.fn();
  const markEmailVerified = vi.fn();
  const verifyOtp = vi.fn();
  const signAsync = vi.fn();
  const authService = new AuthService(
    { findByEmail, markEmailVerified } as unknown as UserService,
    { signAsync } as unknown as JwtService,
    { verifyOtp } as unknown as OtpService,
    {} as EmailService,
  );

  return { authService, findByEmail, markEmailVerified, verifyOtp, signAsync };
}

async function captureFailure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpException) {
      return {
        status: error.getStatus(),
        body: error.getResponse(),
      };
    }

    throw error;
  }

  throw new Error('Expected email verification to fail');
}

describe('AuthService.verifyEmail', () => {
  const dto = { email: 'user@example.com', otp: '123456' };
  const unverifiedUser = {
    id: 'user-id',
    email: dto.email,
    emailVerified: false,
  } as User;

  it('verifies the email with the email-verification purpose and does not issue a JWT', async () => {
    const {
      authService,
      findByEmail,
      markEmailVerified,
      verifyOtp,
      signAsync,
    } = createAuthService();
    findByEmail.mockResolvedValue(unverifiedUser);
    verifyOtp.mockResolvedValue(true);
    markEmailVerified.mockResolvedValue(undefined);

    const result = await authService.verifyEmail(dto);

    expect(result).toEqual({ message: 'Email verified successfully.' });
    expect(verifyOtp).toHaveBeenCalledWith(
      unverifiedUser,
      dto.otp,
      OtpPurpose.EMAIL_VERIFICATION,
    );
    expect(markEmailVerified).toHaveBeenCalledWith(unverifiedUser.id);
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('returns the same generic 400 response for every verification failure', async () => {
    const cases = [
      { name: 'unknown email', user: null },
      {
        name: 'no active OTP',
        user: unverifiedUser,
        error: new BadRequestException('No valid OTP was found.'),
      },
      {
        name: 'wrong code',
        user: unverifiedUser,
        error: new BadRequestException('Invalid OTP.'),
      },
      {
        name: 'expired code',
        user: unverifiedUser,
        error: new BadRequestException('This OTP has expired.'),
      },
      {
        name: 'reused code',
        user: unverifiedUser,
        error: new BadRequestException('No valid OTP was found.'),
      },
      {
        name: 'too many attempts',
        user: unverifiedUser,
        error: new ConflictException('Too many incorrect attempts.'),
      },
      {
        name: 'already-verified user',
        user: { ...unverifiedUser, emailVerified: true } as User,
      },
    ];
    const responses = [];

    for (const testCase of cases) {
      const { authService, findByEmail, markEmailVerified, verifyOtp } =
        createAuthService();
      findByEmail.mockResolvedValue(testCase.user);
      if (testCase.error) {
        verifyOtp.mockRejectedValue(testCase.error);
      }

      responses.push(await captureFailure(authService.verifyEmail(dto)));
      expect(markEmailVerified).not.toHaveBeenCalled();
    }

    const expected = {
      status: 400,
      body: {
        message: INVALID_VERIFICATION_MESSAGE,
        error: 'Bad Request',
        statusCode: 400,
      },
    };
    expect(responses).toEqual(cases.map(() => expected));
    expect(responses.every((response) => response.status === 400)).toBe(true);
  });
});
