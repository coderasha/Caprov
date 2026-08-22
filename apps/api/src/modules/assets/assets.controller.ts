import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import type { AssetClass, AssetStatus, CurrencyCode, OwnershipType } from '@caprov/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { AssetsService } from './assets.service';

class CreateAssetDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEnum([
    'REAL_ESTATE',
    'PRIVATE_CREDIT',
    'PRIVATE_EQUITY',
    'INFRASTRUCTURE',
    'AVIATION',
    'ART',
    'AGRICULTURE',
    'FUND',
    'OTHER',
  ])
  assetClass!: AssetClass;

  @IsOptional()
  @IsEnum(['DRAFT', 'ACTIVE', 'UNDER_REVIEW', 'ARCHIVED'])
  status?: AssetStatus;

  @IsOptional()
  @IsEnum(['USD', 'EUR', 'GBP', 'INR', 'SGD'])
  currency?: CurrencyCode;

  @IsOptional()
  @IsString()
  jurisdiction?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  acquisitionDate?: string;

  @IsOptional()
  @IsString()
  primaryImageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];
}

class OwnershipDto {
  @IsString()
  @MinLength(2)
  holderName!: string;

  @IsEnum(['LEGAL', 'BENEFICIAL', 'ECONOMIC'])
  ownershipType!: OwnershipType;

  @IsNumber()
  @Min(0)
  @Max(100)
  percentage!: number;

  @IsOptional()
  @IsString()
  asOf?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@Controller('assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.assets.list(user.organizationId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assets.get(user.organizationId, id);
  }

  @Post()
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAssetDto) {
    return this.assets.create(user, dto);
  }

  @Patch(':id')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateAssetDto>,
  ) {
    return this.assets.update(user, id, dto);
  }

  @Post(':id/ownerships')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  addOwnership(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: OwnershipDto,
  ) {
    return this.assets.addOwnership(user, id, dto);
  }
}
