# Hyperledger Besu network

CAPROV uses the same Solidity contracts on Besu and Sepolia. The selected network is sent to the API in `X-Caprov-Network`, and all transaction validation uses that network's RPC endpoint and contract addresses.

## Required API environment

```dotenv
BLOCKCHAIN_DEFAULT_NETWORK=sepolia
BESU_RPC_URL=http://127.0.0.1:8545
BESU_CHAIN_ID=1337
BESU_CHAIN_NAME=CAPROV Besu
BESU_ZERO_GAS=true
BESU_PRIVATE_KEY=0x...
BESU_ASSET_TOKEN_CONTRACT=0x...
BESU_PAYMENT_TOKEN_CONTRACT=0x...
BESU_MARKETPLACE_CONTRACT=0x...
BESU_COLLATERAL_VAULT_CONTRACT=0x...
BESU_DOCUMENT_REGISTRY_CONTRACT=0x...
# Optional Blockscout (or another private explorer)
BESU_EXPLORER_URL=https://explorer.example.internal
```

Configure matching `NEXT_PUBLIC_BESU_*` variables for the browser. Deploy the complete CAPROV contract suite to the Besu chain and place its addresses in these variables; contract state is intentionally separate from Sepolia.

For a complete local development network, run `node scripts/bootstrap-besu-local.mjs`. It uses Besu's official four-validator private quickstart, waits for JSON-RPC, and deploys the asset token, payment token, marketplace, document registry, and collateral vault with `gasPrice: 0`. The script's prefunded account is public and must never be used beyond this local development network. For an existing Besu network, run `node scripts/deploy-besu-suite.mjs` after setting the Besu environment values.

The quickstart exposes validator 1 RPC at `http://127.0.0.1:21001`; the standalone sample node in `infra/besu/config.toml` uses `8545`.

## Local transaction explorer

Start CAPROV's local Blockscout instance after Besu is running:

```bash
docker compose -p caprov-besu-explorer -f infra/besu/explorer/docker-compose.yml up -d
```

It is available only on the local machine at `http://localhost:26000`. The included configuration indexes the local Besu RPC at `http://127.0.0.1:8545`; it does not expose the RPC or the explorer externally. `BESU_EXPLORER_URL` and `NEXT_PUBLIC_BESU_EXPLORER_URL` should both point to this URL. Stop it with `docker compose -p caprov-besu-explorer -f infra/besu/explorer/docker-compose.yml down`.

## Zero-fee safety

`infra/besu/config.toml` sets `min-gas-price=0` and disables the transaction-pool balance check. Gas limits still apply. Expose JSON-RPC only to trusted applications or a private network, use permissioned validators, and set per-account/API rate limits: zero pricing removes the economic spam deterrent.
