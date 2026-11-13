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
         "products.py", "export.py", "rain.py", "rain_imerg.py", "__main__.py"]


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

This notebook turns NISAR L-band radar time series (GCOV) into the map layers used by the TerraPulse web app, for two study sites:

- **Lower Indus, Sindh, Pakistan** (track 164, frame 76, 28 passes)
- **Amazon at Manaus, Brazil** (track 140, frame 90, 10 passes)

Steps:

1. **Rainfall**: daily NASA GPM IMERG (Late Run, V07) averaged over every zone of both sites.
2. **Search** the ASF archive and keep one product per date from a single processing version, plus the newest VALIDATED dates.
3. **Ingest**: stream only the study area out of each 6 GB HDF5 file (parallel range requests of the compressed chunks), drop samples flagged invalid by the NISAR mask, and average onto a common 100 m grid.
4. **Process**: open water calibrated on a reference water body and dry land, flooded vegetation, water occurrence, change metrics, surface rhythm classes, zone statistics.
5. **Download** one zip with the results.

**Before you start (one time):** IMERG lives at NASA GES DISC. In Earthdata Login (https://urs.earthdata.nasa.gov), open *Applications > Authorized Apps > Approve More Applications* and approve **NASA GESDISC DATA ARCHIVE**. Without it the rainfall step is skipped and the app falls back to NASA POWER.

**How to run:** open this notebook at https://colab.research.google.com (File > Upload notebook), then Runtime > Run all. When asked, paste your NASA Earthdata Login token (https://urs.earthdata.nasa.gov/profile, Generate Token). It is read with a hidden prompt and never saved in the notebook. If the runtime disconnects, run all again: finished work is skipped.
"""),
        code("""
# Choose what to run
RUN_IMERG = True          # daily GPM IMERG rainfall for both sites (about 10 to 20 minutes)
NISAR_SITES = ["amazon-manaus"]   # add "lower-indus" to re-run Sindh from scratch (about 20 minutes more)
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
# 1. Daily GPM IMERG rainfall for every zone of both sites (resumable)
import subprocess
if RUN_IMERG:
    r = subprocess.run([sys.executable, "-u", "-m", "terrapulse", "rain", "--site", "all"])
    if r.returncode != 0:
        print("\\nRainfall step did not finish. If the message above mentions GES DISC, approve the "
              "'NASA GESDISC DATA ARCHIVE' application in Earthdata Login and run this cell again. "
              "The rest of the notebook still works and uses NASA POWER rainfall instead.")
"""),
        code("""
# 2 to 4. Search, stream and process each NISAR site
WORKERS = 32 if IN_COLAB else 8
for site in NISAR_SITES:
    print("=" * 30, site, "=" * 30)
    !{sys.executable} -m terrapulse search --site {site}
    !{sys.executable} -u -m terrapulse ingest --site {site} --workers {WORKERS}
    !{sys.executable} -u -m terrapulse process --site {site}
"""),
        code("""
# Quick look at each processed site
import json
import matplotlib.pyplot as plt
from PIL import Image

for site in NISAR_SITES:
    web = WORK / "web" / "data" / site
    man = json.loads((web / "manifest.json").read_text())
    print(site, "passes:", len(man["dates"]), " water thresholds:", man["params"]["water_thresholds_by_mode"])
    fig, ax = plt.subplots(1, 3, figsize=(18, 6))
    ax[0].imshow(Image.open(web / "products" / "water_occurrence.png"), cmap="Blues"); ax[0].set_title("Water occurrence")
    ax[1].imshow(Image.open(web / "products" / "rhythm.png").convert("RGB")); ax[1].set_title("Surface rhythm classes")
    d = man["dates"][0]["date"]
    ax[2].imshow(Image.open(web / "dates" / f"{d}_class.png").convert("RGB")); ax[2].set_title(f"Water classes {d}")
    for a in ax: a.axis("off")
    plt.show()
    z = man["zones"]["all"]["series"]
    plt.figure(figsize=(14, 3))
    plt.plot([x["date"] for x in man["dates"]], [s["water_km2"] if s else None for s in z], "o-", label="open water")
    plt.plot([x["date"] for x in man["dates"]], [s["flooded_veg_km2"] if s else None for s in z], "s--", label="flooded vegetation")
    plt.xticks(rotation=60); plt.ylabel("km2"); plt.legend(); plt.title(man["site"]["name"]); plt.show()
"""),
        code("""
# 5. Download one zip with everything the app needs (web layers, rainfall, small analysis cache)
import zipfile
out = WORK / "terrapulse_results.zip"
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for site in NISAR_SITES:
        for p in (WORK / "web" / "data" / site).rglob("*"):
            if p.is_file():
                z.write(p, p.relative_to(WORK).as_posix())
        for p in (WORK / "cache" / site).rglob("*"):
            if p.is_file():
                z.write(p, p.relative_to(WORK).as_posix())
    for p in (WORK / "cache").glob("*/rain_imerg.json"):
        z.write(p, p.relative_to(WORK).as_posix())
print(out.name, round(out.stat().st_size / 1e6, 1), "MB")
if IN_COLAB:
    from google.colab import files
    files.download(str(out))
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
