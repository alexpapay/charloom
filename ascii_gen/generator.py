"""Pure image-to-text conversion, independent of paths and the CLI."""

import math

import numpy as np
from PIL import Image, ImageOps

from .models import Options, Variant
from .processing import density_and_mask, sample

VARIANT_NAMES = {32: "xs", 40: "sm", 56: "md", 72: "lg", 96: "xl", 120: "xxl"}


def generate(image: Image.Image, options: Options) -> list[Variant]:
    """Generate each requested resolution directly from the supplied image."""
    options.validate()
    variants = []
    ramp = np.array(list(options.charset))
    with ImageOps.exif_transpose(image) as oriented, oriented.convert("RGBA") as source:
        aspect = options.image_aspect or source.width / source.height
        for columns in options.widths:
            rows = max(1, math.floor(columns / aspect * options.character_aspect + 0.5))
            if rows > 800:
                raise ValueError("output exceeds 800 rows; reduce width or set --image-aspect")
            pixels = sample(source, columns, rows, options)
            density, mask = density_and_mask(pixels, options)
            cells = ramp[np.floor(density * (len(ramp) - 1) + 0.5).astype(np.int32)]
            cells[mask] = " "
            text = "\n".join("".join(row) for row in cells) + "\n"
            tones = np.rint(255 * (0.2 + 0.8 * np.sqrt(density))).astype(int)
            tones[mask] = 0
            variants.append(
                Variant(
                    VARIANT_NAMES.get(columns, f"w{columns}"),
                    columns,
                    rows,
                    text,
                    tuple(tuple(int(value) for value in row) for row in tones),
                )
            )
    return variants
