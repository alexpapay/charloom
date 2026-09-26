"""Small numerical operations used by the conversion pipeline."""

from collections import deque

import numpy as np
from PIL import Image, ImageFilter, ImageOps

from .models import Options


def luminance(rgb: np.ndarray) -> np.ndarray:
    """Return perceptually weighted brightness for normalized sRGB pixels."""
    # Rec. 709 weights on sRGB values: perceptual luma, not linear-light radiometry.
    return np.asarray(rgb, dtype=np.float64) @ np.array([0.2126, 0.7152, 0.0722])


def sobel(values: np.ndarray) -> np.ndarray:
    """Return normalized edge strength without wraparound at image boundaries."""
    padded = np.pad(values, 1, mode="edge")
    a, b, c = padded[:-2, :-2], padded[:-2, 1:-1], padded[:-2, 2:]
    d, f = padded[1:-1, :-2], padded[1:-1, 2:]
    g, h, i = padded[2:, :-2], padded[2:, 1:-1], padded[2:, 2:]
    horizontal = -a + c - 2 * d + 2 * f - g + i
    vertical = -a - 2 * b - c + g + 2 * h + i
    return np.clip(np.hypot(horizontal, vertical) / 4, 0, 1)


def border_connected(candidates: np.ndarray) -> np.ndarray:
    """Mask only dark cells reachable from the border; preserve enclosed features."""
    rows, columns = candidates.shape
    mask = np.zeros_like(candidates, dtype=bool)
    queue = deque()

    def visit(y: int, x: int) -> None:
        if candidates[y, x] and not mask[y, x]:
            mask[y, x] = True
            queue.append((y, x))

    for x in range(columns):
        visit(0, x)
        visit(rows - 1, x)
    for y in range(rows):
        visit(y, 0)
        visit(y, columns - 1)
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < rows and 0 <= nx < columns:
                visit(ny, nx)
    return mask


def sample(image: Image.Image, columns: int, rows: int, options: Options) -> np.ndarray:
    """Fit in physical image coordinates before correcting for tall character cells."""
    aspect = options.image_aspect or image.width / image.height
    working_size = (columns * 4, max(1, round(columns * 4 / aspect)))
    if options.crop == "cover":
        framed = ImageOps.fit(image, working_size, method=Image.Resampling.LANCZOS)
    else:
        framed = ImageOps.pad(
            image, working_size, method=Image.Resampling.LANCZOS, color=(0, 0, 0, 0)
        )
    with framed, framed.resize((columns, rows), Image.Resampling.LANCZOS) as resized:
        return np.asarray(resized, dtype=np.float64) / 255


def density_and_mask(pixels: np.ndarray, options: Options) -> tuple[np.ndarray, np.ndarray]:
    """Combine tone and contours, keeping background decisions independent of inversion."""
    alpha = pixels[:, :, 3]
    original = luminance(pixels[:, :, :3]) * alpha
    mask = alpha < 0.1
    if options.background == "threshold":
        mask |= original <= options.threshold
    elif options.background == "transparent-as-space":
        mask |= border_connected(original <= options.threshold)

    values = original
    if options.detail:
        with Image.fromarray(np.uint8(original * 255)) as gray:
            with gray.filter(ImageFilter.GaussianBlur(1)) as blurred:
                low_frequency = np.asarray(blurred, dtype=np.float64) / 255
        values = np.clip(values + options.detail * (values - low_frequency), 0, 1)
    values = np.clip((values * options.brightness - 0.5) * options.contrast + 0.5, 0, 1)
    values = np.power(values, options.gamma)
    values = (1 - options.edge_weight) * values + options.edge_weight * sobel(values)
    if options.invert:
        values = 1 - values
    return np.clip(values, 0, 1), mask
