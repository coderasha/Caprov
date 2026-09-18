"""Deterministic, provenance-aware Asset DNA pipeline.

Optimized for labeled private-asset documents (SPA, title, valuation memo, LPA,
NAV, insurance, KYC). Valuation always prefers market value / NAV over purchase
price. Every fact retains a source fragment and document id.

Accuracy-first rules (kept in parity with Nest `extraction-accuracy.ts`):
- NFKC / OCR text normalization
- Candidate scoring by doc type + as-of recency (not confidence alone)
- Insurance / replacement / book values rejected as market marks
- NAV heading false-positive guard
- Consensus boost when independent sources agree within 2%
- Valuation as-of taken from the winning mark's source document
"""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

MONTHS = (
    "January|February|March|April|May|June|July|August|September|October|November|December"
)

ENTITY_RE = re.compile(
    r"\b([A-Z][A-Za-z0-9&.’'-]*(?:\s+[A-Z][A-Za-z0-9&.’'-]*){0,5}\s"
    r"(?:Ltd|Limited|LLP|LLC|LP|Pte Ltd|SARL|Inc|AG|GmbH|Partners|Holdings|Capital|"
    r"Fund III|Fund II|Fund))\b"
)
DATE_RE = re.compile(
    rf"\b(?:\d{{1,2}}\s+(?:{MONTHS})\s+\d{{4}}|\d{{4}}-\d{{2}}-\d{{2}})\b",
    re.I,
)
AS_OF_RE = re.compile(
    r"(?:as of|valuation date|effective date|appraisal date|reporting date|date)[:\s]+([^\n]+)",
    re.I,
)
NON_MARKET_VALUE_RE = re.compile(
    r"(?:declared value|insured value|sum insured|coverage amount|replacement cost|"
    r"reinstatement value|book value)",
    re.I,
)

FIELD_SPECS: list[tuple[str, str, re.Pattern[str], float]] = [
    (
        "market_value",
        "Market value",
        re.compile(
            r"(?:open market valuation|open market value|fair market value|current market value|"
            r"estimated market value|appraised value|appraisal value|appraisal figure|"
            r"gross asset value|\bgav\b|\bomv\b|market value|fair value)\s*[:\-]?\s*([^\n]+)",
            re.I,
        ),
        0.94,
    ),
    ("nav", "Latest NAV", re.compile(r"(?:latest\s+nav|net asset value|nav)\s*:\s*([^\n]+)", re.I), 0.92),
    (
        "purchase_price",
        "Purchase price",
        re.compile(
            r"(?:purchase price|acquisition price|purchase consideration|consideration payable|"
            r"consideration amount|total consideration)\s*[:\-]?\s*([^\n]+)",
            re.I,
        ),
        0.96,
    ),
    ("legal_ownership", "Legal ownership", re.compile(r"(?:legal ownership|registered proprietor ownership)\s*[:\-]?\s*([^\n]+)", re.I), 0.97),
    ("legal_ownership", "Legal ownership", re.compile(r"ownership transferred\s*[:\-]?\s*([^\n]+)", re.I), 0.9),
    ("proprietor", "Proprietor", re.compile(r"(?:proprietor|registered proprietor|registered owner)\s*[:\-]?\s*([^\n]+)", re.I), 0.93),
    ("location", "Location", re.compile(r"(?:property|location|estate|address)\s*[:\-]?\s*([^\n]+)", re.I), 0.9),
    ("occupancy", "Occupancy", re.compile(r"(?:occupancy|let(?:ting)? rate|leased)\s*[:\-]?\s*([^\n]+)", re.I), 0.9),
    ("walt", "WALT", re.compile(r"(?:walt|weighted average lease term)\s*[:\-]?\s*([^\n]+)", re.I), 0.88),
    ("wale", "WALE", re.compile(r"(?:wale|weighted average lease expiry)\s*[:\-]?\s*([^\n]+)", re.I), 0.88),
    ("nia", "Net internal area", re.compile(r"(?:nia|net internal area)\s*[:\-]?\s*([^\n]+)", re.I), 0.88),
    ("commitment", "Commitment", re.compile(r"commitment\s*[:\-]?\s*([^\n]+)", re.I), 0.93),
    ("called_capital", "Called capital", re.compile(r"called capital\s*[:\-]?\s*([^\n]+)", re.I), 0.88),
    ("current_yield", "Current yield", re.compile(r"(?:current yield|running yield)\s*[:\-]?\s*([^\n]+)", re.I), 0.86),
    ("serial_number", "Serial number", re.compile(r"serial number\s*[:\-]?\s*([^\n]+)", re.I), 0.97),
    ("hectares", "Estate size", re.compile(r"(?:estate size|hectares)\s*[:\-]?\s*([^\n]+)", re.I), 0.92),
    ("airframe_hours", "Airframe hours", re.compile(r"airframe hours\s*[:\-]?\s*([^\n]+)", re.I), 0.9),
    ("cap_rate", "Cap rate", re.compile(r"(?:cap(?:itali[sz]ation)? rate|net initial yield|\bniy\b)\s*[:\-]?\s*([^\n]+)", re.I), 0.86),
    ("passing_rent", "Passing rent", re.compile(r"(?:passing rent|net rental income|annual rent)\s*[:\-]?\s*([^\n]+)", re.I), 0.86),
]

