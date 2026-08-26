import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type AppEnv = z.infer<typeof envSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  organizationName: z.string().min(2).max(120),
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8),
  title: z.string().max(120).optional(),
});

export const assetSchema = z.object({
  name: z.string().min(2).max(180),
  assetClass: z.enum([
    'REAL_ESTATE',
    'PRIVATE_CREDIT',
    'PRIVATE_EQUITY',
    'INFRASTRUCTURE',
    'AVIATION',
    'ART',
    'AGRICULTURE',
    'FUND',
    'OTHER',
  ]),
  status: z
    .enum(['DRAFT', 'ACTIVE', 'UNDER_REVIEW', 'ARCHIVED'])
    .optional(),
  currency: z.enum(['USD', 'EUR', 'GBP', 'INR', 'SGD']).optional(),
  jurisdiction: z.string().max(80).optional(),
  location: z.string().max(180).optional(),
  description: z.string().max(2000).optional(),
  creationDate: z.string().optional(),
});

export const ownershipSchema = z.object({
  holderName: z.string().min(2).max(180),
  ownershipType: z.enum(['LEGAL', 'BENEFICIAL', 'ECONOMIC']),
  percentage: z.number().min(0).max(100),
  asOf: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export const portfolioSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  baseCurrency: z.enum(['USD', 'EUR', 'GBP', 'INR', 'SGD']).optional(),
});

export const copilotMessageSchema = z.object({
  assetId: z.string().optional(),
  message: z.string().min(2).max(4000),
  threadId: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type AssetInput = z.infer<typeof assetSchema>;
export type OwnershipInput = z.infer<typeof ownershipSchema>;
export type PortfolioInput = z.infer<typeof portfolioSchema>;
export type CopilotMessageInput = z.infer<typeof copilotMessageSchema>;
