// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Holds ERC-1155 asset units as loan collateral. Fiat payment proof
/// is verified off-chain; only the platform settlement authority may activate
/// a loan after that verification.
interface IERC1155Collateral {
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;
}

contract CaprovCollateralVault {
    enum Status { LOCKED, ACTIVE, RELEASED, CLAIMED }
    struct Collateral {
        address borrower;
        address lender;
        address assetToken;
        uint256 tokenId;
        uint256 units;
        bytes32 loanReference;
        Status status;
    }

    address public owner;
    uint256 public nextCollateralId = 1;
    mapping(uint256 => Collateral) public collateral;
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier onlyBorrower(uint256 id) { require(msg.sender == collateral[id].borrower, "not borrower"); _; }

    event CollateralLocked(uint256 indexed collateralId, address indexed borrower, address indexed assetToken, uint256 tokenId, uint256 units);
    event LoanActivated(uint256 indexed collateralId, address indexed lender, bytes32 indexed loanReference);
    event CollateralReleased(uint256 indexed collateralId, address indexed borrower);
    event CollateralClaimed(uint256 indexed collateralId, address indexed lender);

    constructor() { owner = msg.sender; }

    function lockCollateral(address assetToken, uint256 tokenId, uint256 units) external returns (uint256 collateralId) {
        require(assetToken != address(0) && units > 0, "invalid collateral");
        collateralId = nextCollateralId++;
        collateral[collateralId] = Collateral(msg.sender, address(0), assetToken, tokenId, units, bytes32(0), Status.LOCKED);
        IERC1155Collateral(assetToken).safeTransferFrom(msg.sender, address(this), tokenId, units, "");
        emit CollateralLocked(collateralId, msg.sender, assetToken, tokenId, units);
    }

    /// @dev Call only after an authenticated external fiat-payment confirmation.
    function activateLoan(uint256 collateralId, address lender, bytes32 loanReference) external onlyOwner {
        Collateral storage item = collateral[collateralId];
        require(item.status == Status.LOCKED && lender != address(0), "not activatable");
        item.lender = lender; item.loanReference = loanReference; item.status = Status.ACTIVE;
        emit LoanActivated(collateralId, lender, loanReference);
    }

    function releaseAfterRepayment(uint256 collateralId) external onlyOwner {
        Collateral storage item = collateral[collateralId];
        require(item.status == Status.ACTIVE, "not active");
        item.status = Status.RELEASED;
        IERC1155Collateral(item.assetToken).safeTransferFrom(address(this), item.borrower, item.tokenId, item.units, "");
        emit CollateralReleased(collateralId, item.borrower);
    }

    /// @dev Only invoke after the off-chain default/grace-period process is complete.
    function claimAfterDefault(uint256 collateralId) external onlyOwner {
        Collateral storage item = collateral[collateralId];
        require(item.status == Status.ACTIVE && item.lender != address(0), "not claimable");
        item.status = Status.CLAIMED;
        IERC1155Collateral(item.assetToken).safeTransferFrom(address(this), item.lender, item.tokenId, item.units, "");
        emit CollateralClaimed(collateralId, item.lender);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) { return this.onERC1155Received.selector; }
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) { return this.onERC1155BatchReceived.selector; }
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) { return interfaceId == 0x4e2312e0; }
}
