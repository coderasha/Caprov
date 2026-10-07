import { Module } from '@nestjs/common';
import { DOCUMENT_BLOCKCHAIN_ADAPTER } from './blockchain.adapter';
import { EthereumSepoliaDocumentRegistryService } from './ethereum-sepolia-document-registry.service';
import { EthereumSepoliaTokenService } from './ethereum-sepolia-token.service';
import { EthereumSepoliaMarketplaceService } from './ethereum-sepolia-marketplace.service';
import { EthereumSepoliaCollateralVaultService } from './ethereum-sepolia-collateral-vault.service';
import { BlockchainNetworkService } from './blockchain-network.service';

@Module({
  providers: [
    BlockchainNetworkService,
    EthereumSepoliaTokenService,
    EthereumSepoliaMarketplaceService,
    EthereumSepoliaCollateralVaultService,
    EthereumSepoliaDocumentRegistryService,
    {
      provide: DOCUMENT_BLOCKCHAIN_ADAPTER,
      useExisting: EthereumSepoliaDocumentRegistryService,
    },
  ],
  exports: [
    BlockchainNetworkService,
    EthereumSepoliaTokenService,
    EthereumSepoliaMarketplaceService,
    EthereumSepoliaCollateralVaultService,
    EthereumSepoliaDocumentRegistryService,
    DOCUMENT_BLOCKCHAIN_ADAPTER,
  ],
})
export class BlockchainModule {}
