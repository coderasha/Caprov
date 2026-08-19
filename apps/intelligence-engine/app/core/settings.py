from functools import lru_cache

from pydantic import BaseModel, Field


class Settings(BaseModel):
    service_name: str = "caprov-intelligence-engine"
    environment: str = Field(default="development")
    api_base_path: str = Field(default="/api")
    redis_url: str = Field(default="redis://localhost:6379")
    caprov_api_url: str = Field(default="http://localhost:3001/api")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
