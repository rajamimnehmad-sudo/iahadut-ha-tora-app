#!/usr/bin/env python3
"""Add only unambiguous legacy EAN evidence from preciosargentina.

This is a one-time seed source. It is deliberately conservative: the local
product family and normalized brand must match, the external EAN must pass its
check digit, and a product with several presentations stays unresolved.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "web/data/catalog.json"
DETAILS = ROOT / "web/data/product-details.json"
EVIDENCE = ROOT / "automation/barcode-evidence.json"
WORK = ROOT / "work/preciosargentina"
RDA_PATH = WORK / "productos.rda"
RDA_URL = "https://raw.githubusercontent.com/pdelboca/preciosargentina/master/data/productos.rda"
SOURCE = "https://github.com/pdelboca/preciosargentina/blob/master/data/productos.rda"
STOP = {
    "marca", "producto", "tipo", "sabor", "con", "sin", "de", "del", "la", "el", "y", "para", "en",
    "un", "una", "x", "gr", "g", "kg", "ml", "cc", "lt", "l", "unidades", "unidad",
}
TOKEN_ALIASES = {
    "aceitunas": "aceituna", "arvejas": "arveja", "cereales": "cereal", "champignones": "champignon",
    "descarozadas": "descarozada", "deshidratados": "deshidratado", "duraznos": "durazno", "fideos": "fideo",
    "negras": "negra", "papas": "papa", "rellenas": "rellena", "rodajas": "rodaja", "verdes": "verde",
    "vegetales": "vegetal", "clasico": "clas", "clasica": "clas", "classic": "clas",
}


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(character for character in text if unicodedata.category(character) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def tokens(value: object) -> set[str]:
    return {TOKEN_ALIASES.get(token, token) for token in normalize(value).split() if len(token) > 1 and token not in STOP}


def brand_key(value: object) -> str:
    return normalize(value).replace(" marca ", " ").strip()


def valid_gtin(value: object) -> str:
    code = re.sub(r"\D", "", str(value or ""))
    if len(code) not in {8, 12, 13, 14} or set(code) == {"0"}:
        return ""
    total = 0
    for position, character in enumerate(reversed(code[:-1])):
        total += int(character) * (3 if position % 2 == 0 else 1)
    return code if (10 - total % 10) % 10 == int(code[-1]) else ""


def quantity(value: object) -> str:
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*(kg|kilo|g|gr|gramos?|l|lt|lts|litros?|ml|cc|un|uni|unidades?)\b", normalize(value))
    return f"{match.group(1)}{match.group(2)}" if match else ""


def detail_identity(value: object) -> str:
    detail = str(value or "")
    if re.match(r"^(?:los aceites|productos?|frutos? secos|todos|todas|disponible|debe llevar|se pueden|solo)\b", detail, re.I):
        return ""
    return re.split(
        r"\b(?:marcas reconocidas|actualmente|producto importado|producto autorizado|producto bajo|todos permitidos|todas las marcas|no se han|el rabinato|luego de|se recomienda|igualmente|origen:|certificaci[oó]n:|autorizado hasta)\b",
        detail,
        flags=re.I,
    )[0]


def read_rda() -> list[dict[str, str]]:
    try:
        import rdata  # type: ignore
    except ImportError as error:
        raise SystemExit("Falta la dependencia Python 'rdata'. Instalá con: python3 -m pip install rdata pandas") from error
    if not RDA_PATH.exists():
        WORK.mkdir(parents=True, exist_ok=True)
        request = Request(RDA_URL, headers={"User-Agent": "IahadutHaTora barcode enrichment"})
        with urlopen(request, timeout=60) as response, RDA_PATH.open("wb") as output:
            output.write(response.read())
    frame = rdata.read_rda(str(RDA_PATH))["productos"]
    return [
        {
            "code": valid_gtin(row.id_producto),
            "brand": brand_key(row.marca),
            "name": str(row.nombre or ""),
            "normalizedName": normalize(row.nombre),
            "tokens": tokens(row.nombre),
            "presentation": normalize(row.presentacion),
        }
        for row in frame.itertuples(index=False)
        if valid_gtin(row.id_producto)
    ]


parser = argparse.ArgumentParser()
parser.add_argument("--write", action="store_true", help="guardar las evidencias inequívocas")
args = parser.parse_args()

catalog = json.loads(CATALOG.read_text())
products = catalog.get("products", [])
try:
    product_details = json.loads(DETAILS.read_text()).get("products", {})
except FileNotFoundError:
    product_details = {}
rows = read_rda()
by_brand: dict[str, list[dict[str, str]]] = {}
for row in rows:
    by_brand.setdefault(row["brand"], []).append(row)

try:
    evidence = json.loads(EVIDENCE.read_text())
except FileNotFoundError:
    evidence = {}
used_codes = {valid_gtin(product.get("barcode")) for product in products if valid_gtin(product.get("barcode"))}
existing_urls = set(evidence)
assignments: list[tuple[dict, dict]] = []
seen_identities: set[str] = set()
ambiguous = 0

for product in products:
    if valid_gtin(product.get("barcode")):
        continue
    title = str(product.get("title", ""))
    local_brand = brand_key(product.get("brand"))
    if not local_brand:
        match = re.search(r"\bmarca\s+(.+)$", title, re.I)
        local_brand = brand_key(match.group(1) if match else "")
    detail = detail_identity(product_details.get(product["url"], {}).get("description", ""))
    local_family = set(tokens(re.split(r"\bmarca\b", title, maxsplit=1, flags=re.I)[0]))
    local_family.update(tokens(detail))
    identity = f"{normalize(title)}|{local_brand}|{normalize(detail)}"
    if not local_brand or not local_family or identity in seen_identities:
        continue
    seen_identities.add(identity)
    local_quantity = quantity(title)
    candidates = []
    for row in by_brand.get(local_brand, []):
        if not local_family.issubset(row["tokens"]):
            continue
        if local_quantity and local_quantity not in f"{row['normalizedName']} {row['presentation']}":
            continue
        candidates.append(row)
    codes = sorted({row["code"] for row in candidates})
    if len(codes) != 1:
        if len(codes) > 1:
            ambiguous += 1
        continue
    row = next(row for row in candidates if row["code"] == codes[0])
    if row["code"] in used_codes:
        continue
    assignments.append((product, row))
    used_codes.add(row["code"])

print(f"PreciosArgentina: {len(rows)} productos históricos con GTIN válido.")
print(f"Coincidencias inequívocas nuevas: {len(assignments)} · ambiguas preservadas: {ambiguous}.")
for product, row in assignments:
    print(f"{row['code']} · {product['title']} · {row['name']} · {row['presentation']}")

if args.write and assignments:
    for product, row in assignments:
        evidence[product["url"]] = {
            "code": row["code"],
            "label": f"{row['name']} · {row['presentation']}".strip(" ·"),
            "source": SOURCE,
            "sourceType": "PRECIOSARGENTINA",
            "sourceUpdatedAt": "legacy-dataset",
        }
    EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
    print(f"Evidencias guardadas: {EVIDENCE}")
elif assignments:
    print("Modo diagnóstico: usá --write para guardarlas.")
