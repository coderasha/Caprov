import { Injectable } from '@nestjs/common';

@Injectable()
export class QueueService {
  getQueueNames(): string[] {
    return ['document-intelligence', 'asset-dna', 'valuation', 'risk'];
  }
}
