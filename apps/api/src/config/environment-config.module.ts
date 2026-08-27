import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from './app.config';

@Module({
  imports: [ConfigModule.forFeature(appConfig)],
})
export class EnvironmentConfigModule {}
