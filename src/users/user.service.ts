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
    ) { }
    
    //create a user in the database
    async create(userData: createUserDto): Promise<User> {
        const user = this.userRepository.create(userData);
        return this.userRepository.save(user);
    }
}
