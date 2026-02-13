// SPDX-License-Identifier: MIT
pragma solidity >=0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title DarkToken (DARK)
 * @notice Simple mintable ERC20 token for the ShadowPool dark pool trading pair.
 *         Anyone can mint for testing on the hackathon sandbox.
 */
contract DarkToken is ERC20 {
    uint256 public constant MINT_AMOUNT = 10_000 * 1e18; // 10,000 DARK per mint

    constructor() ERC20("DarkToken", "DARK") {}

    /// @notice Mint test tokens to caller
    function mint() external {
        _mint(msg.sender, MINT_AMOUNT);
    }

    /// @notice Mint test tokens to a specific address
    function mintTo(address to) external {
        _mint(to, MINT_AMOUNT);
    }
}
