import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { getAddress, isAddress, verifyMessage } from 'ethers';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../../common/types/auth-user';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';

const challengeTtlMs = 5 * 60 * 1000;

@Injectable()
export class WalletLinkService {
  constructor(private readonly db: DatabaseService, private readonly audit: AuditService) {}

  issueChallenge(user: AuthUser, address: string, chainId: number) {
    if (!isAddress(address) || !Number.isSafeInteger(chainId) || chainId < 1) {
      throw new BadRequestException('A valid wallet address and chain ID are required.');
    }
    const normalized = getAddress(address);
    const now = new Date();
    const challenge = {
      id: createId('wlc'), userId: user.id, organizationId: user.organizationId,
      address: normalized, chainId, nonce: randomUUID(),
      expiresAt: new Date(now.getTime() + challengeTtlMs).toISOString(),
    };
    this.db.mutate((draft) => {
      draft.walletChallenges = draft.walletChallenges.filter((item) => new Date(item.expiresAt) > now && item.userId !== user.id);
      draft.walletChallenges.push(challenge);
    });
    return {
      challengeId: challenge.id,
      message: `CAPROV wallet verification\n\nAddress: ${normalized}\nChain ID: ${chainId}\nNonce: ${challenge.nonce}\nIssued at: ${now.toISOString()}\n\nThis signature verifies wallet control. It does not authorize a transaction.`,
      expiresAt: challenge.expiresAt,
    };
  }

  verifyAndLink(user: AuthUser, challengeId: string, signature: string) {
    const challenge = this.db.snapshot.walletChallenges.find((item) => item.id === challengeId && item.userId === user.id && item.organizationId === user.organizationId);
    if (!challenge || new Date(challenge.expiresAt) <= new Date()) throw new BadRequestException('Wallet verification challenge is expired or invalid.');
    const issuedAt = new Date(new Date(challenge.expiresAt).getTime() - challengeTtlMs).toISOString();
    const message = `CAPROV wallet verification\n\nAddress: ${challenge.address}\nChain ID: ${challenge.chainId}\nNonce: ${challenge.nonce}\nIssued at: ${issuedAt}\n\nThis signature verifies wallet control. It does not authorize a transaction.`;
    let signer: string;
    try { signer = getAddress(verifyMessage(message, signature)); } catch { throw new BadRequestException('Wallet signature could not be verified.'); }
    if (signer !== challenge.address) throw new ForbiddenException('The signature does not belong to the requested wallet.');
    const now = new Date().toISOString();
    this.db.mutate((draft) => {
      // A wallet signature proves control of the address. The same controller
      // may legitimately use it across multiple CAPROV accounts or entities,
      // so links are scoped to the signed-in user, organization, and chain.
      // This prevents a network change from overwriting the wallet's existing
      // authorization on another CAPROV network.
      const existing = draft.walletLinks.find((item) =>
        item.address === signer &&
        item.userId === user.id &&
        item.organizationId === user.organizationId &&
        item.chainId === challenge.chainId,
      );
      if (existing) { existing.verifiedAt = now; existing.lastUsedAt = now; }
      else draft.walletLinks.push({ id: createId('wlt'), userId: user.id, organizationId: user.organizationId, address: signer, chainId: challenge.chainId, verifiedAt: now, lastUsedAt: now });
      draft.walletChallenges = draft.walletChallenges.filter((item) => item.id !== challenge.id);
    });
    this.audit.log({ organizationId: user.organizationId, actorUserId: user.id, action: 'wallet.linked', entityType: 'WalletLink', entityId: signer, metadata: { chainId: challenge.chainId } });
    return { address: signer, chainId: challenge.chainId, verifiedAt: now };
  }

  list(user: AuthUser) { return this.db.snapshot.walletLinks.filter((item) => item.userId === user.id && item.organizationId === user.organizationId); }

  assertLinked(user: AuthUser, address: string, chainId?: number) {
    if (!isAddress(address)) throw new BadRequestException('A valid wallet address is required.');
    const normalized = getAddress(address);
    const link = this.db.snapshot.walletLinks.find((item) => item.userId === user.id && item.organizationId === user.organizationId && item.address === normalized && (chainId === undefined || item.chainId === chainId));
    if (!link) throw new ForbiddenException('Connect and verify this wallet for the signed-in CAPROV account before continuing.');
    this.db.mutate((draft) => { const current = draft.walletLinks.find((item) => item.id === link.id); if (current) current.lastUsedAt = new Date().toISOString(); });
    return normalized;
  }
}
