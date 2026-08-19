from fastapi import FastAPI

from app.api.routes import router
from app.core.settings import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="CAPROV Intelligence Engine",
        version="0.1.0",
        description="AI workflows for document intelligence, Asset DNA, valuation, risk, and copilot.",
    )
    application.state.settings = settings
    application.include_router(router, prefix="/api")
    return application


app = create_app()
