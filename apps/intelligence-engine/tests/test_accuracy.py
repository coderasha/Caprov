from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from caprov_intelligence.pipeline import _parse_amount, answer_copilot, run_asset_dna

HARBOURVIEW = {
    "id": "ast_harbourview",
    "name": "Harbourview Tower",
    "assetClass": "REAL_ESTATE",
    "currency": "GBP",
    "location": "Canary Wharf, London",
    "jurisdiction": "England & Wales",
}

DOCS = [
    {
        "id": "doc_hv_spa",
        "name": "Harbourview SPA.pdf",
        "type": "SPA",
        "text": (
            "SHARE PURCHASE AGREEMENT\n"
            "Harbourview Tower SPV Limited\n"
            "Date: 18 March 2024\n"
            "Buyer: Meridian Capital Partners LLP\n"
            "Seller: Northbridge Estates Ltd\n"
            "Purchase price: GBP 86,400,000\n"
            "Ownership transferred: 100%\n"
            "Property: 14 Harbourview, Canary Wharf, London E14 5AB\n"
            "Governing law: England and Wales"
        ),
    },
    {
        "id": "doc_hv_title",
        "name": "Land Registry Extract.pdf",
        "type": "TITLE_DEED",
        "text": (
            "HM LAND REGISTRY EXTRACT\n"
            "Title number: EGL938441\n"
            "Property: Harbourview Tower, 14 Harbourview, London E14 5AB\n"
            "Proprietor: Harbourview Tower SPV Limited\n"
            "Legal ownership: 100% Harbourview Tower SPV Limited\n"
            "Charges: None recorded\n"
            "Jurisdiction: England & Wales"
        ),
    },
    {
        "id": "doc_hv_val",
        "name": "Knightvale Valuation Memo.pdf",
        "type": "VALUATION_MEMO",
        "text": (
            "INDEPENDENT VALUATION MEMORANDUM\n"
            "Asset: Harbourview Tower\n"
            "Valuer: Knightvale Advisory\n"
            "As of: 30 June 2026\n"
            "Market value: GBP 92,800,000\n"
            "Method: Income capitalization\n"
            "Cap rate: 5.35%\n"
            "NIA: 312,000 sq ft\n"
            "Occupancy: 94%\n"
            "WALT: 7.4 years\n"
            "Passing rent: GBP 5,120,000"
        ),
    },
]


def test_written_amount_does_not_rescale_numeric_amount() -> None:
    assert _parse_amount(
        "$2,200,000 (Two Million Two Hundred Thousand U.S. Dollars only)"
    ) == (2_200_000.0, "USD")


def test_harbourview_prefers_market_value_not_purchase_price() -> None:
    envelope = run_asset_dna(HARBOURVIEW, DOCS)
    assert envelope["valuation"]["amount"] == 92_800_000
    assert envelope["valuation"]["currency"] == "GBP"
    assert envelope["valuation"]["confidence"] >= 0.9
    keys = {fact["key"]: fact for fact in envelope["facts"]}
    assert keys["purchase_price"]["numericValue"] == 86_400_000
    assert keys["market_value"]["numericValue"] == 92_800_000
    assert keys["occupancy"]["numericValue"] == 94
    assert keys["walt"]["numericValue"] == 7.4
    assert keys["legal_ownership"]["value"].startswith("100%")


def test_harbourview_copilot_value_and_ownership() -> None:
    envelope = run_asset_dna(HARBOURVIEW, DOCS)
    value = answer_copilot("What is the current value?", envelope)
    assert "92,800,000" in value["answer"]
    assert value["citations"][0]["documentId"] == "doc_hv_val"
    ownership = answer_copilot("Who owns the asset?", envelope)
    assert "Harbourview Tower SPV Limited" in ownership["answer"]


