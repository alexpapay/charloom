import json

from PIL import Image

from ascii_gen.cli import main
from ascii_gen.generator import generate
from ascii_gen.models import Options


def test_tones_follow_grid_and_preserve_mask():
    with Image.new("RGBA", (20, 20), (255, 255, 255, 0)) as image:
        result = generate(image, Options(widths=(20,)))[0]
    assert len(result.tones) == result.rows
    assert all(len(row) == result.columns for row in result.tones)
    assert not any(value for row in result.tones for value in row)


def test_tones_distinguish_values_that_map_to_same_character():
    values = []
    for gray in (128, 136, 255):
        with Image.new("RGB", (8, 8), (gray, gray, gray)) as image:
            values.append(generate(image, Options(widths=(8,), charset=" X"))[0])
    assert values[0].text == values[1].text
    assert values[0].tones[0][0] < values[1].tones[0][0] < values[2].tones[0][0] == 255


def test_cli_optional_tones_sidecar(tmp_path):
    source = tmp_path / "input.png"
    Image.new("RGB", (20, 20), "white").save(source)
    out = tmp_path / "art"
    assert main([str(source), "--output", str(out), "--width", "40", "--tones"]) == 0
    meta = json.loads((out / "art.meta.json").read_text())
    tone_file = meta["variants"]["sm"]["tonesFile"]
    tones = json.loads((out / tone_file).read_text())
    assert len(tones) == 20
    assert tones[0] == [255] * 40
