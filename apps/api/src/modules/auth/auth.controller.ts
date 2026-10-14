import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsString, Min, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { DEMO_ACCOUNTS } from '../../infrastructure/database/seed-data';
import { AuthService } from './auth.service';
import { WalletLinkService } from './wallet-link.service';
import { LoginDto, RegisterDto, SwitchOrganizationDto } from './dto/auth.dto';

class WalletChallengeDto { @IsString() @MinLength(42) address!: string; @IsInt() @Min(1) chainId!: number; }
class VerifyWalletDto { @IsString() challengeId!: string; @IsString() @MinLength(64) signature!: string; }

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly wallets: WalletLinkService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('switch-organization')
  switchOrganization(
    @CurrentUser() user: AuthUser,
    @Body() dto: SwitchOrganizationDto,
  ) {
    return this.auth.switchOrganization(user, dto.organizationId);
  }

  @Get('demo-accounts')
  demoAccounts() {
    return DEMO_ACCOUNTS.map(({ email, password, name, role }) => ({
      email,
      password,
      name,
      role,
    }));
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Get('wallets')
  walletsForUser(@CurrentUser() user: AuthUser) { return this.wallets.list(user); }

  @UseGuards(JwtAuthGuard)
  @Post('wallets/challenge')
  walletChallenge(@CurrentUser() user: AuthUser, @Body() dto: WalletChallengeDto) { return this.wallets.issueChallenge(user, dto.address, dto.chainId); }

  @UseGuards(JwtAuthGuard)
  @Post('wallets/verify')
  verifyWallet(@CurrentUser() user: AuthUser, @Body() dto: VerifyWalletDto) { return this.wallets.verifyAndLink(user, dto.challengeId, dto.signature); }
}
