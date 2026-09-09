import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './common/health/health.module';
import { ReservedModule } from './common/reserved/reserved.module';
import { IdempotencyService } from './common/services/idempotency.service';
import { EnvironmentConfigModule } from './config/environment-config.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { AssetsModule } from './modules/assets/assets.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CollateralModule } from './modules/collateral/collateral.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { IntelligenceModule } from './modules/intelligence/intelligence.module';
import { LendingModule } from './modules/lending/lending.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { OrdersModule } from './modules/orders/orders.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PortfoliosModule } from './modules/portfolios/portfolios.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { SettlementModule } from './modules/settlement/settlement.module';
import { TokenizationModule } from './modules/tokenization/tokenization.module';
import { TradingModule } from './modules/trading/trading.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      envFilePath: resolve(__dirname, '../.env'),
    }),
    EnvironmentConfigModule,
    DatabaseModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    StorageModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    RbacModule,
    AssetsModule,
    DocumentsModule,
    IntelligenceModule,
    PortfoliosModule,
    MarketplaceModule,
    OrdersModule,
    TradingModule,
    SettlementModule,
    TokenizationModule,
    CollateralModule,
    LendingModule,
    ComplianceModule,
    AuditModule,
    ReservedModule,
  ],
  providers: [IdempotencyService],
})
export class AppModule {}
