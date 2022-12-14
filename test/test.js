const { LogLevel, Logger } = require('@ethersproject/logger');
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");

// Close warning: Duplicate definitions
Logger.setLogLevel(LogLevel.ERROR);

async function deployContracts() {
    const feeSharingERC20Factory = await ethers.getContractFactory("FeeSharingERC20");
    const feeSharingERC20 = await feeSharingERC20Factory.deploy("Fee Sharing Token", "FST");
    await feeSharingERC20.deployed();
    
    return {
        feeSharingERC20
    };
}


describe("FeeSharingERC20", function () {
    let owner; // owner who deploys all contracts
    let user1, user2, user3, user4, user5;

    let feeSharingERC20;

    const UNISWAP_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
    // address private constant FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    // address private constant ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    // address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    const EPSILON = 1;

    const TOTAL_SUPPLY = ethers.utils.parseUnits("100000", 18); // 1e5

    const USER1_INITIAL_TOKEN_AMOUNT = ethers.utils.parseUnits("10000", 18);
    const USER2_INITIAL_TOKEN_AMOUNT = ethers.utils.parseUnits("20000", 18);
    const USER3_INITIAL_TOKEN_AMOUNT = ethers.utils.parseUnits("30000", 18);
    const USER4_INITIAL_TOKEN_AMOUNT = ethers.utils.parseUnits("40000", 18);
    const USER5_INITIAL_TOKEN_AMOUNT = 0;

    const USER4_TRANSFER_TO_USER5_TOKEN_AMOUNT = ethers.utils.parseUnits("10000", 18);
    
    before(async () => {
        [owner, user1, user2, user3, user4, user5] = await ethers.getSigners();
    });

    it("Deploy the feeSharingERC20 contract, owner should have 1e10 tokens initially", async function () {
        ({ feeSharingERC20 } = await loadFixture(deployContracts));
        expect(await feeSharingERC20.balanceOf(owner.address)).to.equal(TOTAL_SUPPLY);
    });

    it("Contract owner transfer 100, 200, 300, 400 tokens to user1, user2, user3, user4, respectively. The transfer from contract owner should not be taxed", async function () {
        await feeSharingERC20.connect(owner).transfer(user1.address, USER1_INITIAL_TOKEN_AMOUNT);
        await feeSharingERC20.connect(owner).transfer(user2.address, USER2_INITIAL_TOKEN_AMOUNT);
        await feeSharingERC20.connect(owner).transfer(user3.address, USER3_INITIAL_TOKEN_AMOUNT);
        await feeSharingERC20.connect(owner).transfer(user4.address, USER4_INITIAL_TOKEN_AMOUNT);

        expect(await feeSharingERC20.balanceOf(user1.address)).to.equal(USER1_INITIAL_TOKEN_AMOUNT);
        expect(await feeSharingERC20.balanceOf(user2.address)).to.equal(USER2_INITIAL_TOKEN_AMOUNT);
        expect(await feeSharingERC20.balanceOf(user3.address)).to.equal(USER3_INITIAL_TOKEN_AMOUNT);
        expect(await feeSharingERC20.balanceOf(user4.address)).to.equal(USER4_INITIAL_TOKEN_AMOUNT);
        expect(await feeSharingERC20.balanceOf(user5.address)).to.equal(USER5_INITIAL_TOKEN_AMOUNT); // user5: 0 tokens
    });

    it("User4 transfer 10000 tokens to user5, the tax should be 500 tokens and distributed to all holders", async function () {
        // Initial Balance:
        //  User1: 10000
        //  User1: 20000
        //  User1: 30000
        //  User1: 40000
        //  User5: 0

        await feeSharingERC20.connect(user4).transfer(user5.address, USER4_TRANSFER_TO_USER5_TOKEN_AMOUNT);
        
        const user1Balance = await feeSharingERC20.balanceOf(user1.address) / 1e18;
        const user2Balance = await feeSharingERC20.balanceOf(user2.address) / 1e18;
        const user3Balance = await feeSharingERC20.balanceOf(user3.address) / 1e18;
        const user4Balance = await feeSharingERC20.balanceOf(user4.address) / 1e18;
        const user5Balance = await feeSharingERC20.balanceOf(user5.address) / 1e18;

        // console.log("User1: " + `${user1Balance}`);
        // console.log("User2: " + `${user2Balance}`);
        // console.log("User3: " + `${user3Balance}`);
        // console.log("User4: " + `${user4Balance}`);
        // console.log("User5: " + `${user5Balance}`);

        // The tax (500 tokens) should be distributed to all the holders:
        //   User1: 10000 + (10000 / 100000) * 500 = 10050 tokens
        //   User2: 20000 + (20000 / 100000) * 500 = 20100 tokens
        //   User3: 30000 + (30000 / 100000) * 500 = 30150 tokens
        //   User4: 40000 - 10000 + (30000 / 100000) * 500 = 30150 tokens
        //   User5: 0 + 9500 + (9500 / 100000) * 500 = 9547.5 tokens

        expect(Math.abs(user1Balance - 10050)).to.be.lessThan(EPSILON);
        expect(Math.abs(user2Balance - 20100)).to.be.lessThan(EPSILON);
        expect(Math.abs(user3Balance - 30150)).to.be.lessThan(EPSILON);
        expect(Math.abs(user4Balance - 30150)).to.be.lessThan(EPSILON);
        expect(Math.abs(user5Balance - 9547.5)).to.be.lessThan(EPSILON);
    });
    
    // it("Deploy the feeSharingERC20 contract, owner should have 1e10 tokens initially", async function () {
        
    // });

    // it("Deploy the feeSharingERC20 contract, owner should have 1e10 tokens initially", async function () {
        
    // });
    
    // it("Deploy the feeSharingERC20 contract, owner should have 1e10 tokens initially", async function () {
        
    // });


});
