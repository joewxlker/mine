// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract UniswapV3LiquidityMining is Ownable, ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    IERC20 public rewardToken;
    INonfungiblePositionManager public positionManager;
    IUniswapV3Pool public pool;
    IUniswapV3Factory public factory;

    struct StakedPosition {
        uint256 tokenId;
        uint128 liquidity;
        uint256 rewardDebt;
    }

    mapping(address => mapping(uint256 => StakedPosition)) public userStakes;
    mapping(uint256 => address) public tokenOwners;

    uint256 public rewardRatePerSecond = 1e18;
    uint256 public totalLiquidity;
    uint256 public accRewardPerLiquidity;
    uint256 public lastRewardTime;

    event Stake(address indexed user, uint256 tokenId, uint128 liquidity);
    event Unstake(address indexed user, uint256 tokenId, uint128 liquidity);
    event ClaimReward(address indexed user, uint256 amount);
    event RewardRateUpdated(uint256 newRewardRate);

    constructor(
        IERC20 _rewardToken,
        INonfungiblePositionManager _positionManager,
        IUniswapV3Pool _pool,
        IUniswapV3Factory _factory
    ) {
        rewardToken = _rewardToken;
        positionManager = _positionManager;
        pool = _pool;
        factory = _factory;
        lastRewardTime = block.timestamp;
    }

    // Implement IERC721Receiver to accept ERC721 tokens
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // Update reward variables
    function _updatePool() internal {
        if (block.timestamp > lastRewardTime && totalLiquidity > 0) {
            uint256 timeElapsed = block.timestamp - lastRewardTime;
            uint256 reward = timeElapsed * rewardRatePerSecond;
            accRewardPerLiquidity += (reward * 1e18) / totalLiquidity;
        }
        lastRewardTime = block.timestamp;
    }

    function stake(uint256 tokenId) external nonReentrant {
        // Transfer the NFT to the contract
        positionManager.safeTransferFrom(msg.sender, address(this), tokenId);

        // Get position details
        (
            ,// uint96 nonce, 
            ,// address operator, 
            ,// address token0 
            ,// address token1 
            uint24 fee, 
            int24 tickLower, 
            int24 tickUpper, 
            uint128 liquidity, 
            ,// uint256 feeGrowthInside0LastX128, 
            ,// uint256 feeGrowthInside1LastX128, 
            ,// uint128 tokensOwed0, 
             // uint128 tokensOwed1
        ) = positionManager.positions(tokenId);

        require(liquidity > 0, "No liquidity in the position");

        // Verify the pool matches
        address token0 = pool.token0();
        address token1 = pool.token1();
        IUniswapV3Pool _pool = IUniswapV3Pool(factory.getPool(token0, token1, fee));
        require(address(_pool) == address(pool), "Invalid pool");

        // Ensure the position is in range
        (, int24 currentTick, , , , , ) = pool.slot0();
        require(currentTick >= tickLower && currentTick <= tickUpper, "Position is out of range");

        _updatePool();

        // Update user stake
        StakedPosition storage position = userStakes[msg.sender][tokenId];
        require(position.liquidity == 0, "Token already staked");

        position.tokenId = tokenId;
        position.liquidity = liquidity;
        position.rewardDebt = (liquidity * accRewardPerLiquidity) / 1e18;

        tokenOwners[tokenId] = msg.sender;
        totalLiquidity += liquidity;

        emit Stake(msg.sender, tokenId, liquidity);
    }

    function unstake(uint256 tokenId) external nonReentrant {
        StakedPosition storage position = userStakes[msg.sender][tokenId];
        require(position.liquidity > 0, "Not staker of this token");

        _updatePool();

        uint256 pending = ((position.liquidity * accRewardPerLiquidity) / 1e18) - position.rewardDebt;
        if (pending > 0) {
            _safeRewardTransfer(msg.sender, pending);
            emit ClaimReward(msg.sender, pending);
        }

        totalLiquidity -= position.liquidity;

        // Transfer the NFT back to the user
        positionManager.safeTransferFrom(address(this), msg.sender, tokenId);

        delete userStakes[msg.sender][tokenId];
        delete tokenOwners[tokenId];

        emit Unstake(msg.sender, tokenId, position.liquidity);
    }

    function claimRewards(uint256 tokenId) external nonReentrant {
        StakedPosition storage position = userStakes[msg.sender][tokenId];
        require(position.liquidity > 0, "No staked liquidity");

        _updatePool();

        uint256 pending = ((position.liquidity * accRewardPerLiquidity) / 1e18) - position.rewardDebt;
        position.rewardDebt = (position.liquidity * accRewardPerLiquidity) / 1e18;

        if (pending > 0) {
            _safeRewardTransfer(msg.sender, pending);
            emit ClaimReward(msg.sender, pending);
        }
    }

    function _safeRewardTransfer(address to, uint256 amount) internal {
        uint256 rewardBal = rewardToken.balanceOf(address(this));
        require(rewardBal > amount, "Insufficient reward tokens");

        rewardToken.safeTransfer(to, amount);
    }

    function pendingRewards(address user, uint256 tokenId) external view returns (uint256 pending) {
        StakedPosition storage position = userStakes[user][tokenId];
        if (position.liquidity == 0) return 0;

        uint256 _accRewardPerLiquidity = accRewardPerLiquidity;
        if (block.timestamp > lastRewardTime && totalLiquidity > 0) {
            uint256 timeElapsed = block.timestamp - lastRewardTime;
            uint256 reward = timeElapsed * rewardRatePerSecond;
            _accRewardPerLiquidity += (reward * 1e18) / totalLiquidity;
        }

        pending = ((position.liquidity * _accRewardPerLiquidity) / 1e18) - position.rewardDebt;
    }

    event Debug(
        uint256 liquidity,
        uint256 durationInSeconds,
        uint256 _accRewardPerLiquidity,
        uint256 accRewardPerLiquidity,
        uint256 esitmatedRewards,
        uint256 totalLiquidity,
        uint256 rewardRatePerSecond
    );

    function estimateRewards(uint256 liquidity, uint256 durationInSeconds) external view returns (uint256 estimatedRewards) {
        require(liquidity > 0, "Liquidity must be greater than zero");
        require(durationInSeconds > 0, "Duration must be greater than zero");

        uint256 _accRewardPerLiquidity = accRewardPerLiquidity;

        if (durationInSeconds > 0 && totalLiquidity > 0) {
            uint256 reward = durationInSeconds * rewardRatePerSecond;
            _accRewardPerLiquidity += (reward * 1e18) / totalLiquidity;
        }

        estimatedRewards = ((liquidity * _accRewardPerLiquidity) / 1e18) - ((liquidity * accRewardPerLiquidity) / 1e18);

        // uint256 _estimatedRewards = ((liquidity * _accRewardPerLiquidity) / 1e18) - ((liquidity * accRewardPerLiquidity) / 1e18);

        // emit Debug(
        //     liquidity,
        //     durationInSeconds,
        //     _accRewardPerLiquidity,
        //     accRewardPerLiquidity,
        //     _estimatedRewards,
        //     totalLiquidity,
        //     rewardRatePerSecond
        // );

        // return _estimatedRewards;
    }

    function setRewardRatePerSecond(uint256 _rewardRatePerSecond) external onlyOwner {
        _updatePool();
        rewardRatePerSecond = _rewardRatePerSecond;
        emit RewardRateUpdated(_rewardRatePerSecond);
    }

    function withdrawRewardTokens(uint256 amount) external onlyOwner {
        rewardToken.safeTransfer(msg.sender, amount);
    }

    function withdrawETH(uint256 amount) external onlyOwner {
        uint256 contractEthBalance = address(this).balance;
        require(contractEthBalance >= amount, "Insufficient ETH balance");
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20 tokenContract = IERC20(token);
        uint256 tokenBalance = tokenContract.balanceOf(address(this));
        require(tokenBalance >= amount, "Insufficient token balance");
        tokenContract.safeTransfer(msg.sender, amount);
    }
    
    // Fallback function to accept ETH (if needed for certain reward tokens)
    receive() external payable {}
}