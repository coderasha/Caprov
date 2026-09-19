import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  AssetClass,
  AssetStatus,
  CurrencyCode,
  OwnershipType,
} from '@caprov/types';
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
  creationDate?: string;

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

class OwnershipRegisterDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OwnershipDto)
  ownerships!: OwnershipDto[];
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
    return this.assets.getForUser(user, id);
  }

  @Post()
  @Roles('ORG_ADMIN', 'PLATFORM_ADMIN')
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

  @Put(':id/ownerships')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  replaceOwnerships(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: OwnershipRegisterDto,
  ) {
    return this.assets.replaceOwnerships(user, id, dto.ownerships);
  }
}
