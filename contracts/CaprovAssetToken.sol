// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ERC-1155 asset units. One id represents one asset and its fungible units.
contract CaprovAssetToken {
    address public owner;
    string private baseURI;
    mapping(uint256 => mapping(address => uint256)) private balances;
    mapping(address => mapping(address => bool)) private approvals;
    mapping(uint256 => uint256) public totalSupply;
    mapping(uint256 => bool) public assetCreated;

    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values);
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);
    event URI(string value, uint256 indexed id);
    event AssetCreated(uint256 indexed id, uint256 supply, string assetReference);
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    constructor(string memory uri_) { owner = msg.sender; baseURI = uri_; }
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) { return interfaceId == 0xd9b67a26 || interfaceId == 0x01ffc9a7; }
    function uri(uint256) external view returns (string memory) { return baseURI; }
    function setURI(string calldata uri_) external onlyOwner { baseURI = uri_; }
    function balanceOf(address account, uint256 id) external view returns (uint256) { require(account != address(0), "zero account"); return balances[id][account]; }
    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids) external view returns (uint256[] memory result) {
        require(accounts.length == ids.length, "length mismatch"); result = new uint256[](accounts.length);
        for (uint256 i; i < accounts.length; ++i) { require(accounts[i] != address(0), "zero account"); result[i] = balances[ids[i]][accounts[i]]; }
    }
    function setApprovalForAll(address operator, bool approved) external { approvals[msg.sender][operator] = approved; emit ApprovalForAll(msg.sender, operator, approved); }
    function isApprovedForAll(address account, address operator) external view returns (bool) { return approvals[account][operator]; }
    /// @dev An id can be minted exactly once; supply is immutable after tokenization.
    function mintAsset(address to, uint256 id, uint256 amount, string calldata assetReference) external onlyOwner {
        require(!assetCreated[id], "asset already tokenized"); require(to != address(0) && amount > 0, "invalid mint");
        assetCreated[id] = true; totalSupply[id] = amount; balances[id][to] = amount;
        emit TransferSingle(msg.sender, address(0), to, id, amount); emit URI(baseURI, id); emit AssetCreated(id, amount, assetReference);
    }
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external {
        require(from == msg.sender || approvals[from][msg.sender], "not approved"); _transfer(from, to, id, amount, data);
    }
    function safeBatchTransferFrom(address from, address to, uint256[] calldata ids, uint256[] calldata amounts, bytes calldata data) external {
        require(from == msg.sender || approvals[from][msg.sender], "not approved"); require(ids.length == amounts.length && to != address(0), "invalid batch");
        for (uint256 i; i < ids.length; ++i) { require(balances[ids[i]][from] >= amounts[i], "insufficient balance"); balances[ids[i]][from] -= amounts[i]; balances[ids[i]][to] += amounts[i]; }
        emit TransferBatch(msg.sender, from, to, ids, amounts); _checkReceiver(to, msg.sender, from, ids, amounts, data);
    }
    function _transfer(address from, address to, uint256 id, uint256 amount, bytes calldata data) private {
        require(to != address(0) && balances[id][from] >= amount, "invalid transfer"); balances[id][from] -= amount; balances[id][to] += amount;
        emit TransferSingle(msg.sender, from, to, id, amount); _checkReceiver(to, msg.sender, from, id, amount, data);
    }
    function _checkReceiver(address to, address operator, address from, uint256 id, uint256 amount, bytes calldata data) private {
        if (to.code.length == 0) return;
        try IERC1155Receiver(to).onERC1155Received(operator, from, id, amount, data) returns (bytes4 response) { require(response == IERC1155Receiver.onERC1155Received.selector, "unsafe recipient"); } catch { revert("unsafe recipient"); }
    }
    function _checkReceiver(address to, address operator, address from, uint256[] calldata ids, uint256[] calldata amounts, bytes calldata data) private {
        if (to.code.length == 0) return;
        try IERC1155Receiver(to).onERC1155BatchReceived(operator, from, ids, amounts, data) returns (bytes4 response) { require(response == IERC1155Receiver.onERC1155BatchReceived.selector, "unsafe recipient"); } catch { revert("unsafe recipient"); }
    }
}
interface IERC1155Receiver {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4);
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external returns (bytes4);
}
