// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC1155CollateralV2 {
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;
}

/// @notice ERC-1155 collateral vault with owner-managed bank execution delegates.
contract CaprovCollateralVaultV2 {
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
    mapping(address => bool) public loanActivators;
    mapping(address => bool) public releaseExecutors;
    mapping(uint256 => Collateral) public collateral;

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier onlyLoanActivator() { require(loanActivators[msg.sender], "not loan activator"); _; }
    modifier onlyReleaseExecutor() { require(msg.sender == owner || releaseExecutors[msg.sender], "not release executor"); _; }
    modifier onlyBorrower(uint256 collateralId) { require(msg.sender == collateral[collateralId].borrower, "not borrower"); _; }

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event LoanActivatorUpdated(address indexed account, bool allowed);
    event ReleaseExecutorUpdated(address indexed account, bool allowed);
    event CollateralLocked(uint256 indexed collateralId, address indexed borrower, address indexed assetToken, uint256 tokenId, uint256 units);
    event LoanActivated(uint256 indexed collateralId, address indexed lender, bytes32 indexed loanReference);
    event CollateralReleased(uint256 indexed collateralId, address indexed borrower);
    event CollateralClaimed(uint256 indexed collateralId, address indexed lender);

    constructor(address initialOwner) {
        require(initialOwner != address(0), "zero owner");
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice The owner controls which bank settlement wallets may activate loans.
    function setLoanActivator(address account, bool allowed) external onlyOwner {
        require(account != address(0), "zero activator");
        loanActivators[account] = allowed;
        emit LoanActivatorUpdated(account, allowed);
    }

    /// @notice Allows a bank custody wallet to return repaid collateral without granting vault ownership.
    function setReleaseExecutor(address account, bool allowed) external onlyOwner {
        require(account != address(0), "zero executor");
        releaseExecutors[account] = allowed;
        emit ReleaseExecutorUpdated(account, allowed);
    }

    function lockCollateral(address assetToken, uint256 tokenId, uint256 units) external returns (uint256 collateralId) {
        require(assetToken != address(0) && units > 0, "invalid collateral");
        collateralId = nextCollateralId++;
        collateral[collateralId] = Collateral(msg.sender, address(0), assetToken, tokenId, units, bytes32(0), Status.LOCKED);
        IERC1155CollateralV2(assetToken).safeTransferFrom(msg.sender, address(this), tokenId, units, "");
        emit CollateralLocked(collateralId, msg.sender, assetToken, tokenId, units);
    }

    /// @notice A whitelisted bank wallet activates a loan and becomes its on-chain lender.
    function activateLoan(uint256 collateralId, bytes32 loanReference) external onlyLoanActivator {
        Collateral storage item = collateral[collateralId];
        require(item.status == Status.LOCKED, "not activatable");
        item.lender = msg.sender;
        item.loanReference = loanReference;
        item.status = Status.ACTIVE;
        emit LoanActivated(collateralId, msg.sender, loanReference);
    }

    /// @notice Allows a borrower to cancel an unactivated collateral lock.
    function cancelLockedCollateral(uint256 collateralId) external onlyBorrower(collateralId) {
        Collateral storage item = collateral[collateralId];
        require(item.status == Status.LOCKED, "not locked");
        item.status = Status.RELEASED;
        IERC1155CollateralV2(item.assetToken).safeTransferFrom(address(this), item.borrower, item.tokenId, item.units, "");
        emit CollateralReleased(collateralId, item.borrower);
    }

    /// @dev The owner or an explicitly authorized bank release executor acts after repayment verification.
    function releaseAfterRepayment(uint256 collateralId) external onlyReleaseExecutor {
        Collateral storage item = collateral[collateralId];
        require(item.status == Status.ACTIVE, "not active");
        item.status = Status.RELEASED;
        IERC1155CollateralV2(item.assetToken).safeTransferFrom(address(this), item.borrower, item.tokenId, item.units, "");
        emit CollateralReleased(collateralId, item.borrower);
    }

    /// @dev Owner/multisig executes after the off-chain default and grace-period process.
    function claimAfterDefault(uint256 collateralId) external onlyOwner {
        Collateral storage item = collateral[collateralId];
        require(item.status == Status.ACTIVE && item.lender != address(0), "not claimable");
        item.status = Status.CLAIMED;
        IERC1155CollateralV2(item.assetToken).safeTransferFrom(address(this), item.lender, item.tokenId, item.units, "");
        emit CollateralClaimed(collateralId, item.lender);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) { return this.onERC1155Received.selector; }
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) { return this.onERC1155BatchReceived.selector; }
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) { return interfaceId == 0x4e2312e0 || interfaceId == 0x01ffc9a7; }
}
