import { Module } from '@nestjs/common';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity.js';
@Module({
  // Registers the User entity's repository.
  // This allows UsersService to communicate with the users table.
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserService],
  // Allows other modules, such as AuthModule, to use UsersService.
  exports: [UserService],
})
export class UserModule {}
