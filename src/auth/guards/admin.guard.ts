import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface.js';
import { Observable } from 'rxjs';

export class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      //get the http request
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      const user = request.user;

        // Make sure the authenticated user is actually an admin.
        if (!user || user.role !== 'admin') {
            throw new ForbiddenException('Only administrators can perform this action');
        }

        return true;
    }
}