def test_nav_preferred_for_funds() -> None:
    envelope = run_asset_dna(
        {"id": "ast_au", "name": "Aurelia", "assetClass": "PRIVATE_CREDIT", "currency": "USD"},
        [
            {
                "id": "doc_au_nav",
                "name": "Q2 2026 NAV Statement.pdf",
                "type": "FINANCIAL_STATEMENT",
                "text": "NAV STATEMENT\nAurelia Private Credit Fund III\nAs of: 30 June 2026\nLatest NAV: USD 48,250,000\nCalled capital: 96%\nCurrent yield: 11.4%",
            },
            {
                "id": "doc_au_lpa",
                "name": "LPA.pdf",
                "type": "LPA",
                "text": "Commitment: USD 50,000,000\nLP: Meridian Capital Partners LLP",
            },
        ],
    )
    assert envelope["valuation"]["amount"] == 48_250_000
    assert envelope["valuation"]["currency"] == "USD"
    keys = {fact["key"]: fact for fact in envelope["facts"]}
    assert keys["nav"]["value"] == "USD 48,250,000"


def test_ownership_enriched_from_proprietor() -> None:
    envelope = run_asset_dna(
        HARBOURVIEW,
        [
            {
                "id": "doc_title",
                "name": "Title.pdf",
                "type": "TITLE_DEED",
                "text": "Proprietor: Harbourview Tower SPV Limited\nLegal ownership: 100%",
            }
        ],
    )
    ownership = next(fact for fact in envelope["facts"] if fact["key"] == "legal_ownership")
    assert "Harbourview Tower SPV Limited" in ownership["value"]
    assert ownership["value"].startswith("100%")


RIVERSIDE = {
    "id": "ast_riverside",
    "name": "Riverside Quay Tower",
    "assetClass": "REAL_ESTATE",
    "currency": "GBP",
    "location": "Salford Quays, Manchester",
    "jurisdiction": "England & Wales",
}

RIVERSIDE_DOCS = [
    {
        "id": "doc_rs_spa",
        "name": "Riverside Quay SPA.pdf",
        "type": "SPA",
        "text": (
            "SHARE PURCHASE AGREEMENT\n"
            "Purchase price: GBP 41,000,000\n"
            "Ownership transferred: 100%\n"
            "Property: Riverside Quay Tower, Salford Quays, Manchester M50 3SP"
        ),
    },
    {
        "id": "doc_rs_title",
        "name": "Land Registry Extract — Riverside Quay.pdf",
        "type": "TITLE_DEED",
        "text": (
            "HM LAND REGISTRY EXTRACT\n"
            "Proprietor: Riverside Quay HoldCo Limited\n"
            "Legal ownership: 100%"
        ),
    },
    {
        "id": "doc_rs_val",
        "name": "Northbridge Valuation Memo — Riverside Quay.pdf",
        "type": "VALUATION_MEMO",
        "text": (
            "INDEPENDENT VALUATION MEMORANDUM\n"
            "As of: 31 July 2026\n"
            "Market value: GBP 45,200,000\n"
            "Occupancy: 91%\n"
            "WALT: 6.2 years\n"
            "Cap rate: 5.90%"
        ),
    },
]


def test_riverside_dummy_valuation_prefers_market_value() -> None:
    envelope = run_asset_dna(RIVERSIDE, RIVERSIDE_DOCS)
    assert envelope["valuation"]["amount"] == 45_200_000
    assert envelope["valuation"]["currency"] == "GBP"
    keys = {fact["key"]: fact for fact in envelope["facts"]}
    assert keys["purchase_price"]["numericValue"] == 41_000_000
    assert keys["market_value"]["numericValue"] == 45_200_000
    assert keys["occupancy"]["numericValue"] == 91
    assert keys["walt"]["numericValue"] == 6.2


def test_canal_side_dummy_valuation_eur() -> None:
    envelope = run_asset_dna(
        {
            "id": "ast_canal",
            "name": "Canal Side Logistics Park",
            "assetClass": "REAL_ESTATE",
            "currency": "EUR",
            "location": "Rotterdam, Netherlands",
            "jurisdiction": "Netherlands",
        },
        [
            {
                "id": "doc_cn_spa",
                "name": "Canal Side SPA.pdf",
                "type": "SPA",
                "text": "SALE AND PURCHASE AGREEMENT\nPurchase price: EUR 72,250,000",
            },
            {
                "id": "doc_cn_val",
                "name": "EuroLog Appraisal 2026.pdf",
                "type": "VALUATION_MEMO",
                "text": (
                    "VALUATION APPRAISAL\n"
                    "Market value: EUR 78,500,000\n"
                    "Occupancy: 97%\n"
                    "WALE: 8.1 years\n"
                    "As of: 30 June 2026"
                ),
            },
        ],
    )
    assert envelope["valuation"]["amount"] == 78_500_000
    assert envelope["valuation"]["currency"] == "EUR"
    keys = {fact["key"]: fact for fact in envelope["facts"]}
    assert keys["wale"]["numericValue"] == 8.1


