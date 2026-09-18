import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
    signup() {
      return {message: 'this is fron authservce signup'};
  }

    login() {
       return 'this is fron authservce login';
  }
}
