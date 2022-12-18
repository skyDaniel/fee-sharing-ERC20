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
    let user1, user2, user3, user4, user5, user6, user7;

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
        [owner, user1, user2, user3, user4, user5, user6, user7] = await ethers.getSigners();
    });

    it("[Test1] Deploy the feeSharingERC20 contract, owner should have 1e10 tokens initially", async function () {
        ({ feeSharingERC20 } = await loadFixture(deployContracts));
        expect(await feeSharingERC20.balanceOf(owner.address)).to.equal(TOTAL_SUPPLY);

        busdPairAddress = await feeSharingERC20.busdPairAddress();

        busd = await ethers.getContractAt("ERC20", ADDRESS_BUSD);
        uniswapV2Router = await ethers.getContractAt("IUniswapV2Router02", ADDRESS_UNISWAP_ROUTER02);
        uniswapV2PairBusd = await ethers.getContractAt("IUniswapV2Pair", busdPairAddress);
    });

    it("[Test2] Contract owner transfer 10000, 20000, 30000, 40000 tokens to user1, user2, user3, user4, respectively. The transfer from contract owner should not be taxed", async function () {
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

    it("[Test3] Impersonate as Binance to give our contract some BUSD", async function () {
        await impersonateAccount(ADDRESS_BINANCE_WALLET); // from hardhet-network-helpers
        const BINANCE_WALLET = await ethers.getSigner(
            ADDRESS_BINANCE_WALLET
        );

        await busd.connect(BINANCE_WALLET).transfer(feeSharingERC20.address, CONTRACT_INITIAL_BUSD_AMOUNT);
        expect(await busd.balanceOf(feeSharingERC20.address)).to.equal(CONTRACT_INITIAL_BUSD_AMOUNT);
    });

    it("[Test4] Contract owner adds liqudity into uniswap busd pair", async function () {
        await feeSharingERC20.connect(owner).transfer(feeSharingERC20.address, INITIAL_LIQUIDITY_IN_UNISWAP);
        await feeSharingERC20.connect(owner).addLiquidityForBUSDPair(INITIAL_LIQUIDITY_IN_UNISWAP);

        expect(await feeSharingERC20.balanceOf(owner.address)).to.equal(0);
        expect(await feeSharingERC20.balanceOf(busdPairAddress)).to.equal(INITIAL_LIQUIDITY_IN_UNISWAP);

    });

    it("[Test5] User4 transfer 10000 tokens to user5, the tax should be 500 tokens and distributed to all holders", async function () {
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
    
    it("[Test6] User1 sells 1000 tokens for BUSD on Uniswap, the contract should transfer 50 tokens into UniswapV2Pair for adding liquidity", async function () {
        console.log("[Test6] begins");

        let user1InitialTokenBalance = await feeSharingERC20.balanceOf(user1.address) / 1e18;
        let user1InitialBusdBalance = await busd.balanceOf(user1.address) / 1e18;
        let initialTokenLiquidityInUniswapBusdPair = await feeSharingERC20.balanceOf(uniswapV2PairBusd.address) / 1e18;

        console.log("user1 initial token = " + user1InitialTokenBalance);
        console.log("user1 initial busd = " + user1InitialBusdBalance);
        console.log("token initial liquidity in uniswap = " + initialTokenLiquidityInUniswapBusdPair);

        expect(user1InitialBusdBalance).to.equal(0);

        // doing swap
        const USER1_SELL_TOKEN_AMOUNT = ethers.utils.parseUnits("1000", 18);
        const block = await ethers.provider.getBlock();
        const swapDeadline = block.timestamp + 600;

        await feeSharingERC20.connect(user1).approve(uniswapV2Router.address, USER1_SELL_TOKEN_AMOUNT);
        await uniswapV2Router.connect(user1).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            USER1_SELL_TOKEN_AMOUNT,
            0,
            [feeSharingERC20.address, busd.address],
            user1.address,
            swapDeadline
        );

        // check new balance for token & busd
        let user1FinalTokenBalance = await feeSharingERC20.balanceOf(user1.address) / 1e18;
        let user1FinalBusdBalance = await busd.balanceOf(user1.address) / 1e18;
        let finalTokenLiquidityInUniswapBusdPair = await feeSharingERC20.balanceOf(uniswapV2PairBusd.address) / 1e18;

        console.log("user1 token after swap = " + user1FinalTokenBalance);
        console.log("user1 busd after swap = " + user1FinalBusdBalance);
        console.log("token liquidity in uniswap after swap = " + finalTokenLiquidityInUniswapBusdPair);

        expect(user1FinalBusdBalance).to.be.greaterThan(0);

        // Expected liquidity increment = 1000
        //    (100% - 5%) = 95% intended sold token amount (950) + 
        //    5% (used for adding liquidity) intended sold token amount (50)
        // Note: No staker now, so won't charge 5% staker reward fee now
        const EXPECTED_LIQUIDITY_INCREMENT = ethers.utils.parseUnits("1000", 18) / 1e18;
        let liquidityIncrement = finalTokenLiquidityInUniswapBusdPair - initialTokenLiquidityInUniswapBusdPair;
        
        expect(Math.abs(liquidityIncrement - EXPECTED_LIQUIDITY_INCREMENT)).to.be.lessThan(EPSILON);
    });

    it("[Test7] User is able to stake tokens, and be able to redeem the token only after the staking period ends", async function () {
        // Stake for 30 days
        await feeSharingERC20.connect(user1).stakeFor30Days();

        await expect(feeSharingERC20.connect(user1).transfer(user2.address, ethers.utils.parseUnits("50", 18))).to.be.revertedWith(
            "Sender is staking token",
        );
        await expect(feeSharingERC20.connect(user1).redeemStakedTokensAndRewards()).to.be.revertedWith(
            "Your stake period hasn't ended",
        );

        await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // 30 days
        await feeSharingERC20.connect(user1).redeemStakedTokensAndRewards();
        await feeSharingERC20.connect(user1).transfer(user2.address, ethers.utils.parseUnits("50", 18));
        
        // Stake for 180 days
        await feeSharingERC20.connect(user1).stakeFor180Days();

        await expect(feeSharingERC20.connect(user1).transfer(user2.address, ethers.utils.parseUnits("50", 18))).to.be.revertedWith(
            "Sender is staking token",
        );
        await expect(feeSharingERC20.connect(user1).redeemStakedTokensAndRewards()).to.be.revertedWith(
            "Your stake period hasn't ended",
        );

        await ethers.provider.send("evm_increaseTime", [180 * 24 * 60 * 60]); // 30 days
        await feeSharingERC20.connect(user1).redeemStakedTokensAndRewards();
        await feeSharingERC20.connect(user1).transfer(user2.address, ethers.utils.parseUnits("50", 18));

    });
    
    it("[Test8] User6 stakes for 30 days, while User7 stakes for 180 days, user4 should got 3x staking rewards than user2", async function () {
        console.log("[Test8] begins");

        // Ask user3 to give up all of his tokens to contract owner, 
        //   and then contract owner gives user6 & user7 10000 tokens, respectively
        await feeSharingERC20.connect(user3).transfer(owner.address, ethers.utils.parseUnits("30000", 18));
        await feeSharingERC20.connect(owner).transfer(user6.address, ethers.utils.parseUnits("10000", 18));
        await feeSharingERC20.connect(owner).transfer(user7.address, ethers.utils.parseUnits("10000", 18));
        
        let user6InitialBalance = await feeSharingERC20.balanceOf(user6.address) / 1e18;
        let user7InitialBalance = await feeSharingERC20.balanceOf(user7.address) / 1e18;
        
        console.log("user6 initial balance = " + user6InitialBalance);
        console.log("user7 initial balance = " + user7InitialBalance);


        await feeSharingERC20.connect(user6).stakeFor30Days();
        await feeSharingERC20.connect(user7).stakeFor180Days();

        // User2 sells 20000 tokens on uniswap for BUSD
        let user2InitialTokenBalance = await feeSharingERC20.balanceOf(user2.address) / 1e18;
        let user2InitialBusdBalance = await busd.balanceOf(user2.address) / 1e18;
        let initialTokenLiquidityInUniswapBusdPair = await feeSharingERC20.balanceOf(uniswapV2PairBusd.address) / 1e18;

        console.log("user2 initial token = " + user2InitialTokenBalance);
        console.log("user2 initial busd = " + user2InitialBusdBalance);
        console.log("token initial liquidity in uniswap = " + initialTokenLiquidityInUniswapBusdPair);
        expect(user2InitialBusdBalance).to.equal(0);

        const USER2_SELL_TOKEN_AMOUNT = ethers.utils.parseUnits("20000", 18);
        const block = await ethers.provider.getBlock();
        const swapDeadline = block.timestamp + 600;

        await feeSharingERC20.connect(user2).approve(uniswapV2Router.address, USER2_SELL_TOKEN_AMOUNT);
        await uniswapV2Router.connect(user2).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            USER2_SELL_TOKEN_AMOUNT,
            0,
            [feeSharingERC20.address, busd.address],
            user2.address,
            swapDeadline
        );

        // User2: check new balance for token & busd
        let user2FinalTokenBalance = await feeSharingERC20.balanceOf(user2.address) / 1e18;
        let user2FinalBusdBalance = await busd.balanceOf(user2.address) / 1e18;
        let finalTokenLiquidityInUniswapBusdPair = await feeSharingERC20.balanceOf(uniswapV2PairBusd.address) / 1e18;

        console.log("user2 token after swap = " + user2FinalTokenBalance);
        console.log("user2 busd after swap = " + user2FinalBusdBalance);
        console.log("token liquidity in uniswap after swap = " + finalTokenLiquidityInUniswapBusdPair);

        expect(user2FinalBusdBalance).to.be.greaterThan(0);

        // Check the liquidity change for uniswap pool
        // Expected liquidity increment = 19000 =
        //    (100% - 5% - 5%) = 90% intended sold token amount (18000) + 
        //    5% (used for adding liquidity) intended sold token amount (1000)
        // Note: Since there are stakers, so will charge 5% staker reward fee now
        const EXPECTED_LIQUIDITY_INCREMENT = ethers.utils.parseUnits("19000", 18) / 1e18;
        let liquidityIncrement = finalTokenLiquidityInUniswapBusdPair - initialTokenLiquidityInUniswapBusdPair;
        expect(Math.abs(liquidityIncrement - EXPECTED_LIQUIDITY_INCREMENT)).to.be.lessThan(EPSILON);

        // User6 & User7: Redeem the staked token & rewards
        await ethers.provider.send("evm_increaseTime", [180 * 24 * 60 * 60]); // 180 days
        await feeSharingERC20.connect(user6).redeemStakedTokensAndRewards();
        await feeSharingERC20.connect(user7).redeemStakedTokensAndRewards();

        let user6FinalBalance = await feeSharingERC20.balanceOf(user6.address) / 1e18;
        let user7FinalBalance = await feeSharingERC20.balanceOf(user7.address) / 1e18;
        
        console.log("user6 final balance = " + user6FinalBalance);
        console.log("user7 final balance = " + user7FinalBalance);
    
        let user6BalanceIncrement = user6FinalBalance - user6InitialBalance;
        let user7BalanceIncrement = user7FinalBalance - user7InitialBalance;

        expect(Math.abs(user7BalanceIncrement - 3 * user6BalanceIncrement)).to.be.lessThan(EPSILON);
    });
});
