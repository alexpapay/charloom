import asyncio
import io
import json
import threading

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

import ascii_gen.web as web
from ascii_gen.web import app

client = TestClient(app)


@pytest.fixture
def anyio_backend():
    return "asyncio"


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


@pytest.mark.anyio
async def test_slow_uploads_do_not_reserve_conversion_slots():
    ready = [asyncio.Event(), asyncio.Event()]
    release = asyncio.Event()
    image = png((16, 16))

    async def slow_body(index):
        yield image[:1]
        ready[index].set()
        await release.wait()
        yield image[1:]

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
        uploads = [
            asyncio.create_task(async_client.post("/api/convert", content=slow_body(index)))
            for index in range(2)
        ]
        await asyncio.wait_for(asyncio.gather(*(event.wait() for event in ready)), timeout=3)

        try:
            demo_response = await async_client.get("/api/demo")
        finally:
            release.set()

        upload_responses = await asyncio.gather(*uploads)

    assert demo_response.status_code == 200
    assert [response.status_code for response in upload_responses] == [200, 200]


@pytest.mark.anyio
async def test_slow_uploads_leave_request_capacity_for_demo():
    ready = [asyncio.Event() for _ in range(4)]
    release = asyncio.Event()
    image = png((16, 16))

    async def slow_body(index):
        yield image[:1]
        ready[index].set()
        await release.wait()
        yield image[1:]

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
        uploads = [
            asyncio.create_task(async_client.post("/api/convert", content=slow_body(index)))
            for index in range(4)
        ]
        await asyncio.wait_for(asyncio.gather(*(event.wait() for event in ready)), timeout=3)

        try:
            excess_upload = await async_client.post("/api/convert", content=image)
            demo_response = await async_client.get("/api/demo")
        finally:
            release.set()

        upload_responses = await asyncio.gather(*uploads)

    assert excess_upload.status_code == 503
    assert demo_response.status_code == 200
    assert sorted(response.status_code for response in upload_responses) == [200, 200, 503, 503]


@pytest.mark.anyio
async def test_active_conversions_still_share_two_slots(monkeypatch):
    ready = [threading.Event(), threading.Event()]
    release = threading.Event()
    counter_lock = threading.Lock()
    next_index = 0
    original_decode = web.decode

    def blocking_decode(content, options):
        nonlocal next_index
        with counter_lock:
            index = next_index
            next_index += 1
        ready[index].set()
        release.wait(timeout=5)
        return original_decode(content, options)

    monkeypatch.setattr(web, "decode", blocking_decode)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
        uploads = [
            asyncio.create_task(async_client.post("/api/convert", content=png((16, 16))))
            for _ in range(2)
        ]
        ready_results = await asyncio.gather(
            *(asyncio.to_thread(event.wait, 3) for event in ready),
        )
        assert ready_results == [True, True]

        try:
            demo_response = await async_client.get("/api/demo")
        finally:
            release.set()

        upload_responses = await asyncio.gather(*uploads)

    assert demo_response.status_code == 503
    assert demo_response.json() == {"detail": "Converter is busy. Please try again shortly."}
    assert [response.status_code for response in upload_responses] == [200, 200]


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
