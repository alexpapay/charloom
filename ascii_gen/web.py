"""Optional bounded HTTP playground around the same offline Python engine."""

import asyncio
import io
import json
import math
from dataclasses import asdict, replace
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from .demo import orbit
from .generator import generate
from .models import Options

MAX_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 16_000_000
STATIC = Path(__file__).with_name("static")
app = FastAPI(title="Charloom", docs_url=None, redoc_url=None, openapi_url=None)
slots = asyncio.Semaphore(2)


@app.middleware("http")
async def headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    )
    response.headers["Cache-Control"] = "no-store"
    return response


def parse_options(value: str) -> Options:
    """Validate options before decoding an uploaded image."""
    try:
        if len(value) > 4096:
            raise ValueError("Options are too long")
        options = Options(**json.loads(value))
        options.validate()
        if len(options.widths) > 6 or max(options.widths) > 180:
            raise ValueError("Playground supports up to 6 sizes, at most 180 columns")
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
    retained = tuple(w for w, r in zip(options.widths, rows, strict=True) if r <= 180)
    skipped = [w for w in options.widths if w not in retained]
    if (
        not retained
        or sum(w * r for w, r in zip(options.widths, rows, strict=True) if w in retained) > 60_000
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


def decode(content: bytes, options: Options) -> dict:
    try:
        with Image.open(io.BytesIO(content), formats=("JPEG", "PNG", "WEBP")) as image:
            return convert(image, options)
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError) as error:
        raise HTTPException(
            422,
            "Cannot convert image. Use a valid PNG, JPEG or WebP up to 16 MP. "
            "Very tall outputs need fewer columns.",
        ) from error


@app.post("/api/convert")
async def upload(request: Request, options: str = "{}"):
    settings = parse_options(options)
    if slots.locked():
        raise HTTPException(503, "Converter is busy. Please try again shortly.")
    async with slots:
        content = bytearray()
        try:
            async with asyncio.timeout(20):
                async for chunk in request.stream():
                    if len(content) + len(chunk) > MAX_BYTES:
                        raise HTTPException(413, "Image exceeds 8 MB")
                    content.extend(chunk)
        except TimeoutError as error:
            raise HTTPException(408, "Upload timed out") from error
        return await run_in_threadpool(decode, bytes(content), settings)


@app.get("/api/demo")
async def demo(options: str = "{}"):
    settings = parse_options(options)
    if slots.locked():
        raise HTTPException(503, "Converter is busy. Please try again shortly.")

    def build():
        with orbit() as image:
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


app.mount("/static", StaticFiles(directory=STATIC), name="static")


def main():
    """Start a local-only playground; production uses an explicit ASGI command."""
    import uvicorn

    uvicorn.run("ascii_gen.web:app", host="127.0.0.1", port=4175)
