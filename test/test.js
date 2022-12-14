const { LogLevel, Logger } = require('@ethersproject/logger');
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");

// Close warning: Duplicate definitions
Logger.setLogLevel(LogLevel.ERROR);

describe("CERC20 - Should be able to borrow/repay", function () {
    let owner; // owner who deploys all contracts
    let user1, user2, user3;

    async function deployContracts() {
        return {
            comptroller,
            priceOracle,
            erc20TokenA,
            erc20TokenB,
            interestRateModel,
            cErc20TokenA,
            cErc20TokenB
        };
    }

    before(async () => {
        [owner, user1, user2, user3] = await ethers.getSigners();
    });

    it("User1: Borrow 50 tokenA using 1 tokenB as the collateral, and then repay 50 tokenA to the pool", async function () {
        const {
            comptroller, 
            priceOracle, 
            erc20TokenA, 
            erc20TokenB, 
            interestRateModel, 
            cErc20TokenA, 
            cErc20TokenB 
        } = await loadFixture(initializeTokenStatus);

    });

});
