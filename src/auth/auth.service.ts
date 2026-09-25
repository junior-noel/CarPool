import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserService } from '../users/user.service.js';
import { signupDto } from './dto/signup.dto.js';
import { User } from '../users/user.entity.js';
import { loginDto } from './dto/login.dto.js';

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
    const { firstName, lastName, email, phoneNumber, password } = signupDto;
    const existingUser = await this.usersService.findByEmail(email);
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
      role: 'user',
    });

    // Remove the password from the response object. The underscore means that we intentionally do not use this variable.
    const { password: _, ...userWithoutPassword } = User;

    // Return a success message and the user information without the password.
    return {
      message: 'User registered successfully',
      user: userWithoutPassword,
    };
  }

  // This method handles user login.
  async login(loginDto: loginDto) {
    // Extract the email and password submitted by the user.
    const { email, password } = loginDto;
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // Compare the plain-text password from the request
    // with the hashed password stored in the database.
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // These values will be stored inside the JWT payload.
    const payload = {
      // "sub" means subject and identifies the user.
      sub: user.id,

      // Store the user's email in the token.
      email: user.email,

      // Store the user's role in the token.
      role: user.role,
    };

    // Generate a signed JWT access token.
    const accessToken = await this.jwtService.signAsync(payload);

    // Remove the password before returning the user information.
    const { password: _, ...userWithoutPassword } = user;

    
    // Return the token and safe user information to the client.
    return {
      message: 'Login successful',
      accessToken,
      user: userWithoutPassword,
    };
  }
}
