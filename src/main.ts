import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';


async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  // Configure the basic information about the CarPool API.
  const config = new DocumentBuilder()
    .setTitle('CarPool API')
    .setDescription('API documentation for the CarPool ride-sharing platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  // Generate the OpenAPI document from our NestJS application.
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  // Register ValidationPipe globally so every incoming request is
  // validated against its DTO using class-validator decorators
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
