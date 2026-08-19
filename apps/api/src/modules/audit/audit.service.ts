import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import type { AuditEventRecord } from '../../infrastructure/database/models';

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  log(input: {
    organizationId: string;
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }): AuditEventRecord {
    const event: AuditEventRecord = {
      id: createId('aud'),
      createdAt: new Date().toISOString(),
      ...input,
    };
    return this.db.mutate((draft) => {
      draft.auditEvents.unshift(event);
      return event;
    });
  }

  list(organizationId: string, limit = 100, includeAll = false): AuditEventRecord[] {
    return this.db.snapshot.auditEvents
      .filter((event) => includeAll || event.organizationId === organizationId)
      .slice(0, limit);
  }
}
