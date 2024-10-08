import hardhat from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { getBigInt, Signer } from "ethers";
import { calculateSqrtPrice } from "../utils/amounts";
import { NonfungiblePositionManager, UniswapV3Factory } from "../typechain-types";
import { erc20 } from "../typechain-types/@openzeppelin/contracts/token";

interface Contract<T> {
    contract: T;
    address: string;
}

interface Holder {
    address: string,
    account: Signer,
    token0Balance: bigint,
    token1Balance: bigint,
    tokenId: bigint;
}

const mockEventPromise = ({ contract }: Contract<any>, eventName: string): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => reject(`${eventName} did not emit`), 10000);
        contract.once(eventName as any, (...event: any) => {
            resolve(event);
        });
    })
}

describe("UniswapV3LiquidityMining", () => {
    const loadFixtures = async () => {
        const [owner, accountOne, accountTwo] = await hardhat.ethers.getSigners();

        const holderOne: Holder = {
            address: accountOne.address,
            account: accountOne,
            token0Balance: 0n,
            token1Balance: 0n,
            tokenId: 0n
        }

        const holderTwo: Holder = {
            ...holderOne,
            account: accountTwo,
            address: accountTwo.address
        }

        const factory = { 
            contract: await hardhat.ethers.getContractAt("IUniswapV3Factory", "0x1F98431c8aD98523631AE4a59f267346ea31F984"),
            address: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        } as Contract<UniswapV3Factory>;

        const positionManager = { 
            contract: await hardhat.ethers.getContractAt("INonfungiblePositionManager", "0xC36442b4a4522E871399CD717aBDD847Ab11FE88"),
            address: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
        } as Contract<NonfungiblePositionManager>;

        let token0 = {
            contract: await (await hardhat.ethers.getContractFactory("Token", owner)).deploy(),
            address: "",
            liquidityAmount: 70000000000000000000000000n,
            totalSupply: 100000000000000000000000000n
        } as Contract<erc20.ERC20> & { liquidityAmount: bigint, totalSupply: bigint };
        token0.address = await token0.contract.getAddress();

        let token1 = {
            contract: await (await hardhat.ethers.getContractFactory("Token", owner)).deploy(),
            address: "",
            liquidityAmount: 1000000000000000000n,
            totalSupply: 100000000000000000000000000n
        } as Contract<erc20.ERC20> & { liquidityAmount: bigint, totalSupply: bigint };
        token1.address = await token1.contract.getAddress();

        if (getBigInt(token0.address) > getBigInt(token1.address)) {
            let temp = token0; token0 = token1; token1 = temp;
        }

        await token0.contract.connect(owner).approve(positionManager.address, token0.liquidityAmount);
        await token1.contract.connect(owner).approve(positionManager.address, token1.liquidityAmount);

        const sqrtPriceX96 = calculateSqrtPrice(token0.liquidityAmount, token1.liquidityAmount);

        await positionManager.contract.createAndInitializePoolIfNecessary(
            token0.address,
            token1.address,
            3000,
            sqrtPriceX96
        ).catch((err: any) => {
            throw new Error(`Failed to create and initialize pool: ${err}`);
        });

        let mintParams = {
            token0: token0.address,
            token1: token1.address,
            fee: 3000n,
            tickLower: -887220n,
            tickUpper: 887220n,
            amount0Desired: token0.liquidityAmount,
            amount1Desired: token1.liquidityAmount,
            amount0Min: token0.liquidityAmount / 100n * 90n,
            amount1Min: token1.liquidityAmount / 100n * 90n,
            recipient: owner.address,
            deadline: Math.floor(Date.now() / 1000) + 60 * 10,
        };

        await positionManager.contract.mint(mintParams).catch((err: any) => {
            throw new Error(`Failed to mint intial liquidity position: ${err}`);
        });

        let pool = {
            contract: await hardhat.ethers.getContractAt(
            "IUniswapV3Pool",
            await factory.contract.getPool(token0.address, token1.address, 3000)),
            address: ""
        };
        pool.address = await pool.contract.getAddress();

        const contractFactory = await hardhat.ethers
            .getContractFactory("UniswapV3LiquidityMining", owner)
            .catch((err) => {
                throw new Error(`Failed to load UniswapV3LiquidityMining factory: ${err}`);
            });

        let liquidityMining = {
            contract: await contractFactory?.deploy(
                token0.address,
                positionManager.address,
                pool.address,
                factory.address
            ).catch((err) => {
                throw new Error(`Failed to deploy UniswapV3LiquidityMining: ${err}`);
            }),
            address: "",
        }
        liquidityMining.address = await liquidityMining.contract?.getAddress() ?? "";

        await token0
            .contract
            .connect(owner)
            .transfer(
                liquidityMining.address, 
                20000000000000000000000000n
            );

        let holderTokenBalance = await token0.contract.totalSupply() / 100n;
        let holderEthBalance = 10n ** await token1.contract.decimals(); 

        // Set initial holder mint params values
        mintParams.amount0Desired = holderTokenBalance;
        mintParams.amount1Desired = holderEthBalance;
        mintParams.amount0Min = 0n;
        mintParams.amount1Min = 0n;

        // Holder one params
        let mintParamsOne = { ...mintParams };

        // Holder two params (out of range)
        let mintParamsTwo = { ...mintParams };
        mintParamsTwo.tickLower = -887220n;
        mintParamsTwo.tickUpper = -180660n;

        // Iterates through and creates liquidity pairs for each holder
        //   - holder one should generate a full range
        //   - holder two should generate a concentrated pool exceeding the current tick range
        for(let [params, holder] of [[mintParamsOne, holderOne], [mintParamsTwo, holderTwo]] as const) {
            // Set NFT receiver to caller address
            params.recipient = holder.address;

            // Transfer initial token balances to the holder
            await token0.contract.connect(owner).transfer(holder.address, holderTokenBalance).catch((err: any) => {
                throw new Error(`Failed to transfer tokens to holder: ${err}`);
            });
            await token1.contract.connect(owner).transfer(holder.address, holderEthBalance).catch((err: any) => {
                throw new Error(`Failed to transfer eth to holder: ${err}`);
            });
            
            // Approve and Mint holder one
            const tokenIdPromise = mockEventPromise(positionManager, "Transfer");
            await token0.contract.connect(holder.account).approve(positionManager.address, holderTokenBalance);
            await token1.contract.connect(holder.account).approve(positionManager.address, holderEthBalance);
            await positionManager.contract
                .connect(holder.account)
                .mint(params)
                .catch((err: any) => {
                    throw new Error(`Failed to mint intial liquidity position: ${err}`);
                });
    
            const tokenId = (await tokenIdPromise as any[])[2];
            holder.tokenId = tokenId;
        }

        return {
            token0,
            token1,
            fee: 3000,
            owner,
            holderOne,
            holderTwo,
            positionManager,
            liquidityMining,
            factory,
            pool
        };
    };

    it("creates and initializes the pool", async () => {
        const { pool, token0, token1 } = await loadFixture(loadFixtures);

        expect(pool.address).not.to.be.undefined;
        expect(pool.contract).not.to.be.undefined;
        
        const amount0 = await token0.contract.balanceOf(pool.address);
        const amount1 = await token1.contract.balanceOf(pool.address);

        expect(amount0).to.be.lessThan(72000000000000000000000000n);
        expect(amount0).to.be.greaterThan(60000000000000000000000000n);
        expect(amount1).to.be.lessThan(2100000000000000000n);
        expect(amount1).to.be.greaterThan(900000000000000000n);
    });

    it("deploys the UniswapV3LiquidityMining contract", async () => {
        const { token0, liquidityMining } = await loadFixture(loadFixtures);

        expect(liquidityMining.address).not.to.be.undefined;
        expect(liquidityMining.contract).not.to.be.undefined;

        const liquidityMiningTokenBal = await token0.contract.balanceOf(liquidityMining.address);
        const expected = 20000000000000000000000000n; 
        expect(liquidityMiningTokenBal).to.equal(expected);
    });

    it("User stakes full range position", async () => {
        const { liquidityMining, positionManager, holderOne } = await loadFixture(loadFixtures);

        const expectedLiquidity = 119522860933439363996n;

        // Approve and Stake
        const stakeEventPromise = mockEventPromise(liquidityMining, "Stake");
        await positionManager.contract?.connect(holderOne.account).approve(liquidityMining.address, holderOne.tokenId).catch((err: any) => {
            throw new Error(`Failed to approve nft transfer: ${err}`);
        });
        await liquidityMining.contract?.connect(holderOne.account).stake(holderOne.tokenId).catch((err: any) => {
            throw new Error(`Failed to stake position: ${err}`);
        });

        const stakeEvent = await stakeEventPromise;
        expect(stakeEvent[0]).to.equal(holderOne.address);
        expect(stakeEvent[1]).to.equal(holderOne.tokenId);
        expect(stakeEvent[2]).to.equal(expectedLiquidity);
    });

    it("Reverts out of range stake", async () => {
        const { liquidityMining, pool, positionManager, holderTwo } = await loadFixture(loadFixtures);

        const slot = await pool.contract.slot0();
        const position = await positionManager.contract.positions(holderTwo.tokenId);

        // Approve and Stake
        await positionManager.contract?.connect(holderTwo.account).approve(liquidityMining.address, holderTwo.tokenId).catch((err: any) => {
            throw new Error(`Failed to approve nft transfer: ${err}`);
        });
        const stakeTransaction = liquidityMining.contract?.connect(holderTwo.account).stake(holderTwo.tokenId).catch((err: any) => {
            throw new Error(`Failed to stake position: ${err}`);
        });

        // Ensures both the upper and lower tick values are out of bounds
        expect(position[5]).to.be.lessThan(slot[1]);
        expect(position[6]).to.be.lessThan(slot[1]);
        expect(stakeTransaction).to.revertedWith("Position is out of range");
    });

    it("Reverts if already staked", async () => {
        const { liquidityMining, positionManager, holderOne } = await loadFixture(loadFixtures);

        await positionManager.contract?.connect(holderOne.account).approve(liquidityMining.address, holderOne.tokenId).catch((err: any) => {
            throw new Error(`Failed to approve nft transfer: ${err}`);
        });
        await liquidityMining.contract?.connect(holderOne.account).stake(holderOne.tokenId).catch((err: any) => {
            throw new Error(`Failed to stake position: ${err}`);
        });

        const transaction = liquidityMining.contract?.connect(holderOne.account).stake(holderOne.tokenId).catch((err: any) => {
            throw new Error(`Failed to stake position: ${err}`);
        });

        expect(transaction).to.be.revertedWith("Token already staked");
    });

    it("User claims full range position", async () => {
        const { liquidityMining, positionManager, holderOne, token0 } = await loadFixture(loadFixtures);
        const claimEventPromise = mockEventPromise(liquidityMining, "ClaimReward");

        // Approve and Stake
        await positionManager.contract?.connect(holderOne.account).approve(liquidityMining.address, holderOne.tokenId).catch((err: any) => {
            throw new Error(`Failed to approve nft transfer: ${err}`);
        });
        await liquidityMining.contract?.connect(holderOne.account).stake(holderOne.tokenId).catch((err: any) => {
            throw new Error(`Failed to stake position: ${err}`);
        });

        const holderTokenBalance = await token0.contract.balanceOf(holderOne.address);

        // Claim tokens
        await liquidityMining.contract?.connect(holderOne.account).claimRewards(holderOne.tokenId);
        
        const expectedClaimAmount = 999999999999999942n;
        const expectedBalance = holderTokenBalance + expectedClaimAmount;
        const claimEvent = await claimEventPromise;
        
        expect(claimEvent[0]).to.equal(holderOne.address);
        expect(claimEvent[1]).to.equal(expectedClaimAmount);

        const accountBalance = await token0.contract.balanceOf(holderOne.address);
        expect(accountBalance).to.equal(expectedBalance);
    });

    it("User unstakes full range position", async () => {
        const { liquidityMining, positionManager, holderOne } = await loadFixture(loadFixtures);

        const expectedLiquidity = 0n;

        // Approve and Stake
        const unstakeEventPromise = mockEventPromise(liquidityMining, "Unstake");
        await positionManager.contract?.connect(holderOne.account).approve(liquidityMining.address, holderOne.tokenId).catch((err: any) => {
            throw new Error(`Failed to approve nft transfer: ${err}`);
        });
        await liquidityMining.contract?.connect(holderOne.account).stake(holderOne.tokenId).catch((err: any) => {
            throw new Error(`Failed to stake position: ${err}`);
        });

        // Unstake
        await liquidityMining.contract?.connect(holderOne.account).unstake(holderOne.tokenId);
        const unstakeEvent = await unstakeEventPromise;
        expect(unstakeEvent[0]).to.equal(holderOne.address);
        expect(unstakeEvent[1]).to.equal(holderOne.tokenId);
        expect(unstakeEvent[2]).to.equal(expectedLiquidity);
    });

    it("Estimates ROI correctly", async () => {
        const { liquidityMining, positionManager, holderOne } = await loadFixture(loadFixtures);

        // Approve and Stake
        await positionManager.contract?.connect(holderOne.account).approve(liquidityMining.address, holderOne.tokenId).catch((err: any) => {
            throw new Error(`Failed to approve nft transfer: ${err}`);
        });
        await liquidityMining.contract?.connect(holderOne.account).stake(holderOne.tokenId).catch((err: any) => {
            throw new Error(`Failed to stake position: ${err}`);
        });

        const liquidity = 119522860933439363996n;
        const daySeconds = 86400n;
        const weekSeconds = 604800n;

        const dayRewards = await liquidityMining.contract.estimateRewards(liquidity, daySeconds);
        const weekRewards = await liquidityMining.contract.estimateRewards(liquidity, weekSeconds);

        // day  86399999999999999999943n
        // week 604799999999999999999962n
    })
});