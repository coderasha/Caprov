import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { DEMO_ACCOUNTS } from '../../infrastructure/database/seed-data';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, SwitchOrganizationDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
  switchOrganization(@CurrentUser() user: AuthUser, @Body() dto: SwitchOrganizationDto) {
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
}
