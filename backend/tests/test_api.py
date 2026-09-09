import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "AethelExult" in data["service"] or "WebMind" in data["service"]


def test_settings_endpoint():
    response = client.get("/api/settings")
    assert response.status_code == 200
    data = response.json()
    assert "default_provider" in data
    assert "chunk_size" in data


def test_knowledge_bases_list():
    response = client.get("/api/knowledge-bases")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
