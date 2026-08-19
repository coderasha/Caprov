// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CaprovAssetToken
/// @notice Minimal ERC-1155 style token for CAPROV private-asset economic units on Ethereum Sepolia.
/// @dev Deploy on Ethereum Sepolia (chainId 11155111). Set ETHEREUM_TOKEN_CONTRACT to the deployed address.
contract CaprovAssetToken {
    address public owner;
    string public name = "CAPROV Asset Token";
    string public symbol = "CAPROV";
    string private baseUri;

    mapping(uint256 => mapping(address => uint256)) public balanceOf;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    event TransferSingle(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 id,
        uint256 value
    );
    event URI(string value, uint256 indexed id);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(string memory uri_) {
        owner = msg.sender;
        baseUri = uri_;
    }

    function setURI(string memory uri_) external onlyOwner {
        baseUri = uri_;
    }

    function uri(uint256) external view returns (string memory) {
        return baseUri;
    }

    function mint(address to, uint256 id, uint256 amount, bytes calldata) external onlyOwner {
        require(to != address(0), "bad to");
        balanceOf[id][to] += amount;
        emit TransferSingle(msg.sender, address(0), to, id, amount);
        emit URI(baseUri, id);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata) external {
        require(from == msg.sender || isApprovedForAll[from][msg.sender], "not approved");
        require(balanceOf[id][from] >= amount, "insufficient");
        balanceOf[id][from] -= amount;
        balanceOf[id][to] += amount;
        emit TransferSingle(msg.sender, from, to, id, amount);
    }
}
