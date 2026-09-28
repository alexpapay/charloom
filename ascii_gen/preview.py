"""Bounded tonal previews using the converter's image adjustments."""

import io

import numpy as np
from PIL import Image, ImageOps

from .models import Options
from .processing import density_and_mask


def preview_png(image: Image.Image, options: Options) -> bytes:
    """Apply shared tone and mask operations to an oriented thumbnail."""
    if image.width * image.height > 16_000_000:
        raise ValueError("Image exceeds 16 megapixels")
    with ImageOps.exif_transpose(image) as oriented, oriented.convert("RGBA") as source:
        source.thumbnail((512, 512), Image.Resampling.LANCZOS)
        density, mask = density_and_mask(np.asarray(source, dtype=np.float64) / 255, options)
        gray = np.rint(density * 255).astype(np.uint8)
        rgba = np.stack([gray, gray, gray, np.where(mask, 0, 255).astype(np.uint8)], axis=-1)
        with Image.fromarray(rgba) as output:
            buffer = io.BytesIO()
            output.save(buffer, format="PNG")
            return buffer.getvalue()
