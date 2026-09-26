import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from ascii_gen.web import app

client = TestClient(app)


def png(size=(80, 40)):
    buffer = io.BytesIO()
    Image.new("RGB", size, "white").save(buffer, format="PNG")
    return buffer.getvalue()


def test_upload_returns_text_and_opacity_with_preserved_proportions():
    response = client.post(
        "/api/convert", params={"options": json.dumps({"widths": [40, 72]})}, content=png()
    )
    assert response.status_code == 200
    data = response.json()
    assert data["schemaVersion"] == 1
    assert [(v["columns"], v["rows"]) for v in data["variants"]] == [(40, 10), (72, 18)]
    assert len(data["variants"][0]["tones"]) == 10
    assert "source" not in data
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "options", [{"widths": [400]}, {"unknown": 1}, {"widths": [True]}, {"gamma": 0}, []]
)
def test_invalid_options_are_rejected(options):
    assert (
        client.post(
            "/api/convert", params={"options": json.dumps(options)}, content=png()
        ).status_code
        == 422
    )


def test_invalid_image_and_oversized_upload_are_rejected():
    assert client.post("/api/convert", content=b"not an image").status_code == 422
    assert client.post("/api/convert", content=b"x" * (8 * 1024 * 1024 + 1)).status_code == 413


def test_tall_output_is_bounded():
    response = client.post(
        "/api/convert", params={"options": json.dumps({"widths": [180]})}, content=png((5, 100))
    )
    assert response.status_code == 422


def test_demo_and_health_are_available_without_upload():
    assert client.get("/healthz").json() == {"status": "ok"}
    assert client.get("/api/demo").status_code == 200
    assert "Charloom" in client.get("/").text


def test_tall_image_keeps_resolutions_that_fit():
    response = client.post(
        "/api/convert",
        params={"options": json.dumps({"widths": [40, 72, 120, 180]})},
        content=png((400, 1000)),
    )
    assert response.status_code == 200
    assert [v["columns"] for v in response.json()["variants"]] == [40, 72, 120]
    assert response.json()["warnings"]


def test_huge_numeric_option_is_validation_error():
    assert (
        client.get("/api/demo", params={"options": json.dumps({"gamma": 10**400})}).status_code
        == 422
    )
