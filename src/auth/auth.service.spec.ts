import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { UserService } from '../users/user.service.js';
import type { OtpService } from '../otp/otp-service.js';
import type { EmailService } from '../email/email.service.js';
import { OtpPurpose } from '../otp/otp-purpose.enum.js';
import { Otp } from '../otp/otp-entity.js';
import { User } from '../users/user.entity.js';
import { AuthService } from './auth.service.js';

const INVALID_VERIFICATION_MESSAGE = 'Invalid or expired verification code.';

type LoginUserFixture = Omit<User, 'deletedAt'> & { deletedAt: Date | null };

function createAuthService() {
  const findByEmail = vi.fn();
  const createUser = vi.fn();
  const markEmailVerified = vi.fn();
  const verifyOtp = vi.fn();
  const prepareOtp = vi.fn();
  const persistOtp = vi.fn();
  const findLatestForUserAndPurpose = vi.fn();
  const countCreatedSince = vi.fn();
  const sendOtpEmail = vi.fn();
  const signAsync = vi.fn();
  const authService = new AuthService(
    {
      findByEmail,
      create: createUser,
      markEmailVerified,
    } as unknown as UserService,
    { signAsync } as unknown as JwtService,
    {
      verifyOtp,
      prepareOtp,
      persistOtp,
      findLatestForUserAndPurpose,
      countCreatedSince,
    } as unknown as OtpService,
    { sendOtpEmail } as unknown as EmailService,
  );

  return {
    authService,
    findByEmail,
    createUser,
    markEmailVerified,
    verifyOtp,
    prepareOtp,
    persistOtp,
    findLatestForUserAndPurpose,
    countCreatedSince,
    sendOtpEmail,
    signAsync,
  };
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

describe('AuthService.login email verification', () => {
  const password = 'CorrectPassword123!';

  it('allows a verified user to log in and returns a token', async () => {
    const mocks = createAuthService();
    const user = {
      id: 'verified-user-id',
      firstName: 'Verified',
      lastName: 'User',
      email: 'verified@example.com',
      password: await bcrypt.hash(password, 4),
      phoneNumber: '+237677123456',
      role: 'user',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } satisfies LoginUserFixture;
    mocks.findByEmail.mockResolvedValue(user);
    mocks.signAsync.mockResolvedValue('signed-jwt');

    const result = await mocks.authService.login({
      email: user.email,
      password,
    });

    expect(result).toMatchObject({
      message: 'Login successful',
      accessToken: 'signed-jwt',
      user: { id: user.id, email: user.email },
    });
    expect(mocks.signAsync).toHaveBeenCalledOnce();
  });

  it('rejects an unverified user with the correct password without issuing a token', async () => {
    const mocks = createAuthService();
    const user = {
      id: 'unverified-user-id',
      firstName: 'Unverified',
      lastName: 'User',
      email: 'unverified@example.com',
      password: await bcrypt.hash(password, 4),
      phoneNumber: '+237677123456',
      role: 'user',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } satisfies LoginUserFixture;
    mocks.findByEmail.mockResolvedValue(user);

    await expect(
      mocks.authService.login({ email: user.email, password }),
    ).rejects.toThrow(
      new ForbiddenException('Please verify your email before logging in.'),
    );
    expect(mocks.signAsync).not.toHaveBeenCalled();
  });

  it('keeps invalid credentials identical for unknown emails and incorrect passwords', async () => {
    const wrongPassword = 'WrongPassword123!';
    const cases = [
      { email: 'missing@example.com', user: null },
      {
        email: 'unverified@example.com',
        user: {
          email: 'unverified@example.com',
          id: 'unverified-user-id',
          firstName: 'Unverified',
          lastName: 'User',
          password: await bcrypt.hash(password, 4),
          phoneNumber: '+237677123456',
          role: 'user',
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        } satisfies LoginUserFixture,
      },
      {
        email: 'verified@example.com',
        user: {
          email: 'verified@example.com',
          id: 'verified-user-id',
          firstName: 'Verified',
          lastName: 'User',
          password: await bcrypt.hash(password, 4),
          phoneNumber: '+237677123456',
          role: 'user',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        } satisfies LoginUserFixture,
      },
    ];
    const responses = [];

    for (const testCase of cases) {
      const mocks = createAuthService();
      mocks.findByEmail.mockResolvedValue(testCase.user);

      try {
        await mocks.authService.login({
          email: testCase.email,
          password: wrongPassword,
        });
      } catch (error) {
        if (error instanceof HttpException) {
          responses.push({
            status: error.getStatus(),
            body: error.getResponse(),
          });
          continue;
        }
        throw error;
      }

      throw new Error('Expected login to reject invalid credentials');
    }

    const expected = {
      status: 401,
      body: {
        message: 'Invalid email or password',
        error: 'Unauthorized',
        statusCode: 401,
      },
    };
    expect(responses).toEqual(cases.map(() => expected));
  });
});

describe('AuthService.resendVerification', () => {
  const dto = { email: 'user@example.com' };
  const user = {
    id: 'user-id',
    email: dto.email,
    emailVerified: false,
  } as User;
  const otp = {
    user,
    purpose: OtpPurpose.EMAIL_VERIFICATION,
    codeHash: 'hashed-code',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attempts: 0,
    used: false,
  } as Otp;
  const neutralResponse = {
    message: 'If the account needs verification, a code will be sent.',
  };
  const resendScenarios: Array<{
    name: string;
    user: User | null;
    latestOtp: Otp | null;
    hourlyCount: number;
    emailError?: Error;
  }> = [
    { name: 'eligible account', user, latestOtp: null, hourlyCount: 1 },
    { name: 'unknown email', user: null, latestOtp: null, hourlyCount: 0 },
    {
      name: 'already-verified account',
      user: { ...user, emailVerified: true } as User,
      latestOtp: null,
      hourlyCount: 0,
    },
    {
      name: 'cooldown active',
      user,
      latestOtp: {
        ...otp,
        createdAt: new Date(Date.now() - 30 * 1000),
      } as Otp,
      hourlyCount: 1,
    },
    { name: 'hourly cap reached', user, latestOtp: null, hourlyCount: 5 },
    {
      name: 'SMTP failure',
      user,
      latestOtp: null,
      hourlyCount: 1,
      emailError: new Error('SMTP unavailable'),
    },
  ];

  // Run one resend scenario with isolated service and dependency mocks.
  async function runScenario(scenario: (typeof resendScenarios)[number]) {
    const mocks = createAuthService();
    mocks.findByEmail.mockResolvedValue(scenario.user);
    mocks.findLatestForUserAndPurpose.mockResolvedValue(scenario.latestOtp);
    mocks.countCreatedSince.mockResolvedValue(scenario.hourlyCount);
    mocks.prepareOtp.mockResolvedValue({ otp, code: '012345' });
    mocks.persistOtp.mockResolvedValue(otp);
    if (scenario.emailError) {
      mocks.sendOtpEmail.mockRejectedValue(scenario.emailError);
    } else {
      mocks.sendOtpEmail.mockResolvedValue(undefined);
    }

    const response = await mocks.authService.resendVerification(dto);
    return { response, mocks };
  }

  it('sends before persisting an OTP for an eligible account', async () => {
    const { response, mocks } = await runScenario(resendScenarios[0]);

    expect(response).toEqual(neutralResponse);
    expect(mocks.sendOtpEmail).toHaveBeenCalledWith(
      user.email,
      '012345',
      OtpPurpose.EMAIL_VERIFICATION,
    );
    expect(mocks.persistOtp).toHaveBeenCalledWith(otp);
    expect(mocks.sendOtpEmail.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.persistOtp.mock.invocationCallOrder[0],
    );
  });

  it.each(resendScenarios)(
    '$name returns the neutral response',
    async (scenario) => {
      const { response, mocks } = await runScenario(scenario);

      expect(response).toEqual(neutralResponse);
      if (scenario.emailError) {
        expect(mocks.persistOtp).not.toHaveBeenCalled();
      } else if (scenario.name !== 'eligible account') {
        expect(mocks.sendOtpEmail).not.toHaveBeenCalled();
        expect(mocks.persistOtp).not.toHaveBeenCalled();
      }
    },
  );

  it('returns an identical response for all account-level outcomes', async () => {
    const responses = await Promise.all(
      resendScenarios.map(async (scenario) => {
        const { response } = await runScenario(scenario);
        return response;
      }),
    );

    expect(responses).toEqual(resendScenarios.map(() => neutralResponse));
  });
});

describe('AuthService.forgotPassword', () => {
  const dto = { email: 'user@example.com' };
  const verifiedUser = {
    id: 'verified-user-id',
    email: dto.email,
    emailVerified: true,
  } as User;
  const unverifiedUser = { ...verifiedUser, emailVerified: false } as User;
  const resetOtp = {
    user: verifiedUser,
    purpose: OtpPurpose.PASSWORD_RESET,
    codeHash: 'reset-code-hash',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attempts: 0,
    used: false,
  } as Otp;
  const verificationOtp = {
    ...resetOtp,
    purpose: OtpPurpose.EMAIL_VERIFICATION,
  } as Otp;
  const neutralResponse = {
    message: 'If the account is eligible, a password reset code will be sent.',
  };
  const scenarios: Array<{
    name: string;
    user: User | null;
    latestOtp: Otp | null;
    hourlyCount: number;
    emailError?: Error;
  }> = [
    { name: 'eligible account', user: verifiedUser, latestOtp: null, hourlyCount: 0 },
    { name: 'unknown email', user: null, latestOtp: null, hourlyCount: 0 },
    { name: 'unverified account', user: unverifiedUser, latestOtp: null, hourlyCount: 0 },
    {
      name: 'cooldown active',
      user: verifiedUser,
      latestOtp: { ...resetOtp, createdAt: new Date(Date.now() - 30 * 1000) } as Otp,
      hourlyCount: 1,
    },
    { name: 'hourly cap reached', user: verifiedUser, latestOtp: null, hourlyCount: 5 },
    {
      name: 'SMTP failure',
      user: verifiedUser,
      latestOtp: null,
      hourlyCount: 0,
      emailError: new Error('SMTP unavailable'),
    },
  ];

  // Run one password-reset request with isolated account, OTP, and email mocks.
  async function runScenario(scenario: (typeof scenarios)[number]) {
    const mocks = createAuthService();
    mocks.findByEmail.mockResolvedValue(scenario.user);
    mocks.findLatestForUserAndPurpose.mockResolvedValue(scenario.latestOtp);
    mocks.countCreatedSince.mockResolvedValue(scenario.hourlyCount);
    mocks.prepareOtp.mockResolvedValue({ otp: resetOtp, code: '001234' });
    mocks.persistOtp.mockResolvedValue(resetOtp);
    if (scenario.emailError) {
      mocks.sendOtpEmail.mockRejectedValue(scenario.emailError);
    } else {
      mocks.sendOtpEmail.mockResolvedValue(undefined);
    }

    const response = await mocks.authService.forgotPassword(dto);
    return { response, mocks };
  }

  it('sends a password-reset code before persisting it for an eligible account', async () => {
    const { response, mocks } = await runScenario(scenarios[0]);

    expect(response).toEqual(neutralResponse);
    expect(mocks.sendOtpEmail).toHaveBeenCalledWith(
      verifiedUser.email,
      '001234',
      OtpPurpose.PASSWORD_RESET,
    );
    expect(mocks.persistOtp).toHaveBeenCalledWith(resetOtp);
    expect(mocks.sendOtpEmail.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.persistOtp.mock.invocationCallOrder[0],
    );
  });

  it.each(scenarios)('$name returns the neutral response', async (scenario) => {
    const { response, mocks } = await runScenario(scenario);

    expect(response).toEqual(neutralResponse);
    if (scenario.emailError) {
      expect(mocks.persistOtp).not.toHaveBeenCalled();
    } else if (scenario.name !== 'eligible account') {
      expect(mocks.sendOtpEmail).not.toHaveBeenCalled();
      expect(mocks.persistOtp).not.toHaveBeenCalled();
    }
  });

  it('returns the same response for every account-level outcome', async () => {
    const responses = await Promise.all(
      scenarios.map(async (scenario) => {
        const { response } = await runScenario(scenario);
        return response;
      }),
    );

    expect(responses).toEqual(scenarios.map(() => neutralResponse));
  });

  it('queries cooldown and cap only for password-reset OTPs', async () => {
    const mocks = createAuthService();
    mocks.findByEmail.mockResolvedValue(verifiedUser);
    mocks.findLatestForUserAndPurpose.mockImplementation(
      async (_userId: string, purpose: OtpPurpose) =>
        purpose === OtpPurpose.PASSWORD_RESET ? null : verificationOtp,
    );
    mocks.countCreatedSince.mockImplementation(
      async (_userId: string, purpose: OtpPurpose) =>
        purpose === OtpPurpose.PASSWORD_RESET ? 0 : 5,
    );
    mocks.prepareOtp.mockResolvedValue({ otp: resetOtp, code: '001234' });
    mocks.persistOtp.mockResolvedValue(resetOtp);
    mocks.sendOtpEmail.mockResolvedValue(undefined);

    await mocks.authService.forgotPassword(dto);

    expect(mocks.findLatestForUserAndPurpose).toHaveBeenCalledWith(
      verifiedUser.id,
      OtpPurpose.PASSWORD_RESET,
    );
    expect(mocks.countCreatedSince).toHaveBeenCalledWith(
      verifiedUser.id,
      OtpPurpose.PASSWORD_RESET,
      expect.any(Date),
    );
  });
});

describe('AuthService.signup email delivery', () => {
  const signupData = {
    firstName: 'Test',
    lastName: 'User',
    email: 'new@example.com',
    phoneNumber: '+237677123456',
    password: 'ExamplePass123!',
  };
  const user = { id: 'new-user-id', email: signupData.email } as User;
  const otp = { user, purpose: OtpPurpose.EMAIL_VERIFICATION } as Otp;

  it('persists the OTP after signup email delivery succeeds', async () => {
    const mocks = createAuthService();
    mocks.findByEmail.mockResolvedValue(null);
    mocks.createUser.mockResolvedValue(user);
    mocks.prepareOtp.mockResolvedValue({ otp, code: '012345' });
    mocks.sendOtpEmail.mockResolvedValue(undefined);
    mocks.persistOtp.mockResolvedValue(otp);

    const response = await mocks.authService.signup(signupData);

    expect(response).toMatchObject({
      message:
        'Registration successful. Please check your email for the verification code.',
    });
    expect(mocks.sendOtpEmail.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.persistOtp.mock.invocationCallOrder[0],
    );
  });

  it('leaves no OTP when signup email delivery fails', async () => {
    const mocks = createAuthService();
    mocks.findByEmail.mockResolvedValue(null);
    mocks.createUser.mockResolvedValue(user);
    mocks.prepareOtp.mockResolvedValue({ otp, code: '012345' });
    mocks.sendOtpEmail.mockRejectedValue(new Error('SMTP unavailable'));

    await expect(mocks.authService.signup(signupData)).rejects.toThrow();
    expect(mocks.persistOtp).not.toHaveBeenCalled();
  });
});
