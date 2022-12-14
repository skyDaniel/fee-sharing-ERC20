const { LogLevel, Logger } = require('@ethersproject/logger');
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");

// Close warning: Duplicate definitions
Logger.setLogLevel(LogLevel.ERROR);

describe("", function () {
    let owner; // owner who deploys all contracts
    let user1, user2, user3;

    async function deployContracts() {
        return {
            
        };
    }

    before(async () => {
        [owner, user1, user2, user3] = await ethers.getSigners();
    });

    it("", async function () {
        const {
            
        } = await loadFixture(initializeTokenStatus);

    });

});
