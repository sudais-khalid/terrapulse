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
    water_ref: str = ""   # zone key of a permanent water body used to calibrate water thresholds
    dry_ref: str = ""     # zone key of land that is never flooded (negative reference)
    tagline: str = ""

    def zone(self, key: str) -> Zone | None:
        return next((z for z in self.zones if z.key == key), None)

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
        Zone("jhimpir-desert", "Rocky desert near Jhimpir (check area)", (67.85, 25.05, 67.95, 25.15), "desert",
             "Dry ground that is almost as dark as water in HH. Used to check that the water rule does not misfire."),
    ),
    water_ref="keenjhar",
    dry_ref="jhimpir-desert",
    tagline="Floods, wetlands and rice on the lower Indus",
)

# Zone boxes are approximate; they summarise areas, they do not define legal or ecological boundaries.
MANAUS = Site(
    key="amazon-manaus",
    name="Amazon at Manaus",
    country="Brazil",
    bbox=(-60.25, -3.45, -59.45, -2.88),
    track=140,
    frame=90,
    direction="DESCENDING",
    start="2026-06-01",
    end="2026-11-12",
    res_m=100,
    zones=(
        Zone("rio-negro", "Rio Negro at Manaus", (-60.22, -3.16, -60.06, -3.06), "river",
             "Wide black-water river channel, used as the permanent water reference."),
        Zone("meeting-waters", "Meeting of the Waters", (-59.92, -3.17, -59.80, -3.10), "river",
             "Where the dark Rio Negro meets the muddy Solimoes to form the Amazon."),
        Zone("careiro-varzea", "Careiro varzea floodplain", (-59.95, -3.40, -59.60, -3.18), "wetland",
             "Seasonally flooded forest, lakes and pasture on the Solimoes floodplain."),
        Zone("janauari", "Lago do Janauari area", (-60.10, -3.26, -59.98, -3.17), "wetland",
             "Floodplain lakes and flooded forest south of the Rio Negro."),
        Zone("amazon-east", "Amazon floodplain east", (-59.62, -3.35, -59.45, -3.05), "wetland",
             "Floodplain downstream of the confluence."),
        Zone("manaus-city", "Manaus city", (-60.06, -3.13, -59.93, -3.00), "urban",
             "City of about two million people."),
        Zone("ducke-forest", "Terra firme forest, Reserva Ducke (check area)", (-59.98, -2.98, -59.90, -2.92), "forest",
             "Upland rainforest that never floods. Used as the dry-land reference."),
    ),
    water_ref="rio-negro",
    dry_ref="ducke-forest",
    tagline="The flood pulse of the Amazon",
)

SITES = {LOWER_INDUS.key: LOWER_INDUS, MANAUS.key: MANAUS}
