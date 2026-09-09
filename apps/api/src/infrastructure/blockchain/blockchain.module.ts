import { Module } from '@nestjs/common';
import { DOCUMENT_BLOCKCHAIN_ADAPTER } from './blockchain.adapter';
import { EthereumSepoliaDocumentRegistryService } from './ethereum-sepolia-document-registry.service';
import { EthereumSepoliaTokenService } from './ethereum-sepolia-token.service';
import { EthereumSepoliaMarketplaceService } from './ethereum-sepolia-marketplace.service';

@Module({
  providers: [
    EthereumSepoliaTokenService,
    EthereumSepoliaMarketplaceService,
    EthereumSepoliaDocumentRegistryService,
    {
      provide: DOCUMENT_BLOCKCHAIN_ADAPTER,
      useExisting: EthereumSepoliaDocumentRegistryService,
    },
  ],
  exports: [
    EthereumSepoliaTokenService,
    EthereumSepoliaMarketplaceService,
    EthereumSepoliaDocumentRegistryService,
    DOCUMENT_BLOCKCHAIN_ADAPTER,
  ],
})
export class BlockchainModule {}
