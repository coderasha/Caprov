from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    service: str
    status: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PipelineDocument(BaseModel):
    id: str
    name: str
    type: str = "OTHER"
    text: str = ""


class PipelineAsset(BaseModel):
    id: str
    name: str
    assetClass: str = "OTHER"
    currency: str = "USD"
    location: str | None = None
    jurisdiction: str | None = None


class AssetDnaRequest(BaseModel):
    asset: PipelineAsset
    documents: list[PipelineDocument] = []


class CopilotRequest(BaseModel):
    question: str
    envelope: dict[str, Any] | None = None


class CopilotResponse(BaseModel):
    answer: str
    citations: list[dict[str, Any]] = []
