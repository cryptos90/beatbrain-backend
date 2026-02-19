import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload = isHttpException ? exception.getResponse() : undefined;
    const payloadObject =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, any>)
        : undefined;
    const message =
      typeof payload === 'string'
        ? payload
        : payloadObject?.message ??
          (exception as any)?.message ??
          'Internal server error';

    const errorDetails: Record<string, any> = {};
    if (payloadObject) {
      for (const [key, value] of Object.entries(payloadObject)) {
        if (key === 'message' || key === 'statusCode') {
          continue;
        }
        errorDetails[key] = value;
      }
    }

    const isProd = process.env.NODE_ENV === 'production';

    response.status(status).json({
      ok: false,
      error: {
        status,
        message,
        ...errorDetails,
      },
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(isProd
        ? {}
        : {
            stack: (exception as any)?.stack,
          }),
    });
  }
}