def test_bayfront_dummy_valuation_million_suffix() -> None:
    envelope = run_asset_dna(
        {
            "id": "ast_bayfront",
            "name": "Bayfront Offices",
            "assetClass": "REAL_ESTATE",
            "currency": "SGD",
            "location": "Marina Bay, Singapore",
            "jurisdiction": "Singapore",
        },
        [
            {
                "id": "doc_bf_spa",
                "name": "Bayfront Offices SPA.pdf",
                "type": "SPA",
                "text": "SALE AND PURCHASE AGREEMENT\nPurchase price: SGD 105,000,000",
            },
            {
                "id": "doc_bf_val",
                "name": "Pacific Crest Valuation Memo.pdf",
                "type": "VALUATION_MEMO",
                "text": (
                    "INDEPENDENT VALUATION MEMORANDUM\n"
                    "Market value: SGD 112 million\n"
                    "Occupancy: 88%\n"
                    "WALE: 4.5 years\n"
                    "As of: 15 August 2026"
                ),
            },
        ],
    )
    assert envelope["valuation"]["amount"] == 112_000_000
    assert envelope["valuation"]["currency"] == "SGD"
    reply = answer_copilot("What is the current value?", envelope)
    assert "112,000,000" in reply["answer"]


def test_rejects_insurance_and_replacement_cost() -> None:
    envelope = run_asset_dna(
        HARBOURVIEW,
        [
            {
                "id": "doc_ins",
                "name": "Insurance.pdf",
                "type": "INSURANCE",
                "text": "Declared value: GBP 120,000,000\nReplacement cost: GBP 125,000,000",
            },
            {
                "id": "doc_val",
                "name": "Memo.pdf",
                "type": "VALUATION_MEMO",
                "text": "Fair market value: GBP 92,800,000\nValuation date: 30 June 2026",
            },
            {
                "id": "doc_spa",
                "name": "SPA.pdf",
                "type": "SPA",
                "text": "Purchase price: GBP 86,400,000",
            },
        ],
    )
    assert envelope["valuation"]["amount"] == 92_800_000
    assert any("ignored" in note.lower() for note in envelope["valuation"]["notes"])


def test_prefers_newer_memo_by_as_of() -> None:
    envelope = run_asset_dna(
        HARBOURVIEW,
        [
            {
                "id": "doc_old",
                "name": "Old.pdf",
                "type": "VALUATION_MEMO",
                "text": "Market value: GBP 80,000,000\nAs of: 1 January 2024",
            },
            {
                "id": "doc_new",
                "name": "New.pdf",
                "type": "VALUATION_MEMO",
                "text": "Market value: GBP 92,800,000\nValuation date: 30 June 2026",
            },
        ],
    )
    assert envelope["valuation"]["amount"] == 92_800_000
    assert envelope["valuation"]["asOf"].startswith("2026-06-30")


def test_consensus_boost_across_memos() -> None:
    envelope = run_asset_dna(
        HARBOURVIEW,
        [
            {
                "id": "doc_a",
                "name": "A.pdf",
                "type": "VALUATION_MEMO",
                "text": "Market value: GBP 50,000,000\nAs of: 1 June 2026",
            },
            {
                "id": "doc_b",
                "name": "B.pdf",
                "type": "VALUATION_MEMO",
                "text": "Fair value: GBP 50,100,000\nAs of: 15 June 2026",
            },
        ],
    )
    market = next(fact for fact in envelope["facts"] if fact["key"] == "market_value")
    assert market["confidence"] >= 0.99
    assert len(market["provenance"]) > 1
    assert any("corroborated" in note.lower() for note in envelope["valuation"]["notes"])


def test_ocr_normalization_and_omv_synonym() -> None:
    envelope = run_asset_dna(
        HARBOURVIEW,
        [
            {
                "id": "doc_omv",
                "name": "OMV.pdf",
                "type": "VALUATION_MEMO",
                "text": "Open market value:\u00a0GBP 33,250,000\u2014\nOccupancy: 96%",
            }
        ],
    )
    assert envelope["valuation"]["amount"] == 33_250_000
