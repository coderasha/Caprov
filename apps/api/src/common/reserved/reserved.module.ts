import { Module } from '@nestjs/common';
import { ReservedController } from './reserved.controller';

@Module({
  controllers: [ReservedController],
})
export class ReservedModule {}
