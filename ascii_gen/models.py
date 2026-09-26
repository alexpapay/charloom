"""Validated, serializable conversion parameters and text results."""

import math
import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class Options:
    """Density controls; character_aspect is cell width divided by cell height."""

    widths: tuple[int, ...] = (32, 40, 56, 72, 96, 120)
    charset: str = " .:-=+*#%@"
    invert: bool = False
    contrast: float = 1.0
    brightness: float = 1.0
    gamma: float = 1.0
    edge_weight: float = 0.0
    character_aspect: float = 0.5
    crop: str = "contain"
    image_aspect: float | None = None
    background: str = "keep"
    threshold: float = 0.08
    detail: float = 0.0

    def validate(self) -> None:
        """Reject parameters that cannot produce bounded, fixed-width text."""
        if (
            not isinstance(self.widths, (tuple, list))
            or not self.widths
            or len(self.widths) > 24
            or any(type(width) is not int or not 2 <= width <= 400 for width in self.widths)
            or len(set(self.widths)) != len(self.widths)
        ):
            raise ValueError("widths must be 1–24 unique integers between 2 and 400")
        if (
            not isinstance(self.charset, str)
            or not 2 <= len(self.charset) <= 128
            or len(set(self.charset)) != len(self.charset)
            or any(
                not char.isprintable()
                or unicodedata.category(char).startswith(("M", "C"))
                or unicodedata.east_asian_width(char) in {"W", "F"}
                for char in self.charset
            )
        ):
            raise ValueError("charset must contain 2–128 unique, printable, single-cell characters")
        if type(self.invert) is not bool:
            raise ValueError("invert must be a boolean")
        ranges = {
            "contrast": (0, 4),
            "brightness": (0, 4),
            "gamma": (0.1, 5),
            "edge_weight": (0, 1),
            "character_aspect": (0.1, 2),
            "threshold": (0, 1),
            "detail": (0, 2),
        }
        if self.image_aspect is not None:
            ranges["image_aspect"] = (0.1, 10)
        for name, (minimum, maximum) in ranges.items():
            value = getattr(self, name)
            if (
                type(value) not in (int, float)
                or not minimum <= value <= maximum
                or not math.isfinite(value)
            ):
                raise ValueError(f"{name} must be a finite number between {minimum} and {maximum}")
        if self.crop not in ("contain", "cover"):
            raise ValueError("crop must be contain or cover")
        if self.background not in ("keep", "threshold", "transparent-as-space"):
            raise ValueError("background must be keep, threshold or transparent-as-space")


@dataclass(frozen=True)
class Variant:
    """One independently sampled, rectangular text asset."""

    name: str
    columns: int
    rows: int
    text: str
    tones: tuple[tuple[int, ...], ...] = ()
