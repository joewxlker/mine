import { expect } from "chai";
import hardhat from "hardhat"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Token", () => {
    const loadFixtures = async () => {
        const [owner, otherAccount] = await hardhat.ethers.getSigners();
        const factory = await hardhat.ethers.getContractFactory("Token", owner);
        const Token = await factory.deploy();
        
        return { Token, owner, otherAccount };
    };

    it("constructs", async () => {
         const { Token } = await loadFixture(loadFixtures);

         expect(Token).not.to.be.undefined;
    });

    it("mints the total supply to the owner", async () => {
         const { Token, owner } = await loadFixture(loadFixtures);

         expect(await Token.balanceOf(owner)).to.equal(await Token.totalSupply());
    });

    it("is transferable", async () => {
        const { Token, owner, otherAccount: receiver } = await loadFixture(loadFixtures);

        const tokenBalance = await Token.balanceOf(owner);
        const transferAmount = tokenBalance / 100n  * 1n;
        const transaction = (Token.connect(owner) as typeof Token)
            .transfer(receiver.address, transferAmount);

        await expect(transaction)
            .to.emit(Token, 'Transfer')
            .withArgs(owner.address, receiver.address, transferAmount);

        expect(await Token.balanceOf(receiver)).to.equal(transferAmount);
    });

    it("cannot transfer excessive of bal", async () => {
        const { Token, owner, otherAccount: receiver } = await loadFixture(loadFixtures);

        const tokenBalance = await Token.balanceOf(owner);
        const transferAmount = tokenBalance * 2n;
        const transaction = (Token.connect(owner) as typeof Token)
            .transfer(receiver.address, transferAmount);

        await expect(transaction).to.be.reverted;
        expect(await Token.balanceOf(receiver)).to.equal(0);
    });

    it("allows approved transfers", async () => {
        const { Token, owner, otherAccount: spender } = await loadFixture(loadFixtures);
    
        const approveAmount = 100n;
        const approval = (Token.connect(owner) as typeof Token)
            .approve(spender.address, approveAmount);

        const transfer = (Token.connect(spender) as typeof Token)
            .transferFrom(owner.address, spender.address, approveAmount);

        await expect(approval)
            .to.emit(Token, 'Approval')
            .withArgs(owner.address, spender.address, approveAmount);

        await expect(transfer)
            .to.emit(Token, 'Transfer')
            .withArgs(owner.address, spender.address, approveAmount);
    
        expect(await Token.balanceOf(spender.address)).to.equal(approveAmount);
    });

    it("reverts when not approved transfers", async () => {
        const { Token, owner, otherAccount: spender } = await loadFixture(loadFixtures);
    
        const transferAmount = 1000n;

        const transfer = (Token.connect(spender) as typeof Token)
            .transferFrom(owner.address, spender.address, transferAmount);

        await expect(transfer).to.be.reverted
        expect(await Token.balanceOf(spender.address)).to.equal(0n);
    });
})