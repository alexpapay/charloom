# Changelog

## 0.6.1 — 2026-09-28

- Reduce the upload privacy note size.

- Add Reset settings for the palette and image adjustments, refreshing the live preview while retaining the source, resolution and artwork colors.

## 0.6.0 — 2026-09-28

- Add live tonal previews and Original / Processed comparison when image adjustments change.
- Reuse Python tone processing with 512-pixel previews, serialized debounced requests and stale-response protection.
- Keep ASCII regeneration explicit through Weave image.

## 0.5.0 — 2026-09-28

- Add PNG size presets at 1024, 2048 and 4096 pixels.
- Add custom width or height with automatic proportional sizing and live output dimensions.
- Bound exports to 4096 pixels per side and include dimensions in PNG filenames.

## 0.4.0 — 2026-09-28

- Group TXT, HTML, JSON and clipboard actions in an Export text dialog.
- Add local PNG export with transparent or selected background, preserving proportions, ink, weight and tonal opacity.
- Add independent artwork ink and background controls without changing the site theme.

## 0.3.1 — 2026-09-27

- Add descriptive search metadata, an ASCII guide, privacy page, robots.txt and sitemap.
- Add optional Google Analytics with consent controls and restricted script permissions.

## 0.3.0 — 2026-09-27

- Fit the desktop workspace and artwork to the viewport while preserving proportions.
- Add source comparison, an orbital source preview, seven preset widths and custom widths up to 400 columns.
- Improve live shadow performance and upload concurrency limits.
- Add the AI redraw prompt dialog and separate weave settings.

## 0.2.0

- Initial public Charloom package and hosted playground, extracted from the personal website project.
- Python conversion, tonal opacity and TXT, HTML and JSON exports.
