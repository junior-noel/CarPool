import { Module } from '@nestjs/common';
import { EmailService } from './email.service.js';

@Module({
  // Registers the email service inside this module.
  providers: [EmailService],

  // Allows other modules, such as AuthModule,
  // to use EmailService.
  exports: [EmailService],
})
export class EmailModule {}
