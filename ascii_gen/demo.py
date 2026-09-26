"""Original mathematical sample; no external images or personal photos."""

import numpy as np
from PIL import Image


def orbit() -> Image.Image:
    """Make a shaded planet and inclined rings for a redistributable demo."""
    y, x = np.mgrid[-1:1:512j, -1:1:512j]
    radius = np.sqrt(x * x + y * y)
    z = np.sqrt(np.clip(0.48**2 - radius**2, 0, 1)) / 0.48
    light = np.clip(-0.5 * x / 0.48 - 0.35 * y / 0.48 + 0.8 * z, 0, 1)
    bands = 0.78 + 0.22 * np.sin(y * 45 + x * 7)
    sphere = radius < 0.48
    u, v = 0.9 * x + 0.43 * y, -0.43 * x + 0.9 * y
    ring = np.sqrt((u / 0.9) ** 2 + (v / 0.24) ** 2)
    rings = (ring > 0.72) & (ring < 1) & ((~sphere) | (v > 0))
    values = np.where(sphere, 0.1 + 0.9 * light * bands, 0)
    values[rings] = 0.4 + 0.5 * np.sin(ring[rings] * 90) ** 2
    return Image.fromarray(np.uint8(np.clip(values, 0, 1) * 255))
