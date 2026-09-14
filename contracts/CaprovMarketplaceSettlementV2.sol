// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICaprovAssetTokenV2 {
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;
}

interface ICAPToken {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface IERC1155ReceiverV2 {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4);
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external returns (bytes4);
}

/// @notice CAP-denominated ERC-1155 marketplace with buyer-funded escrow and seller settlement approval.
/// @dev One CAP represents one USD only when the CAP issuer maintains the required reserve/redemption policy.
///      The contract cannot itself establish a fiat peg.
contract CaprovMarketplaceSettlementV2 is IERC1155ReceiverV2 {
    enum PurchaseStatus { NONE, PAYMENT_ESCROWED, SETTLED, REJECTED, CANCELLED }

    struct Listing {
        address seller;
        uint256 assetId;
        uint256 remaining;
        uint256 pricePerUnitCAP;
        bool active;
    }

    struct Purchase {
        uint256 listingId;
        address buyer;
        uint256 units;
        uint256 paymentCAP;
        PurchaseStatus status;
    }

    ICaprovAssetTokenV2 public immutable assetToken;
    ICAPToken public immutable capToken;
    uint256 public nextListingId = 1;
    uint256 public nextPurchaseId = 1;
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Purchase) public purchases;

    event Listed(uint256 indexed listingId, address indexed seller, uint256 indexed assetId, uint256 units, uint256 pricePerUnitCAP);
    event PurchaseRequested(uint256 indexed purchaseId, uint256 indexed listingId, address indexed buyer, uint256 units, uint256 paymentCAP);
    event PurchaseSettled(uint256 indexed purchaseId, address indexed seller, address indexed buyer, uint256 units, uint256 paymentCAP);
    event PurchaseRejected(uint256 indexed purchaseId);
    event PurchaseCancelled(uint256 indexed purchaseId);
    event ListingClosed(uint256 indexed listingId);

    constructor(address assetToken_, address capToken_) {
        require(assetToken_ != address(0) && capToken_ != address(0), "zero address");
        assetToken = ICaprovAssetTokenV2(assetToken_);
        capToken = ICAPToken(capToken_);
    }

    /// @notice Seller escrows asset units before they can be offered.
    function createListing(uint256 assetId, uint256 units, uint256 pricePerUnitCAP) external returns (uint256 listingId) {
        require(units > 0 && pricePerUnitCAP > 0, "invalid listing");
        listingId = nextListingId++;
        listings[listingId] = Listing(msg.sender, assetId, units, pricePerUnitCAP, true);
        assetToken.safeTransferFrom(msg.sender, address(this), assetId, units, "");
        emit Listed(listingId, msg.sender, assetId, units, pricePerUnitCAP);
    }

    /// @notice Buyer must hold and approve sufficient CAP. CAP is held in escrow until seller approval.
    function requestPurchase(uint256 listingId, uint256 units) external returns (uint256 purchaseId) {
        Listing storage listing = listings[listingId];
        require(listing.active && msg.sender != listing.seller, "invalid purchase");
        require(units > 0 && units <= listing.remaining, "invalid units");
        uint256 payment = units * listing.pricePerUnitCAP;
        listing.remaining -= units;
        if (listing.remaining == 0) listing.active = false;
        require(capToken.transferFrom(msg.sender, address(this), payment), "CAP payment failed");
        purchaseId = nextPurchaseId++;
        purchases[purchaseId] = Purchase(listingId, msg.sender, units, payment, PurchaseStatus.PAYMENT_ESCROWED);
        emit PurchaseRequested(purchaseId, listingId, msg.sender, units, payment);
    }

    /// @notice Only the original seller may approve. Asset units and CAP settle in the same transaction.
    function approveSettlement(uint256 purchaseId) external {
        Purchase storage purchase = purchases[purchaseId];
        Listing storage listing = listings[purchase.listingId];
        require(purchase.status == PurchaseStatus.PAYMENT_ESCROWED, "not pending");
        require(msg.sender == listing.seller, "not seller");
        purchase.status = PurchaseStatus.SETTLED;
        require(capToken.transfer(listing.seller, purchase.paymentCAP), "CAP payout failed");
        assetToken.safeTransferFrom(address(this), purchase.buyer, listing.assetId, purchase.units, "");
        emit PurchaseSettled(purchaseId, listing.seller, purchase.buyer, purchase.units, purchase.paymentCAP);
    }

    /// @notice Seller rejection restores reserved units and refunds the buyer's CAP.
    function rejectSettlement(uint256 purchaseId) external {
        Purchase storage purchase = purchases[purchaseId];
        Listing storage listing = listings[purchase.listingId];
        require(purchase.status == PurchaseStatus.PAYMENT_ESCROWED && msg.sender == listing.seller, "not seller/pending");
        purchase.status = PurchaseStatus.REJECTED;
        listing.remaining += purchase.units;
        listing.active = true;
        require(capToken.transfer(purchase.buyer, purchase.paymentCAP), "CAP refund failed");
        emit PurchaseRejected(purchaseId);
    }

    /// @notice Buyer may cancel an unapproved purchase and recover escrowed CAP.
    function cancelPurchase(uint256 purchaseId) external {
        Purchase storage purchase = purchases[purchaseId];
        Listing storage listing = listings[purchase.listingId];
        require(purchase.status == PurchaseStatus.PAYMENT_ESCROWED && msg.sender == purchase.buyer, "not buyer/pending");
        purchase.status = PurchaseStatus.CANCELLED;
        listing.remaining += purchase.units;
        listing.active = true;
        require(capToken.transfer(purchase.buyer, purchase.paymentCAP), "CAP refund failed");
        emit PurchaseCancelled(purchaseId);
    }

    function closeListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        require(listing.active && msg.sender == listing.seller, "not seller");
        listing.active = false;
        assetToken.safeTransferFrom(address(this), listing.seller, listing.assetId, listing.remaining, "");
        emit ListingClosed(listingId);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) { return this.onERC1155Received.selector; }
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) { return this.onERC1155BatchReceived.selector; }
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) { return interfaceId == 0x4e2312e0 || interfaceId == 0x01ffc9a7; }
}
