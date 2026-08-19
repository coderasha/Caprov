import { Module } from '@nestjs/common';
import { DOCUMENT_BLOCKCHAIN_ADAPTER } from './blockchain.adapter';
import { EthereumSepoliaDocumentRegistryService } from './ethereum-sepolia-document-registry.service';
import { EthereumSepoliaTokenService } from './ethereum-sepolia-token.service';

@Module({
  providers: [
    EthereumSepoliaTokenService,
    EthereumSepoliaDocumentRegistryService,
    {
      provide: DOCUMENT_BLOCKCHAIN_ADAPTER,
      useExisting: EthereumSepoliaDocumentRegistryService,
    },
  ],
  exports: [
    EthereumSepoliaTokenService,
    EthereumSepoliaDocumentRegistryService,
    DOCUMENT_BLOCKCHAIN_ADAPTER,
  ],
})
export class BlockchainModule {}
