import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload =
      exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      typeof payload === 'string'
        ? payload
        : typeof payload === 'object' && payload && 'message' in payload
          ? payload.message
          : 'Internal server error';
    if (!(exception instanceof HttpException)) {
      const details =
        exception instanceof Error ? exception.stack : String(exception);
      const requestId =
        typeof request.id === 'string' || typeof request.id === 'number'
          ? request.id
          : 'unknown request';
      this.logger.error(`Unhandled request error (${requestId})`, details);
    }
    response.status(status).json({
      error: {
        code:
          exception instanceof HttpException
            ? exception.name.replace(/Exception$/, '').toUpperCase()
            : 'INTERNAL_SERVER_ERROR',
        message,
        requestId: request.id,
      },
    });
  }
}
