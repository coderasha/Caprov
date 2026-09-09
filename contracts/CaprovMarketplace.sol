// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface ICaprovAssetToken { function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external; }
interface ICaprovPaymentToken { function transferFrom(address from, address to, uint256 value) external returns (bool); }
interface IERC1155Receiver { function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4); function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external returns (bytes4); }
/// @notice Escrow marketplace: ERC-1155 units and ERC-20 CAPROV payment settle atomically.
contract CaprovMarketplace is IERC1155Receiver {
    struct Listing { address seller; uint256 assetId; uint256 remaining; uint256 pricePerUnit; bool active; }
    ICaprovAssetToken public immutable assetToken; ICaprovPaymentToken public immutable paymentToken; uint256 public nextListingId = 1;
    mapping(uint256 => Listing) public listings;
    event Listed(uint256 indexed listingId, address indexed seller, uint256 indexed assetId, uint256 amount, uint256 pricePerUnit);
    event Purchased(uint256 indexed listingId, address indexed buyer, uint256 amount, uint256 payment); event ListingClosed(uint256 indexed listingId);
    constructor(address assetToken_, address paymentToken_) { assetToken = ICaprovAssetToken(assetToken_); paymentToken = ICaprovPaymentToken(paymentToken_); }
    function createListing(uint256 assetId, uint256 amount, uint256 pricePerUnit) external returns (uint256 listingId) {
        require(amount > 0 && pricePerUnit > 0, "invalid listing"); listingId = nextListingId++; listings[listingId] = Listing(msg.sender, assetId, amount, pricePerUnit, true);
        assetToken.safeTransferFrom(msg.sender, address(this), assetId, amount, ""); emit Listed(listingId, msg.sender, assetId, amount, pricePerUnit);
    }
    function buy(uint256 listingId, uint256 amount) external {
        Listing storage listing = listings[listingId]; require(listing.active && msg.sender != listing.seller && amount > 0 && amount <= listing.remaining, "invalid purchase");
        uint256 payment = amount * listing.pricePerUnit; listing.remaining -= amount; if (listing.remaining == 0) listing.active = false;
        require(paymentToken.transferFrom(msg.sender, listing.seller, payment), "payment failed"); assetToken.safeTransferFrom(address(this), msg.sender, listing.assetId, amount, ""); emit Purchased(listingId, msg.sender, amount, payment);
    }
    function closeListing(uint256 listingId) external {
        Listing storage listing = listings[listingId]; require(listing.active && msg.sender == listing.seller, "not seller"); listing.active = false;
        assetToken.safeTransferFrom(address(this), listing.seller, listing.assetId, listing.remaining, ""); emit ListingClosed(listingId);
    }
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) { return this.onERC1155Received.selector; }
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) { return this.onERC1155BatchReceived.selector; }
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) { return interfaceId == 0x4e2312e0 || interfaceId == 0x01ffc9a7; }
}
