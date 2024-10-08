// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Token is ERC20 {
    constructor() ERC20("RewardToken", "RWDT") {
        _mint(msg.sender, 100000000 * (10 ** decimals()));
    }
}