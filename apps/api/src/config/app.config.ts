export interface AppConfig {
  port: number;
  nodeEnv: string;
  redisUrl: string;
  intelligenceEngineUrl: string;
  objectStorageBucket: string;
}

export default (): AppConfig => ({
  port: Number.parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  intelligenceEngineUrl:
    process.env.INTELLIGENCE_ENGINE_URL ?? 'http://localhost:8000',
  objectStorageBucket: process.env.OBJECT_STORAGE_BUCKET ?? 'caprov-documents',
});
