import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserService } from '../users/user.service.js';
import { signupDto } from './dto/signup.dto.js';
import { User } from '../users/user.entity.js';

@Injectable()
export class AuthService {
  constructor(
    // Inject UsersService so we can access user-related database operations.
    private readonly usersService: UserService,

    // Inject JwtService so we can generate JWT access tokens during login.
    private readonly jwtService: JwtService,
  ) { }
  
  //function to signup new user
  async signup(signupDto: signupDto) {
    //extract the requred propertis from the signup request.
    const { firstName, lastName, email, phoneNumber, password } = signupDto;

    // Search the database to determine whether the email is already registered.
    const existingUser = await this.usersService.findByEmail(email);

    // Hash the plain-text password before saving it.
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create and save the user in the PostgreSQL database.
    const User = await this.usersService.create({
      firstName,
      lastName,
      email,
      phoneNumber,
      // Save the hashed password
      password: hashedPassword,
      // Assign the default role from the backend.
      role: 'passenger',
    });

    // Remove the password from the response object.
    // The underscore means that we intentionally do not use this variable.
    const { password: _, ...userWithoutPassword } = User;

    // Return a success message and the user information without the password.
    return {
      message: 'User registered successfully',
      user: userWithoutPassword,
    };
  }

  login() {
    return 'this is fron authservce login';
  }
}
