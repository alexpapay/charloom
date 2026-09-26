from dataclasses import replace

import numpy as np
import pytest
from PIL import Image

from ascii_gen.generator import generate
from ascii_gen.models import Options
from ascii_gen.processing import luminance, sobel


def test_independent_variants_have_consistent_width_and_correct_cell_aspect():
    with Image.new("RGB", (160, 80), "white") as source:
        variants = generate(source, Options(widths=(32, 40, 72, 120)))

    assert [(v.name, v.columns, v.rows) for v in variants] == [
        ("xs", 32, 8),
        ("sm", 40, 10),
        ("lg", 72, 18),
        ("xxl", 120, 30),
    ]
    for variant in variants:
        assert len(variant.text.splitlines()) == variant.rows
        assert all(len(line) == variant.columns for line in variant.text.splitlines())


def test_custom_ramp_and_inversion_have_opposite_black_white_endpoints():
    options = Options(widths=(8,), charset=" .01", character_aspect=1)
    with Image.new("RGB", (8, 8), "black") as black, Image.new("RGB", (8, 8), "white") as white:
        assert set(generate(black, options)[0].text) == {" ", "\n"}
        assert set(generate(white, options)[0].text) == {"1", "\n"}
        assert set(generate(black, replace(options, invert=True))[0].text) == {"1", "\n"}
        assert set(generate(white, replace(options, invert=True))[0].text) == {" ", "\n"}


def test_perceptual_luminance_weights_green_above_red_above_blue():
    result = luminance(np.eye(3))
    np.testing.assert_allclose(result, [0.2126, 0.7152, 0.0722])


def test_sobel_finds_step_without_inventing_edges_in_flat_fields():
    assert not sobel(np.ones((8, 8))).any()
    step = np.zeros((8, 8))
    step[:, 4:] = 1
    edges = sobel(step)
    assert np.all(edges[:, 3:5] > 0)
    assert not edges[:, :2].any()
    assert not edges[:, 6:].any()


def test_transparency_stays_space_even_with_inversion():
    with Image.new("RGBA", (32, 32), (255, 255, 255, 0)) as image:
        variant = generate(
            image, Options(widths=(32,), invert=True, background="transparent-as-space")
        )[0]
    assert set(variant.text) == {" ", "\n"}


def test_border_mask_removes_dark_background_but_preserves_enclosed_dark_detail():
    pixels = np.full((20, 20, 3), 255, dtype=np.uint8)
    pixels[:3] = 0
    pixels[8:12, 8:12] = 0
    with Image.fromarray(pixels) as image:
        options = Options(widths=(20,), character_aspect=1, charset=".X", threshold=0.1)
        masked = generate(image, replace(options, background="transparent-as-space"))[0]
        threshold = generate(image, replace(options, background="threshold"))[0]
    assert masked.text.splitlines()[0] == " " * 20
    assert masked.text.splitlines()[10][10] == "."
    assert threshold.text.splitlines()[10][10] == " "


def test_cover_crops_and_contain_pads_without_stretching():
    with Image.new("RGB", (100, 50), "white") as image:
        options = Options(widths=(20,), character_aspect=1, image_aspect=1)
        contain = generate(image, options)[0].text.splitlines()
        cover = generate(image, replace(options, crop="cover"))[0].text.splitlines()
    assert contain[0] == " " * 20
    assert contain[10] == "@" * 20
    assert cover[0] == cover[-1] == "@" * 20


def test_each_width_matches_a_separate_conversion_and_is_deterministic():
    pixels = np.arange(64 * 48 * 3, dtype=np.uint8).reshape(48, 64, 3)
    with Image.fromarray(pixels) as source:
        options = Options(widths=(32, 56), edge_weight=0.3, detail=0.5)
        first = generate(source, options)
        assert first == generate(source, options)
        for variant in first:
            assert variant == generate(source, replace(options, widths=(variant.columns,)))[0]


@pytest.mark.parametrize(
    "change",
    [
        {"widths": ()},
        {"widths": (0,)},
        {"widths": (-1,)},
        {"widths": (10001,)},
        {"widths": (32, 32)},
        {"widths": (True,)},
        {"widths": (32.5,)},
        {"charset": ""},
        {"charset": "x"},
        {"charset": "xx"},
        {"charset": " .\n"},
        {"charset": " .\t"},
        {"charset": " .界"},
        {"charset": " .\u0301"},
        {"gamma": 0},
        {"gamma": float("nan")},
        {"brightness": float("inf")},
        {"edge_weight": 1.1},
        {"character_aspect": 0},
        {"image_aspect": -1},
        {"crop": "unknown"},
        {"background": "unknown"},
        {"detail": -1},
    ],
)
def test_invalid_options_fail_with_useful_errors(change):
    with pytest.raises(ValueError, match=".+"):
        replace(Options(), **change).validate()