DOC_TYPE_BONUS = {
    "VALUATION_MEMO": 0.05,
    "TITLE_DEED": 0.03,
    "SPA": 0.02,
    "LPA": 0.02,
    "FINANCIAL_STATEMENT": 0.04,
    "KYC": 0.01,
    "INSURANCE": 0.01,
}

MARK_DOC_PRIORITY = {
    "VALUATION_MEMO": 40,
    "FINANCIAL_STATEMENT": 35,
    "SPA": 10,
    "TITLE_DEED": 8,
    "OTHER": 5,
    "INSURANCE": -50,
}

CLASS_FALLBACK_VALUE = {
    "REAL_ESTATE": 25_000_000.0,
    "PRIVATE_CREDIT": 20_000_000.0,
    "AVIATION": 18_000_000.0,
    "ART": 2_500_000.0,
    "AGRICULTURE": 8_000_000.0,
    "INFRASTRUCTURE": 40_000_000.0,
}


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:16]}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_text(raw: str) -> str:
    text = unicodedata.normalize("NFKC", raw)
    text = (
        text.replace("\u00a0", " ")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201a", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u201e", '"')
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u00ad", "")
    )
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def _parse_amount(raw: str) -> tuple[float, str] | None:
    cleaned = re.sub(r"\((?:approximately|approx\.?|about)\)", "", raw, flags=re.I).strip()
    currency_match = re.search(r"(?:(USD|EUR|GBP|SGD|INR)|(\$)|(£)|(€))", cleaned, re.I)
    number = re.search(
        r"([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(million|billion|bn|m)?\b",
        cleaned,
        re.I,
    )
    if not number:
        return None
    amount = float(number.group(1).replace(",", ""))
    suffix = (number.group(2) or "").lower()
    if suffix in {"million", "m"}:
        amount *= 1_000_000
    if suffix in {"billion", "bn"}:
        amount *= 1_000_000_000
    # A written-out amount may follow the numeric amount in parentheses, e.g.
    # "$2,200,000 (Two Million...)". Only a suffix next to the numeric token
    # is a scale instruction.
    if currency_match and currency_match.group(1):
        currency = currency_match.group(1).upper()
    elif currency_match and currency_match.group(3):
        currency = "GBP"
    elif currency_match and currency_match.group(4):
        currency = "EUR"
    else:
        currency = "USD"
    return amount, currency


def _parse_percent(raw: str) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)\s?%", raw)
    return float(match.group(1)) if match else None


def _parse_years(raw: str) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)\s*years?", raw, re.I)
    return float(match.group(1)) if match else None


