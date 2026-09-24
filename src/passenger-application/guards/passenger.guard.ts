import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface.js';
import { PassengerApplicationService } from '../passenger-application.service.js';

@Injectable()
export class PassengerGuard implements CanActivate {
  constructor(
    private readonly passengerApplicationService: PassengerApplicationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const user = request.user;

    // The JWT guard should already have authenticated the user.
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Approved drivers can perform all passenger activities.
    if (user.role === 'driver') {
      return true;
    }

    // Check whether this user has an approved passenger application.
    const isApproved = await this.passengerApplicationService.isPassengerApproved(
        Number(user.userId),
      );

    if (!isApproved) {
      throw new ForbiddenException(
        'Only approved passengers can perform this action',
      );
    }

    return true;
  }
}
