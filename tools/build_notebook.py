"""Build notebooks/terrapulse_pipeline.ipynb: a self-contained Colab notebook.

The pipeline modules are embedded as readable %%writefile cells, so the notebook
runs in Google Colab with no upload and always matches the code in terrapulse/.

    python tools/build_notebook.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / "terrapulse"
OUT = ROOT / "notebooks" / "terrapulse_pipeline.ipynb"
ORDER = ["__init__.py", "config.py", "geo.py", "remote.py", "catalog.py", "ingest.py",
         "products.py", "export.py", "rain.py", "__main__.py"]


def md(text: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").splitlines(keepends=True)}


def code(text: str) -> dict:
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [],
            "source": text.strip("\n").splitlines(keepends=True)}


def build() -> dict:
    cells = [
        md("""
# TerraPulse: NISAR surface change pipeline

Reading Earth's signals. Revealing its changes.

This notebook turns a year of NISAR L-band radar (GCOV, track 164, frame 76, Lower Sindh, Pakistan) into the map layers used by the TerraPulse web app.

1. **Search** the ASF archive and keep one product per date from a single processing version (PROVISIONAL, CRID P05023), plus the newest VALIDATED date.
2. **Ingest**: stream only the study area out of each 6 GB HDF5 file (parallel range requests of the compressed chunks), drop samples flagged invalid by the NISAR mask, and average onto a common 100 m grid.
3. **Process**: open water, flooded vegetation, water occurrence, change metrics, surface rhythm classes, zone statistics, NASA POWER rainfall.
4. **Export** small PNG layers and a manifest, then download them as one zip.

**How to run:** open this notebook at https://colab.research.google.com (File > Upload notebook), then Runtime > Run all. When asked, paste your NASA Earthdata Login token (https://urs.earthdata.nasa.gov/profile, Generate Token). It is read with a hidden prompt and never saved in the notebook. If the runtime disconnects, run all again: finished dates are skipped.
"""),
        code("""
# Setup: work in a scratch folder and install the few libraries Colab lacks.
import os, sys, pathlib
IN_COLAB = "google.colab" in sys.modules
WORK = pathlib.Path("/content/terrapulse_run") if IN_COLAB else pathlib.Path.cwd() / "terrapulse_run"
(WORK / "terrapulse").mkdir(parents=True, exist_ok=True)
os.chdir(WORK)
%pip install -q asf_search fsspec aiohttp h5py scipy pillow
print("Working in", WORK)
"""),
        md("## Pipeline code\n\nThe cells below write the `terrapulse` Python package (the same code as the project repository)."),
    ]
    for name in ORDER:
        src = (PKG / name).read_text(encoding="utf8")
        cells.append(code(f"%%writefile terrapulse/{name}\n{src}"))
    cells += [
        md("## Run"),
        code("""
# Earthdata Login token (hidden input, kept only in this session's memory)
from getpass import getpass
if not os.environ.get("EARTHDATA_TOKEN"):
    os.environ["EARTHDATA_TOKEN"] = getpass("Earthdata Login token: ").strip()
print("token set:", bool(os.environ["EARTHDATA_TOKEN"]))
"""),
        code("""
# 1. Search the archive and choose one product per date
!{sys.executable} -m terrapulse search
"""),
        code("""
# 2. Stream the study area from every date onto the 100 m grid (resumable)
WORKERS = 32 if IN_COLAB else 8
!{sys.executable} -u -m terrapulse ingest --workers {WORKERS}
"""),
        code("""
# 3. Compute products and write web layers
!{sys.executable} -u -m terrapulse process
"""),
        code("""
# 4. Quick look
import json
import matplotlib.pyplot as plt
from PIL import Image

web = WORK / "web" / "data" / "lower-indus"
man = json.loads((web / "manifest.json").read_text())
print("dates:", len(man["dates"]), " water thresholds HH/HV:", man["params"]["water_hh_db"], man["params"]["water_hv_db"])
fig, ax = plt.subplots(1, 3, figsize=(18, 6))
ax[0].imshow(Image.open(web / "products" / "water_occurrence.png"), cmap="Blues"); ax[0].set_title("Water occurrence")
ax[1].imshow(Image.open(web / "products" / "rhythm.png").convert("RGB")); ax[1].set_title("Surface rhythm classes")
d = man["dates"][len(man["dates"]) // 2]["date"]
ax[2].imshow(Image.open(web / "dates" / f"{d}_hh.png"), cmap="gray"); ax[2].set_title(f"HH {d}")
for a in ax: a.axis("off")
plt.show()
z = man["zones"]["all"]["series"]
plt.figure(figsize=(14, 3))
plt.plot([x["date"] for x in man["dates"]], [s["water_km2"] if s else None for s in z], "o-")
plt.xticks(rotation=60); plt.ylabel("open water km2"); plt.title("Open water, whole study area"); plt.show()
"""),
        code("""
# 5. Download the web layers (about 70 MB). Unzip into the project's web/data/ folder.
import shutil
shutil.make_archive("terrapulse_web_data", "zip", WORK / "web" / "data")
print("terrapulse_web_data.zip", round(os.path.getsize("terrapulse_web_data.zip") / 1e6, 1), "MB")
DOWNLOAD_CACHE = False  # set True to also download the 100 m analysis cache (about 120 MB)
if DOWNLOAD_CACHE:
    shutil.make_archive("terrapulse_cache", "zip", WORK / "cache")
if IN_COLAB:
    from google.colab import files
    files.download("terrapulse_web_data.zip")
    if DOWNLOAD_CACHE:
        files.download("terrapulse_cache.zip")
"""),
    ]
    return {
        "cells": cells,
        "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
                     "language_info": {"name": "python"}, "colab": {"provenance": []}},
        "nbformat": 4, "nbformat_minor": 5,
    }


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), indent=1, ensure_ascii=False) + "\n", encoding="utf8")
    print("wrote", OUT.relative_to(ROOT))
