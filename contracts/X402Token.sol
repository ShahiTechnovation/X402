// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title X402Token
 * @notice ERC20 token with mint and burn capabilities for the X402 Protocol
 * @dev Extends OpenZeppelin's ERC20, ERC20Burnable, and Ownable contracts
 * The owner has exclusive rights to mint new tokens, while any holder can burn their own tokens
 */
contract X402Token is ERC20, ERC20Burnable, Ownable {
    /**
     * @notice Constructs the X402Token contract
     * @param name The name of the token
     * @param symbol The symbol of the token
     * @param initialSupply The initial supply to mint to the deployer (can be 0)
     * @dev The deployer becomes the owner and receives the initial supply
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20(name, symbol) Ownable(msg.sender) {
        if (initialSupply > 0) {
            _mint(msg.sender, initialSupply);
        }
    }

    /**
     * @notice Mints new tokens to a specified address
     * @param to The address that will receive the minted tokens
     * @param amount The amount of tokens to mint
     * @dev Only callable by the contract owner
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
