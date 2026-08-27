import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import type { DocumentType } from '@caprov/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { DocumentsService } from './documents.service';

class IngestDocumentDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEnum([
    'TITLE_DEED',
    'SPA',
    'PURCHASE_AGREEMENT',
    'VALUATION_MEMO',
    'SALE_AGREEMENT',
    'ENCUMBRANCE_CERTIFICATE',
    'KYC',
    'INSURANCE',
    'FINANCIAL_STATEMENT',
    'CAP_TABLE',
    'LPA',
    'OTHER',
  ])
  type!: DocumentType;

  @IsOptional()
  @IsString()
  assetId?: string;

  @IsOptional()
  @IsString()
  extractedText?: string;
}

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('assetId') assetId?: string,
    @Query('currentOnly') currentOnly?: string,
  ) {
    return this.documents.list(
      user.organizationId,
      assetId,
      currentOnly === 'true',
    );
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.get(user.organizationId, id);
  }

  @Get(':id/history')
  history(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.history(user.organizationId, id);
  }

  @Get(':id/verify')
  verify(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.verify(user.organizationId, id);
  }

  @Post()
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  ingest(@CurrentUser() user: AuthUser, @Body() dto: IngestDocumentDto) {
    return this.documents.create(user, dto);
  }

  @Post('upload')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      type?: DocumentType;
      assetId?: string;
      name?: string;
      extractedText?: string;
    },
  ) {
    if (!file && !body.extractedText?.trim()) {
      throw new BadRequestException('Provide a file or extractedText.');
    }
    return this.documents.create(user, {
      name: body.name || file?.originalname || 'Untitled document',
      type: body.type ?? 'OTHER',
      assetId: body.assetId,
      mimeType: file?.mimetype || 'application/octet-stream',
      buffer: file?.buffer,
      extractedText: body.extractedText,
    });
  }
}
