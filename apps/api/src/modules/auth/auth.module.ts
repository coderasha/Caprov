import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { WalletLinkService } from './wallet-link.service';

@Module({
  imports: [
    PassportModule,
    // Resolve the secret when Nest initializes the module. `main.ts` loads the
    // local environment during bootstrap, after ES module imports have been
    // evaluated; a synchronous registration here can otherwise sign with the
    // fallback while the JWT strategy verifies with the configured secret.
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'privateassetz-dev-secret-change-me',
        signOptions: { expiresIn: '7d' },
      }),
    }),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, WalletLinkService],
  exports: [AuthService, WalletLinkService],
})
export class AuthModule {}
