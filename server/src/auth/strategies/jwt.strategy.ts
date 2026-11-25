import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

// @Injectable allows NestJS to create and manage this strategy.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    // ConfigService allows us to read JWT_SECRET from .env.
    private readonly configService: ConfigService,
  ) {
      super({
        // Extract the JWT from: Authorization: Bearer <token>
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        // We want Passport to reject expired tokens.
          ignoreExpiration: false,
        //tells passport to use the same secret that we use in generating
        secretOrKey: configService.get<string>('JWT_SECRET')!,
      });
  }

    async validate(payload: {
        sub: string;
        email: string;
        role: string;
    }) {
      //This method runs after Passport successfully verifies the JWT signature and expiration.
        return {
            userId: payload.sub,
            email: payload.email,
           role: payload.role,
        };
    }
}