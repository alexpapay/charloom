# CLI reference

`charloom` and `ascii-gen` are aliases. Use a positional path or `--input`. At least one of `--output`, `--preview`, `--preview-all` is required.

| Option | Default | Meaning |
| --- | --- | --- |
| `--widths` | `32,40,56,72,96,120` | 1–24 unique column counts, each 2–400 |
| `--width` | — | Generate one size instead of a list |
| `--charset` | ` .:-=+*#%@` | Sparse-to-dense ramp; quote whitespace |
| `--preset` | — | `portrait`, `illustration`, `map`, or a JSON path |
| `--brightness` | 1 | Multiplier, 0–4 |
| `--contrast` | 1 | Contrast around midgray, 0–4 |
| `--gamma` | 1 | Tone exponent, 0.1–5; below 1 lifts shadows |
| `--edge-weight` | 0 | Sobel edge blend, 0–1 |
| `--detail` | 0 | Local unsharp detail, 0–2 |
| `--invert` / `--no-invert` | false | Reverse density |
| `--character-aspect` | 0.5 | Cell width / height, 0.1–2 |
| `--image-aspect` | source | Physical frame width / height, 0.1–10 |
| `--crop` | contain | Contain with padding or centered cover crop |
| `--background` | keep | `keep`, `threshold`, `transparent-as-space` |
| `--threshold` | 0.08 | Dark-background threshold, 0–1 |
| `--tones` | false | Write opacity sidecars |
| `--preview` | false | Print 72 columns if present, otherwise the first size |
| `--preview-all` | false | Print all sizes with dimensions |

Preview writes no files unless `--output` is supplied. With both, all requested sizes are written. Requested files are overwritten; unrelated/stale files are not deleted. The manifest identifies the current set.

Rows are `round_half_up(columns / image_aspect * character_aspect)`, bounded to 1–800. EXIF orientation is applied first. Without `--image-aspect`, source proportions are preserved. A square at 72 columns and cell aspect 0.5 becomes 72 × 36 cells, visually square at the correct line height.

Palettes require 2–128 unique printable single-cell characters. Tabs, newlines, combining marks and wide CJK/emoji characters are rejected. Actual density varies by font; arrange the ramp accordingly.

## Pipeline

EXIF → RGBA → aspect-aware fit/pad → Lanczos → Rec. 709 luma → optional detail → brightness/contrast/gamma → Sobel blend → palette → mask. Each resolution is independently sampled; no random dithering.

Luma uses `0.2126R + 0.7152G + 0.0722B` on sRGB values, not linear-light radiometry. Transparency contributes to brightness. Transparent cells remain spaces even when inverted.

`threshold` removes every dark cell. `transparent-as-space` removes dark regions connected to the border, retaining enclosed detail. This is not semantic segmentation; connected dark clothing can disappear. For prepared transparent PNGs, use `keep`.

Preset keys accept snake_case and aliases `edgeWeight`, `characterAspectRatio`, `imageAspectRatio`, `characterRamp`. Unknown options fail. Explicit CLI arguments override valid presets. Use `uv sync --locked` for reproducible dependencies.
