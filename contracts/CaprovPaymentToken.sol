// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @notice CAP payment token. One CAP is intended to represent one USD only with an external reserve/redemption policy.
contract CaprovPaymentToken {
    string public constant name = "CAP"; string public constant symbol = "CAP"; uint8 public constant decimals = 18;
    address public owner; uint256 public totalSupply;
    mapping(address => uint256) public balanceOf; mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value); event Approval(address indexed owner, address indexed spender, uint256 value);
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; } constructor() { owner = msg.sender; }
    function transfer(address to, uint256 value) external returns (bool) { _transfer(msg.sender, to, value); return true; }
    function approve(address spender, uint256 value) external returns (bool) { allowance[msg.sender][spender] = value; emit Approval(msg.sender, spender, value); return true; }
    function transferFrom(address from, address to, uint256 value) external returns (bool) { uint256 allowed = allowance[from][msg.sender]; require(allowed >= value, "allowance"); if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - value; _transfer(from, to, value); return true; }
    function mint(address to, uint256 value) external onlyOwner { require(to != address(0), "zero recipient"); totalSupply += value; balanceOf[to] += value; emit Transfer(address(0), to, value); }
    function _transfer(address from, address to, uint256 value) private { require(to != address(0) && balanceOf[from] >= value, "invalid transfer"); balanceOf[from] -= value; balanceOf[to] += value; emit Transfer(from, to, value); }
}
