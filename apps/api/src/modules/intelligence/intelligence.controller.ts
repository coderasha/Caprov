import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import type { IntelligenceJobType } from '@caprov/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user';
import { IntelligenceService } from './intelligence.service';
import { LlmModelsService } from './llm-models.service';

class RunPipelineDto {
  @IsOptional()
  @IsEnum([
    'DOCUMENT_INTELLIGENCE',
    'EXTRACTION',
    'ENTITY_RESOLUTION',
    'KNOWLEDGE_GRAPH',
    'ASSET_DNA',
    'VALUATION',
    'RISK',
    'PROJECTION',
    'FULL_PIPELINE',
  ])
  type?: IntelligenceJobType;
}

class CopilotDto {
  @IsString()
  @MinLength(2)
  message!: string;

  @IsOptional()
  @IsString()
  assetId?: string;

  @IsOptional()
  @IsString()
  threadId?: string;
}

class SelectModelDto {
  @IsString()
  @MinLength(2)
  modelId!: string;
}

@Controller('intelligence')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntelligenceController {
  constructor(
    private readonly intelligence: IntelligenceService,
    private readonly llmModels: LlmModelsService,
  ) {}

  @Get('models')
  listModels(@CurrentUser() user: AuthUser) {
    return this.llmModels.list(user.organizationId);
  }

  @Patch('models')
  @Roles('ORG_ADMIN', 'PLATFORM_ADMIN', 'ANALYST')
  selectModel(@CurrentUser() user: AuthUser, @Body() dto: SelectModelDto) {
    return this.llmModels.select(user.organizationId, user.id, dto.modelId);
  }

  @Get('jobs')
  jobs(@CurrentUser() user: AuthUser) {
    return this.intelligence.listJobs(user.organizationId);
  }

  @Get('assets/:assetId/dna')
  dna(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.intelligence.getDna(user.organizationId, assetId);
  }

  @Get('assets/:assetId/valuation')
  valuation(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.intelligence.getValuation(user.organizationId, assetId);
  }

  @Get('assets/:assetId/projection')
  projection(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.intelligence.getProjection(user.organizationId, assetId);
  }

  @Get('assets/:assetId/risk')
  risk(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.intelligence.getRisk(user.organizationId, assetId);
  }

  @Post('assets/:assetId/run')
  @Roles('ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN')
  run(
    @CurrentUser() user: AuthUser,
    @Param('assetId') assetId: string,
    @Body() dto: RunPipelineDto,
  ) {
    return this.intelligence.runPipeline(user, assetId, dto.type ?? 'FULL_PIPELINE');
  }

  @Get('copilot/threads')
  threads(@CurrentUser() user: AuthUser) {
    return this.intelligence.listThreads(user);
  }

  @Post('copilot')
  copilot(@CurrentUser() user: AuthUser, @Body() dto: CopilotDto) {
    return this.intelligence.chat(user, dto);
  }
}
