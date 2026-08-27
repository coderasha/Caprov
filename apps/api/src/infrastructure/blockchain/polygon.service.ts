import { Injectable } from '@nestjs/common';
import { EthereumSepoliaTokenService } from './ethereum-sepolia-token.service';

/**
 * Backward-compatible shim for the previous service path so the local watch
 * process can recover after the Sepolia migration.
 */
@Injectable()
export class PolygonService extends EthereumSepoliaTokenService {}
