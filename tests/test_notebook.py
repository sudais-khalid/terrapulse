"""The Colab notebook embeds the package source: it must be rebuilt whenever the package changes."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_notebook_matches_package():
    spec = importlib.util.spec_from_file_location("build_notebook", ROOT / "tools" / "build_notebook.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    want = mod.build()
    have = json.loads((ROOT / "notebooks" / "terrapulse_pipeline.ipynb").read_text(encoding="utf-8"))
    assert have["cells"] == want["cells"], "run: python tools/build_notebook.py"


def test_notebook_has_no_secrets():
    text = (ROOT / "notebooks" / "terrapulse_pipeline.ipynb").read_text(encoding="utf-8")
    assert "eyJ0eXAiOiJKV1Q" not in text and "eyJhbGciOi" not in text  # JWT headers (Earthdata tokens)
