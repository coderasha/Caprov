from fastapi import APIRouter

from app.api.schemas import (
    AssetDnaRequest,
    CopilotRequest,
    CopilotResponse,
    HealthResponse,
)
from caprov_intelligence.pipeline import answer_copilot, run_asset_dna

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(
        service="caprov-intelligence-engine",
        status="ok",
    )


@router.post("/pipeline/asset-dna")
def asset_dna(payload: AssetDnaRequest) -> dict:
    return run_asset_dna(payload.asset.model_dump(), [document.model_dump() for document in payload.documents])


@router.post("/pipeline/copilot", response_model=CopilotResponse)
def copilot(payload: CopilotRequest) -> CopilotResponse:
    result = answer_copilot(payload.question, payload.envelope)
    return CopilotResponse(**result)
