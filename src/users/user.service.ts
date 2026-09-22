import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './user.entity.js';
import { Repository } from 'typeorm';
import { createUserDto } from './dto/create-user.dto.js';


// @Injectable allows NestJS to create and inject this service
// wherever it is needed. it marks a class as aproviderthat cian bie manage by Nestjs dependency injection
@Injectable()
export class UserService {
  // Injects the TypeORM repository responsible for User records.
  // The repository allows us to create, search, update, and delete users.
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  //create a new user in the database
  async create(userData: createUserDto): Promise<User> {
    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  // Searches for a user using their email address.
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
    });
  }

    // Searches for a user using their ID.
    async findById(id: number): Promise<User | null> {
        return this.userRepository.findOne({
            where: { id }
        });
  }
  
  async updateRole(
    userId: number,
    role: string
  ): Promise<void>{
    //update only the user role
    await this.userRepository.update(
      userId,
      {role}
    )
  }
}
