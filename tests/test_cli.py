import json

import pytest
from PIL import Image

from ascii_gen.cli import main


@pytest.fixture
def source(tmp_path):
    path = tmp_path / "sample.png"
    with Image.new("RGB", (80, 40), "white") as image:
        image.save(path)
    return path


def test_cli_writes_six_plain_text_variants_and_reproducible_metadata(source, tmp_path):
    output = tmp_path / "portrait"
    args = [str(source), "--output", str(output)]
    assert main(args) == 0
    assert len(list(output.glob("*.txt"))) == 6
    metadata = json.loads((output / "portrait.meta.json").read_text())
    assert metadata["variants"]["sm"]["columns"] == 40
    assert metadata["variants"]["sm"]["rows"] == 10
    assert metadata["source"] == "sample.png"
    assert len(metadata["sourceSha256"]) == 64
    files = {p.name: p.read_bytes() for p in output.iterdir()}
    assert main(args) == 0
    assert files == {p.name: p.read_bytes() for p in output.iterdir()}
    for path in output.glob("*.txt"):
        assert b"\r" not in path.read_bytes()
        assert set(path.read_text()) <= set(" .:-=+*#%@\n")


def test_preset_is_loaded_and_explicit_cli_values_override_it(source, tmp_path):
    preset = tmp_path / "custom.json"
    preset.write_text(
        json.dumps(
            {"widths": [32], "charset": " .01", "invert": True, "contrast": 1.2, "edgeWeight": 0.1}
        )
    )
    output = tmp_path / "art"
    assert (
        main(
            [
                "--input",
                str(source),
                "--preset",
                str(preset),
                "--widths",
                "40,72",
                "--no-invert",
                "--edge-weight",
                "0",
                "--output",
                str(output),
            ]
        )
        == 0
    )
    meta = json.loads((output / "art.meta.json").read_text())
    assert set(meta["variants"]) == {"sm", "lg"}
    assert meta["options"]["contrast"] == 1.2
    assert meta["options"]["edge_weight"] == 0
    assert not meta["options"]["invert"]
    assert set((output / "art-sm.txt").read_text()) == {"1", "\n"}


def test_terminal_preview_does_not_write_files(source, tmp_path, capsys):
    assert main([str(source), "--preview", "--width", "40"]) == 0
    assert len(capsys.readouterr().out.splitlines()[0]) == 40
    assert list(tmp_path.iterdir()) == [source]


def test_preview_all_includes_dimensions(source, capsys):
    assert main([str(source), "--preview-all", "--widths", "40,72"]) == 0
    output = capsys.readouterr().out
    assert "40 × 10" in output
    assert "72 × 18" in output


@pytest.mark.parametrize(
    "arguments",
    [
        ["--widths", "0,40"],
        ["--widths", "abc"],
        ["--charset", ""],
        ["--gamma", "nan"],
        ["--preset", "missing-preset"],
        ["--wat"],
    ],
)
def test_invalid_cli_returns_actionable_error_without_traceback(source, arguments, capsys):
    with pytest.raises(SystemExit) as error:
        main([str(source), "--preview", *arguments])
    assert error.value.code == 2
    assert "error:" in capsys.readouterr().err


def test_missing_file_is_reported_cleanly(tmp_path, capsys):
    with pytest.raises(SystemExit) as error:
        main([str(tmp_path / "missing.jpg"), "--preview"])
    assert error.value.code == 2
    assert "missing.jpg" in capsys.readouterr().err


def test_bad_preset_type_and_unknown_key_are_rejected(source, tmp_path):
    preset = tmp_path / "bad.json"
    for values in ({"edgeWeight": "bad"}, {"unknown": 1}, {"widths": [True]}, []):
        preset.write_text(json.dumps(values))
        with pytest.raises(SystemExit) as error:
            main([str(source), "--preset", str(preset), "--preview"])
        assert error.value.code == 2


def test_preview_does_not_reduce_written_variants(source, tmp_path, capsys):
    output = tmp_path / "art"
    assert main([str(source), "--output", str(output), "--preview"]) == 0
    assert len(list(output.glob("*.txt"))) == 6
    assert len(capsys.readouterr().out.splitlines()[0]) == 72


def test_preview_respects_preset_widths(source, tmp_path, capsys):
    preset = tmp_path / "sizes.json"
    preset.write_text(json.dumps({"widths": [40, 120]}))
    output = tmp_path / "art"
    assert main([str(source), "--preset", str(preset), "--output", str(output), "--preview"]) == 0
    meta = json.loads((output / "art.meta.json").read_text())
    assert set(meta["variants"]) == {"sm", "xxl"}
    assert len(capsys.readouterr().out.splitlines()[0]) == 40
