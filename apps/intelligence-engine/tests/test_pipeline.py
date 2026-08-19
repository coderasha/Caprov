from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from caprov_intelligence.pipeline import run_asset_dna


def test_asset_dna_extracts_purchase_price() -> None:
    envelope = run_asset_dna(
        {"id": "ast_1", "name": "Harbourview Tower", "assetClass": "REAL_ESTATE", "currency": "GBP"},
        [
            {
                "id": "doc_1",
                "name": "SPA.txt",
                "type": "SPA",
                "text": "SHARE PURCHASE AGREEMENT\nPurchase price: GBP 86,400,000\nLegal ownership: 100% SPV Limited",
            }
        ],
    )

    assert envelope["assetId"] == "ast_1"
    assert any(fact["key"] == "purchase_price" for fact in envelope["facts"])
    assert envelope["valuation"]["amount"] == 86_400_000
