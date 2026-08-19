from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import create_app


def test_health_route_exists() -> None:
    app = create_app()

    routes = {route.path for route in app.routes}

    assert "/api/health" in routes
