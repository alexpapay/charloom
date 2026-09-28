"""Optional bounded HTTP playground around the same offline Python engine."""

import asyncio
import io
import json
import math
from dataclasses import asdict, replace
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from .demo import orbit
from .generator import generate
from .models import Options
from .preview import preview_png

MAX_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 16_000_000
STATIC = Path(__file__).with_name("static")
app = FastAPI(title="Charloom", docs_url=None, redoc_url=None, openapi_url=None)
slots = asyncio.Semaphore(2)
upload_slots = asyncio.Semaphore(4)


@app.middleware("http")
async def headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self' https://www.googletagmanager.com; "
        "style-src 'self' 'unsafe-inline'; "
        "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com "
        "https://www.googletagmanager.com; "
        "img-src 'self' blob: data: https://*.google-analytics.com "
        "https://www.googletagmanager.com; "
        "object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    )
    response.headers["Cache-Control"] = "no-store"
    if (
        request.url.path.startswith("/api/")
        or request.url.path == "/healthz"
        or (request.url.path.startswith("/static/") and request.url.path.endswith(".html"))
    ):
        response.headers["X-Robots-Tag"] = "noindex"
    return response


def parse_options(value: str) -> Options:
    """Validate options before decoding an uploaded image."""
    try:
        if len(value) > 4096:
            raise ValueError("Options are too long")
        options = Options(**json.loads(value))
        options.validate()
        if len(options.widths) > 6:
            raise ValueError("Playground supports up to 6 sizes, at most 400 columns")
        return options
    except (ValueError, TypeError) as error:
        raise HTTPException(422, str(error)) from error


def convert(image: Image.Image, options: Options) -> dict:
    """Bound grid work and return text with independent opacity levels."""
    if image.width * image.height > MAX_PIXELS:
        raise ValueError("Image exceeds 16 megapixels; resize it first")
    aspect = options.image_aspect or image.width / image.height
    if image.getexif().get(274) in (5, 6, 7, 8) and options.image_aspect is None:
        aspect = 1 / aspect
    rows = [
        max(1, math.floor(width / aspect * options.character_aspect + 0.5))
        for width in options.widths
    ]
    retained = tuple(w for w, r in zip(options.widths, rows, strict=True) if r <= 400)
    skipped = [w for w in options.widths if w not in retained]
    if (
        not retained
        or sum(w * r for w, r in zip(options.widths, rows, strict=True) if w in retained) > 80_000
    ):
        raise ValueError("Output is too tall or large; use fewer columns or crop the image")
    options = replace(options, widths=retained)
    return {
        "schemaVersion": 1,
        "options": asdict(options),
        "variants": [asdict(variant) for variant in generate(image, options)],
        "warnings": [
            f"Skipped {', '.join(map(str, skipped))} columns "
            "to preserve proportions within the row limit."
        ]
        if skipped
        else [],
    }


def decode(content: bytes, options: Options, preview: bool = False) -> dict | Response:
    try:
        with Image.open(io.BytesIO(content), formats=("JPEG", "PNG", "WEBP")) as image:
            if preview:
                return Response(preview_png(image, options), media_type="image/png")
            return convert(image, options)
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError) as error:
        raise HTTPException(
            422,
            "Cannot convert image. Use a valid PNG, JPEG or WebP up to 16 MP. "
            "Very tall outputs need fewer columns.",
        ) from error


@app.post("/api/convert")
async def upload(request: Request, options: str = "{}", preview: bool = False):
    settings = parse_options(options)
    if slots.locked():
        raise HTTPException(503, "Converter is busy. Please try again shortly.")
    if upload_slots.locked():
        raise HTTPException(503, "Converter is busy. Please try again shortly.")

    async with upload_slots:
        content = bytearray()
        try:
            async with asyncio.timeout(20):
                async for chunk in request.stream():
                    if len(content) + len(chunk) > MAX_BYTES:
                        raise HTTPException(413, "Image exceeds 8 MB")
                    content.extend(chunk)
        except TimeoutError as error:
            raise HTTPException(408, "Upload timed out") from error

    if slots.locked():
        raise HTTPException(503, "Converter is busy. Please try again shortly.")
    async with slots:
        if preview:
            return await run_in_threadpool(decode, bytes(content), settings, True)
        return await run_in_threadpool(decode, bytes(content), settings)


@app.get("/api/demo")
async def demo(options: str = "{}", preview: bool = False):
    settings = parse_options(options)
    if slots.locked():
        raise HTTPException(503, "Converter is busy. Please try again shortly.")

    def build():
        with orbit() as image:
            if preview:
                return Response(preview_png(image, settings), media_type="image/png")
            return convert(image, settings)

    async with slots:
        try:
            return await run_in_threadpool(build)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error


@app.get("/healthz")
def health():
    return {"status": "ok"}


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/guide")
def guide():
    """Serve the readable conversion guide without requiring JavaScript."""
    return FileResponse(STATIC / "guide.html")


@app.get("/privacy")
def privacy():
    """Explain uploads and optional analytics."""
    return FileResponse(STATIC / "privacy.html")


@app.get("/favicon.ico")
def favicon():
    """Provide a raster favicon for browsers that do not use the SVG icon."""
    return FileResponse(STATIC / "favicon.ico", media_type="image/x-icon")


@app.get("/apple-touch-icon.png")
def apple_touch_icon():
    """Provide the iOS and iPadOS Home Screen icon at its conventional path."""
    return FileResponse(STATIC / "apple-touch-icon.png", media_type="image/png")


@app.get("/robots.txt")
def robots():
    """Expose crawler guidance and the sitemap location."""
    return FileResponse(STATIC / "robots.txt", media_type="text/plain")


@app.get("/sitemap.xml")
def sitemap():
    """List canonical public pages."""
    return FileResponse(STATIC / "sitemap.xml", media_type="application/xml")


app.mount("/static", StaticFiles(directory=STATIC), name="static")


def main():
    """Start a local-only playground; production uses an explicit ASGI command."""
    import uvicorn

    uvicorn.run("ascii_gen.web:app", host="127.0.0.1", port=4175)
