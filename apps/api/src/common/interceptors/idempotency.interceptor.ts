import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { IdempotencyService } from '../services/idempotency.service';

/**
 * Idempotency interceptor that uses idempotency keys to prevent duplicate processing
 * 
 * Usage:
 * - Add header: Idempotency-Key: <unique-key>
 * - First request: processed and response cached
 * - Retry request (same key): returns cached response
 * 
 * Only works for POST/PUT/PATCH methods
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Only check idempotency for mutation methods
    if (!['POST', 'PUT', 'PATCH'].includes(request.method)) {
      return next.handle();
    }

    const idempotencyKey = request.get('Idempotency-Key');
    if (!idempotencyKey) {
      return next.handle();
    }

    // Validate idempotency key format
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length > 255) {
      throw new BadRequestException('Invalid Idempotency-Key header');
    }

    // Check if we've already processed this key
    const cached = this.idempotency.get(idempotencyKey);
    if (cached !== undefined) {
      response.setHeader('Idempotency-Replay', 'true');
      return of(cached);
    }

    // Process the request and cache the response
    return next.handle().pipe(
      tap((response) => {
        this.idempotency.set(idempotencyKey, response);
      }),
    );
  }
}
