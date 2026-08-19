// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CaprovDocumentRegistry
/// @notice Stores versioned document hashes and metadata for CAPROV assets on Ethereum Sepolia.
/// @dev Document contents remain off-chain. This contract stores immutable proof records only.
contract CaprovDocumentRegistry {
    address public owner;

    struct DocumentVersion {
        string assetId;
        string documentId;
        string documentType;
        uint256 version;
        bytes32 documentHash;
        uint256 anchoredAt;
        bytes32 previousVersionHash;
        string offChainUri;
        bool exists;
    }

    mapping(bytes32 => mapping(uint256 => DocumentVersion)) private versionsByLineage;
    mapping(bytes32 => uint256) public latestVersionByLineage;

    event DocumentVersionAnchored(
        bytes32 indexed lineageKey,
        string assetId,
        string documentId,
        string documentType,
        uint256 version,
        bytes32 documentHash,
        bytes32 previousVersionHash,
        string offChainUri,
        uint256 anchoredAt
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function computeLineageKey(string memory assetId, string memory documentType) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(assetId, "|", documentType));
    }

    function anchorDocumentVersion(
        string calldata assetId,
        string calldata documentId,
        string calldata documentType,
        uint256 version,
        bytes32 documentHash,
        bytes32 previousVersionHash,
        string calldata offChainUri
    ) external onlyOwner {
        require(bytes(assetId).length > 0, "assetId required");
        require(bytes(documentId).length > 0, "documentId required");
        require(bytes(documentType).length > 0, "documentType required");
        require(documentHash != bytes32(0), "documentHash required");
        require(bytes(offChainUri).length > 0, "offChainUri required");

        bytes32 lineageKey = computeLineageKey(assetId, documentType);
        uint256 expectedVersion = latestVersionByLineage[lineageKey] + 1;
        require(version == expectedVersion, "invalid version");

        if (version > 1) {
            DocumentVersion storage prior = versionsByLineage[lineageKey][version - 1];
            require(prior.exists, "previous version missing");
            require(prior.documentHash == previousVersionHash, "previous hash mismatch");
        } else {
            require(previousVersionHash == bytes32(0), "unexpected previous hash");
        }

        versionsByLineage[lineageKey][version] = DocumentVersion({
            assetId: assetId,
            documentId: documentId,
            documentType: documentType,
            version: version,
            documentHash: documentHash,
            anchoredAt: block.timestamp,
            previousVersionHash: previousVersionHash,
            offChainUri: offChainUri,
            exists: true
        });
        latestVersionByLineage[lineageKey] = version;

        emit DocumentVersionAnchored(
            lineageKey,
            assetId,
            documentId,
            documentType,
            version,
            documentHash,
            previousVersionHash,
            offChainUri,
            block.timestamp
        );
    }

    function getDocumentVersion(bytes32 lineageKey, uint256 version)
        external
        view
        returns (
            string memory assetId,
            string memory documentId,
            string memory documentType,
            uint256 storedVersion,
            bytes32 documentHash,
            uint256 anchoredAt,
            bytes32 previousVersionHash,
            string memory offChainUri,
            bool exists
        )
    {
        DocumentVersion storage record = versionsByLineage[lineageKey][version];
        return (
            record.assetId,
            record.documentId,
            record.documentType,
            record.version,
            record.documentHash,
            record.anchoredAt,
            record.previousVersionHash,
            record.offChainUri,
            record.exists
        );
    }
}
