# Preparing inputs for text art

A clear silhouette and large readable tones usually matter more than camera resolution. Try a close crop, visible eyes, separated glasses rims and a simple background. Keep important shadows above solid black. The converter itself does not call an AI service.

This optional AI redraw prompt was adapted from the selected **B / bold contours** experiment. Supply your own image as the edit target. Identity preservation is a goal, not a guarantee: compare every redraw with its source.

```text
Use case: style-transfer.
Input image: the supplied photograph is the edit target and exact identity reference.
Redraw the person as a grayscale portrait specifically for downstream ASCII conversion at 40 to 120 columns. Preserve facial proportions and identity, apparent age, head tilt, gaze, expression, eyewear, hair, facial hair and clothing exactly as in the input. Do not add features absent from the original.
Composition: preserve the input aspect ratio and pose. Keep the full head, hair or hood and chin inside the frame; keep the face large. Do not stretch or squash the subject. Pure black background.
Style: bold clean five-tone screen-print portrait: black, dark gray, middle gray, light gray, off-white. Broad flat shapes, minimal transitions, deliberate substantial dark contours. Prioritize unmistakable eye shapes, clear eyewear rims when present, nose silhouette, mouth, and facial hair boundary when present. Lift shadowed eyes and cheeks to retain facial information. Clothing should be mainly middle gray with a few light fold edges, subordinate to the face. Simplify hair and facial hair into large dark and midtone shapes with a few broad light accents, no individual hairs. Features must remain readable at small thumbnail size, without turning into a generic cartoon.
No text, letters, ASCII characters, grid, halftone, hatching, stippling, fine noisy texture, pencil scratchwork, new expression, caricature, watermark or color tint. Output a single finished illustration.
```

```sh
uv run charloom redraw.png --preset presets/portrait-redraw.json --tones --output output/portrait
```

This recipe keeps the input aspect ratio and avoids sharpening already-simplified tones. `presets/portrait-hood.json` is a legacy square-crop recipe for reproducing the originating site's portrait, not a universal preset.

Test 40, 72 and 120 columns. Inspect eyes, glasses and mouth, not just the silhouette. At 40 columns, distinct features may occupy only one or two cells.
