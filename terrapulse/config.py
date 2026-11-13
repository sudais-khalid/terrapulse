"""Study sites and processing settings."""
from __future__ import annotations

from dataclasses import dataclass, field

# NISAR GCOV collections, in order of trust for a consistent time series.
CORE_COLLECTION = "NISAR_L2_GCOV_PROVISIONAL_V1"
VALIDATED_COLLECTION = "NISAR_L2_GCOV_V1"
BETA_COLLECTION = "NISAR_L2_GCOV_BETA_V1"

GCOV_GROUP = "/science/LSAR/GCOV/grids/frequencyA"
POLS = ("HHHH", "HVHV")

# Permanent NISAR instrument data gap (NISAR Data User Guide, availability page).
DATA_GAP = ("2026-07-27T22:03:25Z", "2026-08-10T00:55:27Z")


@dataclass(frozen=True)
class Zone:
    key: str
    name: str
    bbox: tuple[float, float, float, float]  # W, S, E, N (approximate)
    kind: str
    note: str = ""


@dataclass(frozen=True)
class Site:
    key: str
    name: str
    country: str
    bbox: tuple[float, float, float, float]  # W, S, E, N
    track: int
    frame: int
    direction: str
    start: str
    end: str
    res_m: int = 100
    zones: tuple[Zone, ...] = field(default_factory=tuple)

    @property
    def wkt(self) -> str:
        w, s, e, n = self.bbox
        return f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"


LOWER_INDUS = Site(
    key="lower-indus",
    name="Lower Indus, Sindh",
    country="Pakistan",
    bbox=(67.70, 24.30, 68.95, 25.50),
    track=164,
    frame=76,
    direction="DESCENDING",
    start="2025-11-01",
    end="2026-11-12",
    res_m=100,
    zones=(
        Zone("keenjhar", "Keenjhar Lake", (68.00, 24.85, 68.10, 25.05), "lake",
             "Freshwater reservoir that supplies Karachi; Ramsar site."),
        Zone("haleji", "Haleji Lake", (67.74, 24.77, 67.81, 24.84), "lake",
             "Wildlife sanctuary and Ramsar site."),
        Zone("badin-lagoons", "Badin coastal lagoons", (68.55, 24.30, 68.90, 24.55), "wetland",
             "Nurri and Jubho lagoons, Ramsar wetlands near the coast."),
        Zone("indus-floodplain", "Indus floodplain, Kotri to Thatta", (68.10, 24.85, 68.35, 25.35), "river",
             "River channel and kaccha (active floodplain) farmland."),
        Zone("left-bank-farms", "Left bank farmland, Tando Muhammad Khan to Matli", (68.45, 24.85, 68.80, 25.20), "cropland",
             "Irrigated rice, sugarcane and cotton belt."),
        Zone("hyderabad", "Hyderabad city", (68.30, 25.33, 68.42, 25.44), "urban",
             "Stable bright target used as a radiometric sanity check."),
    ),
)

SITES = {LOWER_INDUS.key: LOWER_INDUS}
