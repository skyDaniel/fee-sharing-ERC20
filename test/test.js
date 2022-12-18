const { LogLevel, Logger } = require('@ethersproject/logger');
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { impersonateAccount } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require('hardhat');

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

    const ADDRESS_UNISWAP_ROUTER02 = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
    const ADDRESS_BUSD = "0x4Fabb145d64652a948d72533023f6E7A623C7C53";

    const ADDRESS_BINANCE_WALLET = '0xf977814e90da44bfa03b6295a0616a897441acec';

    // address private constant FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    // address private constant ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    // address private constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    const EPSILON = 1;

    const TOTAL_SUPPLY = ethers.utils.parseUnits("100000", 18); // 1e5

    const CONTRACT_INITIAL_BUSD_AMOUNT = ethers.utils.parseUnits("100000000", 18);

    const USER1_INITIAL_TOKEN_AMOUNT = ethers.utils.parseUnits("10000", 18);
    const USER2_INITIAL_TOKEN_AMOUNT = ethers.utils.parseUnits("20000", 18);
    const USER3_INITIAL_TOKEN_AMOUNT = ethers.utils.parseUnits("30000", 18);
    const USER4_INITIAL_TOKEN_AMOUNT = ethers.utils.parseUnits("30000", 18);
    const USER5_INITIAL_TOKEN_AMOUNT = 0;

    const INITIAL_LIQUIDITY_IN_UNISWAP = ethers.utils.parseUnits("10000", 18);

    const USER4_TRANSFER_TO_USER5_TOKEN_AMOUNT = ethers.utils.parseUnits("10000", 18);

    let busd;
    let uniswapV2Router;
    let uniswapV2PairBusd;

    let busdPairAddress;

    
    before(async () => {
        [owner, user1, user2, user3, user4, user5] = await ethers.getSigners();
    });

    it("Deploy the feeSharingERC20 contract, owner should have 1e10 tokens initially", async function () {
        ({ feeSharingERC20 } = await loadFixture(deployContracts));
        expect(await feeSharingERC20.balanceOf(owner.address)).to.equal(TOTAL_SUPPLY);

        busdPairAddress = await feeSharingERC20.busdPairAddress();

        busd = await ethers.getContractAt("ERC20", ADDRESS_BUSD);
        uniswapV2Router = await ethers.getContractAt("IUniswapV2Router02", ADDRESS_UNISWAP_ROUTER02);
        uniswapV2PairBusd = await ethers.getContractAt("IUniswapV2Pair", busdPairAddress);
    });

    it("Contract owner transfer 10000, 20000, 30000, 40000 tokens to user1, user2, user3, user4, respectively. The transfer from contract owner should not be taxed", async function () {
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

    it("Impersonate as Binance to give our contract some BUSD", async function () {
        

        await impersonateAccount(ADDRESS_BINANCE_WALLET); // from hardhet-network-helpers
        const BINANCE_WALLET = await ethers.getSigner(
            ADDRESS_BINANCE_WALLET
        );

        await busd.connect(BINANCE_WALLET).transfer(feeSharingERC20.address, CONTRACT_INITIAL_BUSD_AMOUNT);
        expect(await busd.balanceOf(feeSharingERC20.address)).to.equal(CONTRACT_INITIAL_BUSD_AMOUNT);
    });

    it("Contract owner adds liqudity into uniswap busd pair", async function () {
        await feeSharingERC20.connect(owner).transfer(feeSharingERC20.address, INITIAL_LIQUIDITY_IN_UNISWAP);

        await feeSharingERC20.addLiquidityForBUSDPair(INITIAL_LIQUIDITY_IN_UNISWAP);

        expect(await feeSharingERC20.balanceOf(owner.address)).to.equal(0);
        expect(await feeSharingERC20.balanceOf(busdPairAddress)).to.equal(INITIAL_LIQUIDITY_IN_UNISWAP);

    });

    it("User4 transfer 10000 tokens to user5, the tax should be 500 tokens and distributed to all holders", async function () {
        // Initial Balance:
        //  User1: 10000
        //  User1: 20000
        //  User1: 30000
        //  User1: 30000
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
        //   User4: 30000 - 10000 + (20000 / 100000) * 500 = 20100 tokens
        //   User5: 0 + 9500 + (9500 / 100000) * 500 = 9547.5 tokens

        expect(Math.abs(user1Balance - 10050)).to.be.lessThan(EPSILON);
        expect(Math.abs(user2Balance - 20100)).to.be.lessThan(EPSILON);
        expect(Math.abs(user3Balance - 30150)).to.be.lessThan(EPSILON);
        expect(Math.abs(user4Balance - 20100)).to.be.lessThan(EPSILON);
        expect(Math.abs(user5Balance - 9547.5)).to.be.lessThan(EPSILON);
    });
    
    it("User1 sells 1000 tokens for BUSD on Uniswap, the contract should transfer 50 tokens into UniswapV2Pair for adding liquidity", async function () {

        const USER1_SELL_TOKEN_AMOUNT = ethers.utils.parseUnits("1000", 18);
        
        let block = await ethers.provider.getBlock(16211371);
        let swapDeadline = block.timestamp + 600;

        let user1InitialToken = await feeSharingERC20.balanceOf(user1.address);
        let user1InitialBusd = await busd.balanceOf(user1.address);

        console.log("user1 initial token = " + user1InitialToken / 1e18);
        console.log("user1 initial busd = " + user1InitialBusd / 1e18);

        expect(user1InitialBusd).to.equal(0);

        // doing swap
        await feeSharingERC20.connect(user1).approve(uniswapV2Router.address, USER1_SELL_TOKEN_AMOUNT);
        await uniswapV2Router.connect(user1).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            USER1_SELL_TOKEN_AMOUNT,
            0,
            [feeSharingERC20.address, busd.address],
            user1.address,
            swapDeadline
        );

        // check new balance for token & busd
        let user1FinalToken = await feeSharingERC20.balanceOf(user1.address);
        let user1FinalBusd = await busd.balanceOf(user1.address);

        console.log("user1 token after swap = " + user1FinalToken / 1e18);
        console.log("user1 busd after swap = " + user1FinalBusd / 1e18);

        expect(user1FinalBusd).to.be.greaterThan(0);


        let tokenLiquidityInUniswapBusdPair = await feeSharingERC20.balanceOf(uniswapV2PairBusd.address) / 1e18;
        // Expected liquidity = initial liquidity (10000) + sold token amount (1000) + 5% sold token amount (50)
        const EXPECTED_LIQUIDITY = ethers.utils.parseUnits("11050", 18) / 1e18;

        console.log(tokenLiquidityInUniswapBusdPair);
        console.log(EXPECTED_LIQUIDITY);
        expect(Math.abs(tokenLiquidityInUniswapBusdPair - EXPECTED_LIQUIDITY)).to.be.lessThan(EPSILON);
    });

    // it("Deploy the feeSharingERC20 contract, owner should have 1e10 tokens initially", async function () {
        
    // });
    
    // it("Deploy the feeSharingERC20 contract, owner should have 1e10 tokens initially", async function () {
        
    // });


});
