const emailMocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  createTransport: emailMocks.createTransport,
}));

import { EmailService } from './email.service.js';

describe('EmailService password reset messages', () => {
  beforeEach(() => {
    emailMocks.sendMail.mockReset().mockResolvedValue(undefined);
    emailMocks.createTransport
      .mockReset()
      .mockReturnValue({ sendMail: emailMocks.sendMail });
  });

  it('sends reset-specific instructions without a reset link', async () => {
    const emailService = new EmailService();

    await emailService.sendOtpEmail(
      'user@example.com',
      '001234',
      'PASSWORD_RESET',
    );

    const message = emailMocks.sendMail.mock.calls[0][0];
    expect(message.subject).toContain('password');
    expect(message.text).toContain('password reset code');
    expect(message.text).toContain('ignore this email');
    expect(message.text).not.toMatch(/https?:\/\//i);
    expect(message.html).toContain('Password Reset');
    expect(message.html).toContain('ignore this email');
    expect(message.html).not.toMatch(/href\s*=|https?:\/\//i);
  });
});