import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  // Nodemailer transporter responsible for connecting to the email provider's SMTP server.
  private readonly transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,

      port: Number(process.env.SMTP_PORT),

      // true is normally used for port 465.
      // false is normally used for port 587.
      secure: process.env.SMTP_SECURE === 'true',

      auth: {
        // Email account username.
        user: process.env.SMTP_USER,

        // Email account password or app password.
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  // Sends an email containing an OTP.

  async sendOtpEmail(
    email: string,
    otpCode: string,
    purpose: string,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        // The email address that sends the message.
        from: process.env.SMTP_FROM,

        // Recipient.
        to: email,

        // Email subject.
        subject:
          purpose === 'EMAIL_VERIFICATION'
            ? 'Verify your CarPool account'
            : 'Your CarPool verification code',

        // Plain-text version of the email.
        text: `Your CarPool verification code is ${otpCode}. This code expires in 10 minutes.`,

        // HTML version of the email.
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
            <h2>CarPool Email Verification</h2>

            <p>
              Thank you for creating a CarPool account.
            </p>

            <p>
              Your verification code is:
            </p>

            <h1 style="letter-spacing: 6px;">
              ${otpCode}
            </h1>

            <p>
              This code will expire in <strong>10 minutes</strong>.
            </p>

            <p>
              If you did not create this account, you can safely ignore this email.
            </p>
          </div>
        `,
      });
    } catch (error) {
      // We don't expose the SMTP error directly to the client.
      console.error('Failed to send OTP email:', error);

      throw new InternalServerErrorException(
        'Unable to send verification email',
      );
    }
  }
}
