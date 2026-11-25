import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    // Listen for the response to finish so we can log the status code and how long the request took.
    res.on('finish', () => {
      const duration = Date.now() - startTime;

      this.logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`,
      );
    });

    next();
  }
}

// import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
// import { randomUUID } from 'crypto';
// import { Request, Response, NextFunction } from 'express';

// @Injectable()
// export class LoggerMiddleware implements NestMiddleware {
//   // NestJS Logger provides structured logging in the application terminal.
//   private readonly logger = new Logger('HTTP');

//   use(req: Request, res: Response, next: NextFunction) {
//     const startTime = Date.now();

//     // ---------------------------------------------------------
//     // 1. READ THE REQUEST
//     // ---------------------------------------------------------
//     // We can inspect information coming from the client.
//     const method = req.method;
//     const url = req.originalUrl;

//     // ---------------------------------------------------------
//     // 2. MODIFY THE REQUEST
//     // ---------------------------------------------------------
//     // Create a unique ID for this request.
//     // This allows us to trace one request through the application.
//     const requestId = randomUUID();

//     // Attach the request ID to the request object.
//     // Controllers/services can access it later if needed.
//     (req as Request & { requestId: string }).requestId = requestId;

//     // ---------------------------------------------------------
//     // 3. MODIFY THE RESPONSE
//     // ---------------------------------------------------------
//     // Send the same request ID back to the client.
//     // Postman/Swagger will be able to see this response header.
//     res.setHeader('X-Request-ID', requestId);

//     // ---------------------------------------------------------
//     // 4. END THE REQUEST CHAIN EARLY
//     // ---------------------------------------------------------
//     // Reject extremely long URLs before they reach the controller.
//     // This is an example of middleware stopping a request early.
//     const MAX_URL_LENGTH = 2048;

//     if (url.length > MAX_URL_LENGTH) {
//       this.logger.warn(
//         `${method} ${url.substring(0, 100)}... - Request URL too long`,
//       );

//       res.status(414).json({
//         statusCode: 414,
//         message: 'Request URL is too long',
//         requestId,
//       });

//       return;
//     }

//     // ---------------------------------------------------------
//     // 5. CALL THE NEXT MIDDLEWARE / GUARD / CONTROLLER
//     // ---------------------------------------------------------
//     // Normal requests continue through the NestJS request pipeline.
//     next();

//     // ---------------------------------------------------------
//     // 6. READ THE RESPONSE
//     // ---------------------------------------------------------
//     // The "finish" event fires when the response has been sent.
//     res.on('finish', () => {
//       const duration = Date.now() - startTime;

//       this.logger.log(
//         `${method} ${url} ${res.statusCode} - ${duration}ms - requestId=${requestId}`,
//       );
//     });
//   }
// }
