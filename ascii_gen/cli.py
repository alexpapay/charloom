"""CLI parsing, presets and UTF-8 asset writing."""

import argparse
import json
import sys
from dataclasses import asdict, fields
from hashlib import sha256
from importlib.resources import files
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from . import __version__
from .generator import generate
from .models import Options, Variant


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Generate responsive text art offline.")
    result.add_argument("source", nargs="?", type=Path, help="source JPG, PNG or WebP")
    result.add_argument("--input", type=Path, help="alternative to positional source")
    result.add_argument("--output", type=Path, help="directory for text files and metadata")
    result.add_argument("--preset", help="portrait, illustration, map, or a JSON file")
    result.add_argument("--tones", action="store_true", help="write color-independent opacity JSON")
    widths = result.add_mutually_exclusive_group()
    widths.add_argument("--widths", help="comma-separated columns (default: 32,40,56,72,96,120)")
    widths.add_argument("--width", type=int, help="generate one column width")
    result.add_argument("--charset", help="density ramp, sparse to dense; quote spaces")
    result.add_argument("--invert", action=argparse.BooleanOptionalAction, default=None)
    for name in (
        "contrast",
        "brightness",
        "gamma",
        "edge-weight",
        "character-aspect",
        "image-aspect",
        "threshold",
        "detail",
    ):
        result.add_argument(f"--{name}", type=float, default=None)
    result.add_argument("--crop", choices=("contain", "cover"))
    result.add_argument("--background", choices=("keep", "threshold", "transparent-as-space"))
    previews = result.add_mutually_exclusive_group()
    previews.add_argument("--preview", action="store_true", help="print one variant")
    previews.add_argument("--preview-all", action="store_true", help="print all variants")
    result.add_argument("--version", action="version", version=f"ascii-gen {__version__}")
    return result


def load_preset(name: str) -> dict:
    """Load packaged or custom presets, accepting documented camelCase JSON names."""
    aliases = {
        "edgeWeight": "edge_weight",
        "characterAspectRatio": "character_aspect",
        "imageAspectRatio": "image_aspect",
        "characterRamp": "charset",
    }
    if name in ("portrait", "illustration", "map"):
        content = files("ascii_gen").joinpath("presets", f"{name}.json").read_text("utf-8")
    else:
        content = Path(name).read_text(encoding="utf-8")
    values = json.loads(content)
    if not isinstance(values, dict):
        raise ValueError("preset must be a JSON object")
    normalized = {}
    allowed = {field.name for field in fields(Options)}
    for key, value in values.items():
        key = aliases.get(key, key)
        if key not in allowed:
            raise ValueError(f"unknown preset option: {key}")
        if key in normalized:
            raise ValueError(f"duplicate preset option: {key}")
        normalized[key] = value
    Options(**normalized).validate()
    return normalized


def write_assets(
    output: Path, source: Path, options: Options, variants: list[Variant], tones: bool = False
) -> None:
    """Write text and complete reproducibility metadata; never copy the source image."""
    name = output.resolve().name
    output.mkdir(parents=True, exist_ok=True)
    metadata = {
        "schemaVersion": 1,
        "generatorVersion": __version__,
        "source": source.name,
        "sourceSha256": sha256(source.read_bytes()).hexdigest(),
        "options": asdict(options),
        "variants": {},
    }
    for variant in variants:
        filename = f"{name}-{variant.name}.txt"
        (output / filename).write_text(variant.text, encoding="utf-8", newline="\n")
        metadata["variants"][variant.name] = {
            "columns": variant.columns,
            "rows": variant.rows,
            "file": filename,
        }
        if tones:
            tone_file = f"{name}-{variant.name}.tones.json"
            (output / tone_file).write_text(json.dumps(variant.tones) + "\n", encoding="utf-8")
            metadata["variants"][variant.name]["tonesFile"] = tone_file
    content = json.dumps(metadata, ensure_ascii=False, indent=2) + "\n"
    (output / f"{name}.meta.json").write_text(content, encoding="utf-8", newline="\n")


def main(argv: list[str] | None = None) -> int:
    """Run the offline generator; return an exit code suitable for the shell."""
    argument_parser = parser()
    args = argument_parser.parse_args(argv)
    if bool(args.source) == bool(args.input):
        argument_parser.error("provide exactly one source: a positional path or --input")
    source = args.source or args.input
    if not args.output and not args.preview and not args.preview_all:
        argument_parser.error("provide --output, --preview or --preview-all")
    try:
        values = load_preset(args.preset) if args.preset else {}
        for field in fields(Options):
            value = getattr(args, field.name, None)
            if value is not None and field.name != "widths":
                values[field.name] = value
        if args.widths is not None:
            try:
                values["widths"] = tuple(int(value) for value in args.widths.split(","))
            except ValueError as error:
                raise ValueError("widths must be comma-separated integers") from error
        elif args.width is not None:
            values["widths"] = (args.width,)
        options = Options(**values)
        options.validate()

        with Image.open(source) as image:
            variants = generate(image, options)
        if args.output:
            write_assets(args.output, source, options, variants, args.tones)
        if args.preview or args.preview_all:
            preview_variant = next((item for item in variants if item.columns == 72), variants[0])
            for variant in variants if args.preview_all else [preview_variant]:
                if args.preview_all:
                    print(f"--- {variant.name}: {variant.columns} × {variant.rows} ---")
                print(variant.text, end="")
        elif args.output:
            print(f"Generated {len(variants)} variants in {args.output}")
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError) as error:
        argument_parser.error(str(error))
    except KeyboardInterrupt:
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
