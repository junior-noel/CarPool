import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface.js';

@Injectable()
export class DriverGuard implements CanActivate{
    canActivate(context: ExecutionContext): boolean{
      //get the current http request
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      // JwtAuthGuard puts the authenticated user inside request.user.
      const user = request.user;
        // Only users with the driver role can continue.
        if (!user || user.role !== 'driver') {
            throw new ForbiddenException(
              'Only approved drivers can perform this action (creatng a vehcle)',
            );
        }
        return true;
    }
}
