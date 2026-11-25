import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// @Injectable allows NestJS to manage this guard.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}