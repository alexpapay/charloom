# Text, tones and HTTP

## CLI output

The output directory's basename becomes the asset name. Standard widths map to `xs/sm/md/lg/xl/xxl`; other sizes use `w48`, etc. TXT is UTF-8 with trailing spaces and final LF. Metadata schema 1 contains options, generator version, source basename/SHA-256 and a variants object with dimensions and relative filenames. No absolute paths or EXIF are exported.

`--tones` adds optional `tonesFile` to each variant. It references a row-major integer matrix, 0–255. Tone is sampled before glyph quantization: `round(255 * (0.2 + 0.8 * sqrt(density)))`. Masked cells are zero. Render nonzero values as `opacity = 1 - strength * (1 - tone / 255)`; zero stays transparent. Strength is 0–1.

## Playground API

`GET /api/demo?options=...` uses the mathematical orbital sample.

`POST /api/convert?options=...` accepts **raw PNG/JPEG/WebP bytes**, not multipart or base64. `options` is URL-encoded JSON using Python option names; omit for defaults. Remote URLs, filesystem paths and named presets are not accepted.

Both return `{ "schemaVersion": 1, "options": {...}, "variants": [...] }`. Each variant has `name`, `columns`, `rows`, `text`, `tones`. Source filenames and EXIF are not returned. This web array is distinct from the CLI file manifest.

Limits: 8 MiB, 16 million pixels, at most 6 widths of 180 columns, 180 rows and 60,000 total output cells. At most two conversion requests per worker. Proxy limits may be tighter. Errors: 413 for upload size, 422 for invalid options/image/output, 408 for upload timeout, 503 when busy. Error body: `{ "detail": "message" }`; framework query validation may use an array in `detail`.

`GET /healthz` returns `{ "status": "ok" }`. No persistence or cross-origin API access. API caching is disabled. Use the local service for sensitive images.

For tall inputs, requested sizes exceeding 180 rows are omitted when smaller sizes still fit. The response's options.widths and variants contain the retained sizes; warnings explains omissions. If no size fits, the request fails with 422.