def classify_document(name: str, text: str, fallback: str) -> str:
    haystack = f"{name} {_normalize_text(text)}".lower()
    if re.search(r"title|land registry|deed|proprietor|notarial|kadaster|sla title", haystack):
        return "TITLE_DEED"
    if re.search(r"share purchase|sale and purchase|bill of sale|\bspa\b|gallery invoice", haystack):
        return "SPA"
    if re.search(r"valuation|appraisal|market value|fair value|nav statement|knightvale|dcf|appraised", haystack):
        return "VALUATION_MEMO"
    if re.search(r"insurance|insured value|hull|sum insured|replacement cost|reinstatement", haystack):
        return "INSURANCE"
    if re.search(r"kyc|beneficial ownership|aml", haystack):
        return "KYC"
    if re.search(r"limited partnership agreement|\blpa\b", haystack):
        return "LPA"
    if re.search(r"financial statement|balance sheet|\bnav\b", haystack):
        return "FINANCIAL_STATEMENT"
    return fallback or "OTHER"


def _to_iso_date(raw: str) -> str:
    trimmed = raw.strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", trimmed):
        return f"{trimmed}T00:00:00.000Z"
    natural = re.match(
        rf"^(\d{{1,2}})\s+({MONTHS})\s+(\d{{4}})$",
        trimmed,
        re.I,
    )
    if natural:
        months = {
            "january": 1,
            "february": 2,
            "march": 3,
            "april": 4,
            "may": 5,
            "june": 6,
            "july": 7,
            "august": 8,
            "september": 9,
            "october": 10,
            "november": 11,
            "december": 12,
        }
        day = int(natural.group(1))
        month = months[natural.group(2).lower()]
        year = int(natural.group(3))
        return datetime(year, month, day, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    return _now()


def _document_as_of_ms(text: str) -> float:
    match = AS_OF_RE.search(text)
    if not match:
        return 0.0
    date_match = DATE_RE.search(match.group(1))
    if not date_match:
        return 0.0
    try:
        iso = _to_iso_date(date_match.group(0))
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000
    except ValueError:
        return 0.0


def _score_candidate(key: str, confidence: float, doc_type: str, as_of_ms: float) -> float:
    score = confidence * 100 + MARK_DOC_PRIORITY.get(doc_type, 0)
    if key in {"market_value", "nav"}:
        score += as_of_ms / 1e13
    if key == "purchase_price" and doc_type == "SPA":
        score += 20
    if key == "legal_ownership" and doc_type == "TITLE_DEED":
        score += 25
    return score


def _is_non_market_value_fragment(fragment: str) -> bool:
    return bool(NON_MARKET_VALUE_RE.search(fragment))


def _extract_facts(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates: dict[str, list[dict[str, Any]]] = {}
    for document in documents:
        text = _normalize_text(document.get("text") or "")
        if not text:
            continue
        doc_type = document.get("type") or "OTHER"
        bonus = DOC_TYPE_BONUS.get(doc_type, 0.0)
        as_of_ms = _document_as_of_ms(text)
        for key, label, regex, base_confidence in FIELD_SPECS:
            for match in regex.finditer(text):
                value = match.group(1).strip()
                if not value:
                    continue
                fragment = match.group(0)[:180]
                if key == "market_value" and (
                    doc_type == "INSURANCE" or _is_non_market_value_fragment(fragment)
                ):
                    continue
                if key == "nav" and re.search(r"nav statement", fragment, re.I) and not re.search(
                    r"nav\s*:", fragment, re.I
                ):
                    continue
                parsed = _parse_amount(value)
                if parsed and parsed[0] <= 0:
                    continue
                confidence = min(0.99, round(base_confidence + bonus, 2))
                if key in {"market_value", "nav"} and doc_type not in {"VALUATION_MEMO", "FINANCIAL_STATEMENT"}:
                    confidence = min(confidence, 0.78)
                if key == "purchase_price" and doc_type not in {"SPA", "TITLE_DEED"}:
                    confidence = min(confidence, 0.8)
                fact = {
                    "id": _id("fact"),
                    "key": key,
                    "label": label,
                    "value": value,
                    "numericValue": parsed[0] if parsed else _parse_percent(value) or _parse_years(value),
                    "currency": parsed[1] if parsed else None,
                    "unit": "%" if _parse_percent(value) is not None and not parsed else ("years" if _parse_years(value) is not None else None),
                    "confidence": confidence,
                    "provenance": [
                        {
                            "sourceDocumentId": document["id"],
                            "sourceFragment": fragment,
                            "confidence": confidence,
                            "observedAt": _now(),
                        }
                    ],
                    "_score": _score_candidate(key, confidence, doc_type, as_of_ms),
                }
                candidates.setdefault(key, []).append(fact)

    best: dict[str, dict[str, Any]] = {}
    for key, items in candidates.items():
        ranked = sorted(items, key=lambda item: (item["_score"], item["confidence"]), reverse=True)
        winner = ranked[0]
        if key in {"market_value", "nav", "purchase_price"} and winner.get("numericValue") is not None:
            agreeing = [
                item
                for item in ranked
                if item.get("numericValue") is not None
                and abs(item["numericValue"] - winner["numericValue"]) / winner["numericValue"] <= 0.02
            ]
            if len(agreeing) >= 2:
                winner = {
                    **winner,
                    "confidence": min(0.99, round(winner["confidence"] + 0.03, 2)),
                    "provenance": winner["provenance"] + [p for item in agreeing[1:3] for p in item["provenance"]],
                }
        winner.pop("_score", None)
        best[key] = winner

    ownership = best.get("legal_ownership")
    proprietor = best.get("proprietor")
    if ownership and proprietor and re.fullmatch(r"\d+(?:\.\d+)?\s*%?", ownership["value"].strip()):
        ownership = {
            **ownership,
            "value": f"{ownership['value'].rstrip('%').strip()}% {proprietor['value']}".replace("%%", "%"),
            "confidence": max(ownership["confidence"], proprietor["confidence"]),
        }
        best["legal_ownership"] = ownership

    order = [spec[0] for spec in FIELD_SPECS]
    ordered_keys = []
    for key in order:
        if key in best and key not in ordered_keys:
            ordered_keys.append(key)
    for key in best:
        if key not in ordered_keys:
            ordered_keys.append(key)
    return [best[key] for key in ordered_keys]


def _extract_entities(asset: dict[str, Any], documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    entities = [
        {
            "id": _id("ent"),
            "name": asset["name"],
            "canonicalName": asset["name"],
            "type": "ASSET",
            "aliases": [],
            "confidence": 0.99,
        }
    ]
    seen = {asset["name"].lower()}
    if asset.get("location"):
        entities.append(
            {
                "id": _id("ent"),
                "name": asset["location"],
                "canonicalName": asset["location"],
                "type": "LOCATION",
                "aliases": [],
                "confidence": 0.9,
            }
        )
        seen.add(str(asset["location"]).lower())
    for document in documents:
        for match in ENTITY_RE.finditer(document.get("text") or ""):
            name = re.sub(r"\s+", " ", match.group(1)).strip()
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            entities.append(
                {
                    "id": _id("ent"),
                    "name": name,
                    "canonicalName": name,
                    "type": "ORGANIZATION",
                    "aliases": [],
                    "confidence": 0.86,
                }
            )
    return entities[:16]


def _build_relationships(
    entities: list[dict[str, Any]],
    documents: list[dict[str, Any]],
    facts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    asset_entity = next((item for item in entities if item["type"] == "ASSET"), None)
    if not asset_entity:
        return []
    relationships: list[dict[str, Any]] = []
    ownership = next((fact for fact in facts if fact["key"] == "legal_ownership"), None)
    orgs = [item for item in entities if item["type"] == "ORGANIZATION"]
    for org in orgs[:5]:
        rel_type = "RELATED_TO"
        confidence = 0.7
        source = documents[0]["id"] if documents else None
        if ownership and org["name"].lower() in ownership["value"].lower():
            rel_type = "LEGAL_OWNER_OF"
            confidence = ownership["confidence"]
            source = ownership["provenance"][0]["sourceDocumentId"]
        elif "spv" in org["name"].lower() or "pte" in org["name"].lower() or "sarl" in org["name"].lower():
            rel_type = "LEGAL_OWNER_OF"
            confidence = 0.8
        relationships.append(
            {
                "id": _id("rel"),
                "fromEntityId": org["id"],
                "toEntityId": asset_entity["id"],
                "type": rel_type,
                "confidence": confidence,
                "sourceDocumentId": source,
            }
        )
    return relationships


def _build_timeline(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for document in documents:
        text = document.get("text") or ""
        as_of = AS_OF_RE.search(text)
        date_match = DATE_RE.search(as_of.group(1) if as_of else text)
        if not date_match:
            continue
        doc_type = document.get("type")
        category = (
            "VALUATION"
            if doc_type == "VALUATION_MEMO"
            else "OWNERSHIP"
            if doc_type in {"SPA", "TITLE_DEED"}
            else "LEGAL"
            if doc_type in {"INSURANCE", "KYC", "LPA"}
            else "DOCUMENT"
        )
        events.append(
            {
                "id": _id("evt"),
                "date": date_match.group(0),
                "title": re.sub(r"\.[a-z0-9]+$", "", document.get("name", "Document"), flags=re.I),
                "description": next(
                    (line.strip() for line in text.splitlines() if len(line.strip()) > 12),
                    document.get("name", ""),
                )[:220],
                "category": category,
                "confidence": 0.9 if as_of else 0.78,
                "sourceDocumentId": document["id"],
            }
        )
    return sorted(events, key=lambda event: event["date"])


def _pick_value_fact(facts: list[dict[str, Any]]) -> dict[str, Any] | None:
    for key in ("market_value", "nav", "purchase_price"):
        for fact in facts:
            if fact["key"] == key and fact.get("numericValue"):
                return fact
    return None


def _resolve_valuation_as_of(facts: list[dict[str, Any]], documents: list[dict[str, Any]]) -> str:
    value_fact = _pick_value_fact(facts)
    source_id = None
    if value_fact and value_fact.get("provenance"):
        source_id = value_fact["provenance"][0].get("sourceDocumentId")
    if source_id:
        source = next((document for document in documents if document.get("id") == source_id), None)
        if source and source.get("text"):
            match = AS_OF_RE.search(_normalize_text(source["text"]))
            if match:
                date = DATE_RE.search(match.group(1))
                if date:
                    return _to_iso_date(date.group(0))
    for document in documents:
        if document.get("type") not in {"VALUATION_MEMO", "FINANCIAL_STATEMENT"}:
            continue
        match = AS_OF_RE.search(_normalize_text(document.get("text") or ""))
        if match:
            date = DATE_RE.search(match.group(1))
            if date:
                return _to_iso_date(date.group(0))
    return _now()


def _fallback_value(asset_class: str | None) -> float:
    return CLASS_FALLBACK_VALUE.get(asset_class or "", 10_000_000.0)


def _estimate_valuation(asset: dict[str, Any], facts: list[dict[str, Any]], documents: list[dict[str, Any]]) -> dict[str, Any]:
    value_fact = _pick_value_fact(facts)
    amount = float(value_fact["numericValue"]) if value_fact else _fallback_value(asset.get("assetClass"))
    currency = (value_fact or {}).get("currency") or asset.get("currency") or "USD"
    as_of = _resolve_valuation_as_of(facts, documents)
    method = {
        "market_value": "Independent valuation memo / appraisal extract",
        "nav": "Fund NAV statement extract",
        "purchase_price": "Acquisition price from purchase agreement (no later mark available)",
    }.get((value_fact or {}).get("key", ""), "Class heuristic pending primary valuation memo")
    confidence = value_fact["confidence"] if value_fact else 0.4
    notes = []
    if value_fact and value_fact["key"] == "market_value":
        notes.append("Primary mark taken from market value / fair value language.")
        purchase = next((fact for fact in facts if fact["key"] == "purchase_price" and fact.get("numericValue")), None)
        if purchase:
            notes.append(f"Acquisition price was {purchase['value']}.")
    elif value_fact and value_fact["key"] == "nav":
        notes.append("Primary mark taken from latest NAV.")
    elif value_fact:
        notes.append("No market value found; falling back to purchase price.")
    else:
        notes.append("No explicit value extracted; heuristic placeholder used.")
    if value_fact and len(value_fact.get("provenance") or []) > 1:
        notes.append("Mark corroborated across multiple source fragments.")
    ignored_non_market = any(
        document.get("type") == "INSURANCE"
        or NON_MARKET_VALUE_RE.search(document.get("text") or "")
        for document in documents
    )
    if ignored_non_market and value_fact and value_fact["key"] == "market_value":
        notes.append("Insurance / replacement / book figures were ignored as market marks.")
    return {
        "amount": amount,
        "currency": currency,
        "method": method,
        "asOf": as_of,
        "low": round(amount * 0.93),
        "high": round(amount * 1.07),
        "confidence": confidence,
        "notes": notes,
    }


def _estimate_risk(asset: dict[str, Any], documents: list[dict[str, Any]], facts: list[dict[str, Any]]) -> dict[str, Any]:
    types = {document.get("type") for document in documents}
    coverage_score = max(10, 80 - len(types) * 12)
    ownership_score = 18 if any(fact["key"] == "legal_ownership" for fact in facts) else 55
    jurisdiction_score = 24 if asset.get("jurisdiction") else 48
    occupancy = next((fact for fact in facts if fact["key"] == "occupancy" and fact.get("numericValue") is not None), None)
    walt = next((fact for fact in facts if fact["key"] in {"walt", "wale"} and fact.get("numericValue") is not None), None)
    income_score = 30
    flags: list[str] = []
    if occupancy and occupancy["numericValue"] < 95:
        income_score += 8
        flags.append(f"Occupancy at {occupancy['value']}")
    if walt and walt["numericValue"] < 8:
        income_score += 10
        flags.append(f"Lease duration {walt['value']} creates roll risk")
    if "TITLE_DEED" not in types:
        flags.append("Missing title / ownership evidence")
    if "VALUATION_MEMO" not in types and "FINANCIAL_STATEMENT" not in types:
        flags.append("No independent valuation memo / NAV pack")
    if len(types) < 3:
        flags.append("Thin document coverage")
    overall = round((coverage_score + ownership_score + jurisdiction_score + income_score) / 4)
    rating = "LOW" if overall < 30 else "MODERATE" if overall < 45 else "ELEVATED" if overall < 60 else "HIGH"
    return {
        "overall": overall,
        "rating": rating,
        "confidence": 0.88 if documents else 0.4,
        "flags": flags,
        "dimensions": [
            {
                "key": "document_coverage",
                "label": "Document coverage",
                "score": coverage_score,
                "rationale": f"{len(types)} distinct document types ingested for this asset.",
            },
            {
                "key": "ownership_clarity",
                "label": "Ownership clarity",
                "score": ownership_score,
                "rationale": "Legal ownership language extracted."
                if ownership_score < 30
                else "Ownership language was not confidently extracted.",
            },
            {
                "key": "jurisdiction",
                "label": "Jurisdiction & legal",
                "score": jurisdiction_score,
                "rationale": f"Jurisdiction recorded as {asset.get('jurisdiction')}."
                if asset.get("jurisdiction")
                else "No jurisdiction recorded on the asset master.",
            },
            {
                "key": "income_durability",
                "label": "Income durability",
                "score": income_score,
                "rationale": "Derived from occupancy and WALT/WALE extracts where available.",
            },
        ],
    }


def run_asset_dna(asset: dict[str, Any], documents: list[dict[str, Any]]) -> dict[str, Any]:
    classified = [
        {
            **document,
            "type": classify_document(
                document.get("name", ""),
                document.get("text", "") or document.get("extractedText", ""),
                document.get("type", "OTHER"),
            ),
            "text": document.get("text") or document.get("extractedText") or "",
        }
        for document in documents
    ]
    facts = _extract_facts(classified)
    entities = _extract_entities(asset, classified)
    relationships = _build_relationships(entities, classified, facts)
    timeline = _build_timeline(classified)
    valuation = _estimate_valuation(asset, facts, classified)
    risk = _estimate_risk(asset, classified, facts)
    coverage = min(0.98, 0.4 + len(classified) * 0.1)
    provenance = sum(fact["confidence"] for fact in facts) / len(facts) if facts else 0.4
    overall = round(coverage * 0.4 + provenance * 0.6, 2)
    value_fact = _pick_value_fact(facts)
    summary_bits = [
        f"{asset['name']} intelligence envelope from {len(classified)} source document"
        f"{'' if len(classified) == 1 else 's'}.",
    ]
    if value_fact:
        summary_bits.append(f"Primary mark {value_fact['value']} ({value_fact['label'].lower()}).")
    if risk["flags"]:
        summary_bits.append(f"Risk {risk['rating'].lower()} with {len(risk['flags'])} flag(s).")
    return {
        "assetId": asset["id"],
        "version": 1,
        "generatedAt": _now(),
        "summary": " ".join(summary_bits),
        "facts": facts,
        "entities": entities,
        "relationships": relationships,
        "timeline": timeline,
        "valuation": valuation,
        "risk": risk,
        "confidence": {
            "overall": overall,
            "coverage": round(coverage, 2),
            "provenance": round(provenance, 2),
        },
        "sourceDocumentIds": [document["id"] for document in classified],
        "engine": "caprov-intelligence-engine",
    }


def _format_money(amount: float, currency: str) -> str:
    return f"{currency} {amount:,.0f}"


def answer_copilot(question: str, envelope: dict[str, Any] | None) -> dict[str, Any]:
    if not envelope:
        return {
            "answer": "No Asset DNA snapshot is available yet. Run the pipeline after ingesting documents.",
            "citations": [],
        }
    q = question.lower()
    facts = envelope.get("facts") or []
    valuation = envelope.get("valuation") or {}
    risk = envelope.get("risk") or {}

    if any(word in q for word in ("value", "valuation", "worth", "nav", "price", "mark")) and valuation:
        value_fact = _pick_value_fact(facts)
        citations = []
        if value_fact:
            citations.append(
                {
                    "label": value_fact["label"],
                    "documentId": value_fact["provenance"][0]["sourceDocumentId"],
                }
            )
        purchase = next((fact for fact in facts if fact["key"] == "purchase_price"), None)
        extra = ""
        if purchase and value_fact and value_fact["key"] != "purchase_price":
            extra = f" Acquisition price was {purchase['value']}."
            citations.append(
                {
                    "label": purchase["label"],
                    "documentId": purchase["provenance"][0]["sourceDocumentId"],
                }
            )
        return {
            "answer": (
                f"{_format_money(float(valuation.get('amount') or 0), str(valuation.get('currency') or 'USD'))} "
                f"as of {str(valuation.get('asOf', ''))[:10]}, using {str(valuation.get('method', '')).lower()}. "
                f"Confidence {round((valuation.get('confidence') or 0) * 100)}%.{extra}"
            ),
            "citations": citations or [{"label": "Valuation snapshot"}],
        }

    if any(word in q for word in ("risk", "flag", "concern", "lease")) and risk:
        top = (risk.get("dimensions") or [{}])[0]
        return {
            "answer": (
                f"Overall risk is {str(risk.get('rating', '')).lower()} ({risk.get('overall')}/100). "
                f"{top.get('rationale', '')} "
                f"Flags: {'; '.join(risk.get('flags') or []) or 'none'}."
            ).strip(),
            "citations": [{"label": "Risk snapshot"}],
        }

    if any(word in q for word in ("owner", "ownership", "title", "who owns")):
        ownership = next((fact for fact in facts if fact["key"] == "legal_ownership"), None)
        if ownership:
            return {
                "answer": f"{ownership['value']}. Extracted with {round(ownership['confidence'] * 100)}% confidence.",
                "citations": [
                    {
                        "label": ownership["label"],
                        "documentId": ownership["provenance"][0]["sourceDocumentId"],
                    }
                ],
            }

    if "occupancy" in q:
        occupancy = next((fact for fact in facts if fact["key"] == "occupancy"), None)
        if occupancy:
            return {
                "answer": f"Occupancy is {occupancy['value']} (confidence {round(occupancy['confidence'] * 100)}%).",
                "citations": [
                    {
                        "label": occupancy["label"],
                        "documentId": occupancy["provenance"][0]["sourceDocumentId"],
                    }
                ],
            }

    return {"answer": envelope.get("summary", "Asset DNA is available."), "citations": []}
