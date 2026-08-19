import { Controller, Get } from '@nestjs/common';
import type { HealthStatus } from '@caprov/types';
import { DatabaseService } from '../../infrastructure/database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  getHealth(): HealthStatus & { assets: number; documents: number } {
    return {
      service: 'caprov-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
      assets: this.db.snapshot.assets.length,
      documents: this.db.snapshot.documents.length,
    };
  }
}
