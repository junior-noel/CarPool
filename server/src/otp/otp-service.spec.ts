import * as bcrypt from 'bcrypt';
import type { Repository } from 'typeorm';
import { Otp } from './otp-entity.js';
import { OtpPurpose } from './otp-purpose.enum.js';
import { OtpService } from './otp-service.js';
import { User } from '../users/user.entity.js';

describe('OtpService', () => {
  it('creates a six-digit string, stores its hash, and keeps the ten-minute expiry', async () => {
    const otpRepository = {
      update: vi.fn().mockResolvedValue(undefined),
      create: vi.fn((otp: Partial<Otp>) => otp as Otp),
      save: vi.fn(async (otp: Otp) => ({
        ...otp,
        id: 'otp-id',
        createdAt: new Date(),
      })),
    };
    const otpService = new OtpService(
      otpRepository as unknown as Repository<Otp>,
    );
    const user = { id: 'user-id' } as User;
    const startTime = Date.now();

    const { otp, code } = await otpService.createOtp(
      user,
      OtpPurpose.EMAIL_VERIFICATION,
    );

    const endTime = Date.now();
    const expiryTime = otp.expiresAt.getTime();

    expect(typeof code).toBe('string');
    expect(code).toMatch(/^\d{6}$/);
    expect(otp.codeHash).not.toBe(code);
    expect(await bcrypt.compare(code, otp.codeHash)).toBe(true);
    expect(expiryTime).toBeGreaterThanOrEqual(startTime + 10 * 60 * 1000);
    expect(expiryTime).toBeLessThanOrEqual(endTime + 10 * 60 * 1000);
  });
});
