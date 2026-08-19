import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

export function reservedPayload(context: string) {
  return {
    status: 'reserved' as const,
    context,
    message:
      'This bounded context is reserved in the CAPROV architecture for a later release. It is intentionally not part of the core Asset DNA platform.',
  };
}

@Controller()
@UseGuards(JwtAuthGuard)
export class ReservedController {
  @Get('compliance/status')
  compliance() {
    return reservedPayload('compliance');
  }
}
