const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
const { increaseTime } = require("./time-travel");

const now = async () => {
  const bn = await web3.eth.getBlockNumber()
  const { timestamp } = await web3.eth.getBlock(bn)
  return timestamp;
};

const day = 24 * 60 * 60;

chai.use(chaiAsPromised);

const { expect } = chai;

const GFTTokenVesting = artifacts.require("GFTTokenVesting");
const GFTToken = artifacts.require("GFTToken");

let beneficiary1, beneficiary2, beneficiary3;

const beneficiary1shareAmount = 3000;
const beneficiary2shareAmount = 3000;
const beneficiary3shareAmount = 4000;

const BP = 10000;

contract("GFTTokenVesting", (accounts) => {
  const [owner, other] = accounts;

  let token;
  let tokenVesting;
  let vestingSettings;
  let tokenSettings;

  async function balanceOf(address) {
    return Number(web3.utils.fromWei(await token.balanceOf(address), 'ether'))
  }

  beforeEach(async () => {
    let accounts = await web3.eth.getAccounts();

    beneficiary1 = accounts[0];
    beneficiary2 = accounts[1];
    beneficiary3 = accounts[2];

    vestingSettings = {
      start: String(await now()),
      cliff: 30 * day,
      duration: 90 * day,
      period: 1 * day,
      percent: 300 // 3% (because of 10000 bp)
    };

    tokenSettings = {
      name: "Gold Finger",
      symbol: "GFT",
      decimals: 18,
      totalSupply: web3.utils.toWei('1000000', 'ether'),
    };

    await GFTToken.new(
      tokenSettings.name,
      tokenSettings.symbol
    ).then((instance) => {
      token = instance;
    });

    await GFTTokenVesting.new(
      token.address,
      vestingSettings.start,
      vestingSettings.cliff,
      vestingSettings.duration,
      vestingSettings.period,
      vestingSettings.percent,
    ).then((instance) => {
      tokenVesting = instance;
    });
  
    await token.mint(tokenVesting.address, tokenSettings.totalSupply);

  });

  describe("Ownable implementation", () => {
    it("sets owner on deploy", async () => {
      expect(await tokenVesting.owner()).to.equal(owner);
    });
  });

  describe("releasing tokens", () => {
    beforeEach(async () => {
      await tokenVesting.addBeneficiaryes(
        [owner, beneficiary2, beneficiary3], 
        [beneficiary1shareAmount, beneficiary2shareAmount, beneficiary3shareAmount]
      );
    });

    it("allows a beneficiary to release tokens", async () => {
      expect(tokenVesting.claimTokens).not.to.throw();
    });

    it("disallows others to release tokens", async () => {
      tokenVesting.claimTokens({ from: accounts[4] }).then(assert.fail).catch((error) => {
        if (error.toString().indexOf("transaction: revert") === -1) {
          assert(false, error.toString());
        }
      });
    });
  });

  describe("releasing tokens in time", () => {
    beforeEach(async () => {
      await tokenVesting.addBeneficiaryes(
        [owner, beneficiary2, beneficiary3], 
        [beneficiary1shareAmount, beneficiary2shareAmount, beneficiary3shareAmount]
      );
    });

    it("doesn't release tokens before cliff", async () => {    
      const cliff = 30 * day;
      await increaseTime(cliff);
      await tokenVesting.claimTokens({ from: owner });
      expect((await balanceOf(owner))).to.equal(0);

      const periods = 1;
      await increaseTime(periods * day);
      await tokenVesting.claimTokens({ from: owner });

      const expectedPercentForAllBeneficiariesAfterOnePeriod = 30000;
      const expectedBeneficiaryPercent = expectedPercentForAllBeneficiariesAfterOnePeriod * periods * beneficiary1shareAmount / BP;

      expect((await balanceOf(owner))).to.equal(expectedBeneficiaryPercent);
    });

    it("releases tokens after cliff", async () => {     
      const cliff = 30 * day;
      const periods = 5;
      await increaseTime(cliff + periods * day);
      await tokenVesting.claimTokens({ from: owner });

      const expectedPercentForAllBeneficiariesAfterOnePeriod = 30000;
      const expectedBeneficiaryPercent = expectedPercentForAllBeneficiariesAfterOnePeriod * periods * beneficiary1shareAmount / BP;

      expect((await balanceOf(owner))).to.equal(expectedBeneficiaryPercent);
    });

    it("releases all tokens after at the end", async () => {
      increaseTime(90 * day);
      await tokenVesting.claimTokens();
      
      const expectedPercentForAllBeneficiariesAfterTheEnd = 1000000;
      const expectedBeneficiaryPercent = expectedPercentForAllBeneficiariesAfterTheEnd * beneficiary1shareAmount / BP;
      
      expect((await balanceOf(owner))).to.equal(expectedBeneficiaryPercent);
      
      increaseTime(300 * day);

      tokenVesting.claimTokens().then(assert.fail).catch((error) => {
        if (error.toString().indexOf("transaction: revert") === -1) {
          assert(false, error.toString());
        }
      });

      expect((await balanceOf(owner))).to.equal(expectedBeneficiaryPercent);
    });


    it("releases tokens progressively", async () => {
      const cliff = 30 * day;
      await increaseTime(cliff);
      await tokenVesting.claimTokens({ from: owner });
      expect((await balanceOf(owner))).to.equal(0);

      const periods = 1;

      await increaseTime(periods * day);
      await tokenVesting.claimTokens({ from: owner });

      let expectedPercentForAllBeneficiariesAfterOnePeriod = 30000;

      let expectedBeneficiaryPercent = expectedPercentForAllBeneficiariesAfterOnePeriod * periods * beneficiary1shareAmount / BP;
      expect((await balanceOf(owner))).to.equal(expectedBeneficiaryPercent);

      await increaseTime(periods * day);
      await tokenVesting.claimTokens({ from: owner });
      
      expectedBeneficiaryPercent = expectedPercentForAllBeneficiariesAfterOnePeriod * (periods * 2) * beneficiary1shareAmount / BP;
      expect((await balanceOf(owner))).to.equal(expectedBeneficiaryPercent);

     
    });
  });

  describe("releasing tokens between beneficiaries", () => {

    beforeEach(async () => {
      await tokenVesting.addBeneficiaryes(
        [beneficiary1, beneficiary2, beneficiary3], 
        [beneficiary1shareAmount, beneficiary2shareAmount, beneficiary3shareAmount]
      );
    });

    it("releases tokens having regard shares ratio", async () => {
      
      const cliff = 30 * day;
      const periods = 5;

      await increaseTime(cliff + periods * day);
      await tokenVesting.claimTokens({ from: beneficiary1 });
      await tokenVesting.claimTokens({ from: beneficiary2 });
      await tokenVesting.claimTokens({ from: beneficiary3 });

      const expectedPercentForAllBeneficiariesAfterOnePeriod = 30000;
      const expectedBeneficiaryPercent = expectedPercentForAllBeneficiariesAfterOnePeriod * periods * beneficiary1shareAmount / BP;
      const expectedBeneficiary2Percent = expectedPercentForAllBeneficiariesAfterOnePeriod * periods * beneficiary2shareAmount / BP;
      const expectedBeneficiary3Percent = expectedPercentForAllBeneficiariesAfterOnePeriod * periods * beneficiary3shareAmount / BP;

      expect((await balanceOf(beneficiary1))).to.equal(expectedBeneficiaryPercent);
      expect((await balanceOf(beneficiary2))).to.equal(expectedBeneficiary2Percent);
      expect((await balanceOf(beneficiary3))).to.equal(expectedBeneficiary3Percent);

    });

    it("releases tokens having regard shares ratio progressively", async () => {
      
      const cliff = 30 * day;
      const periods = 1;

      await increaseTime(cliff + periods * day);
      await tokenVesting.claimTokens({ from: beneficiary1 });
      await tokenVesting.claimTokens({ from: beneficiary2 });
      await tokenVesting.claimTokens({ from: beneficiary3 });

      const expectedPercentForAllBeneficiariesAfterOnePeriod = 30000;

      let expectedBeneficiaryPercent = expectedPercentForAllBeneficiariesAfterOnePeriod * periods * beneficiary1shareAmount / BP;
      let expectedBeneficiary2Percent = expectedPercentForAllBeneficiariesAfterOnePeriod * periods * beneficiary2shareAmount / BP;
      let expectedBeneficiary3Percent = expectedPercentForAllBeneficiariesAfterOnePeriod * periods * beneficiary3shareAmount / BP;

      expect((await balanceOf(beneficiary1))).to.equal(expectedBeneficiaryPercent);
      expect((await balanceOf(beneficiary2))).to.equal(expectedBeneficiary2Percent);
      expect((await balanceOf(beneficiary3))).to.equal(expectedBeneficiary3Percent);

      await increaseTime(periods * day);

      await tokenVesting.claimTokens({ from: beneficiary1 });
      await tokenVesting.claimTokens({ from: beneficiary2 });
      await tokenVesting.claimTokens({ from: beneficiary3 });

      expectedBeneficiaryPercent = expectedPercentForAllBeneficiariesAfterOnePeriod * (periods * 2) * beneficiary1shareAmount / BP;
      expectedBeneficiary2Percent = expectedPercentForAllBeneficiariesAfterOnePeriod * (periods * 2) * beneficiary2shareAmount / BP;
      expectedBeneficiary3Percent = expectedPercentForAllBeneficiariesAfterOnePeriod * (periods * 2) * beneficiary3shareAmount / BP;

      expect((await balanceOf(beneficiary1))).to.equal(expectedBeneficiaryPercent);
      expect((await balanceOf(beneficiary2))).to.equal(expectedBeneficiary2Percent);
      expect((await balanceOf(beneficiary3))).to.equal(expectedBeneficiary3Percent);

      await increaseTime(periods * day);

      await tokenVesting.claimTokens({ from: beneficiary1 });
      await tokenVesting.claimTokens({ from: beneficiary2 });
      await tokenVesting.claimTokens({ from: beneficiary3 });

      expectedBeneficiaryPercent = expectedPercentForAllBeneficiariesAfterOnePeriod * (periods * 3) * beneficiary1shareAmount / BP;
      expectedBeneficiary2Percent = expectedPercentForAllBeneficiariesAfterOnePeriod * (periods * 3) * beneficiary2shareAmount / BP;
      expectedBeneficiary3Percent = expectedPercentForAllBeneficiariesAfterOnePeriod * (periods * 3) * beneficiary3shareAmount / BP;

      expect((await balanceOf(beneficiary1))).to.equal(expectedBeneficiaryPercent);
      expect((await balanceOf(beneficiary2))).to.equal(expectedBeneficiary2Percent);
      expect((await balanceOf(beneficiary3))).to.equal(expectedBeneficiary3Percent);

    });

    it("releases all tokens after at the end to all beneficiaries", async () => {
      increaseTime(90 * day);
      
      await tokenVesting.claimTokens({ from: beneficiary1 });
      await tokenVesting.claimTokens({ from: beneficiary2 });
      await tokenVesting.claimTokens({ from: beneficiary3 });
      
      const expectedPercentForAllBeneficiariesAfterTheEnd = 1000000;
      
      let expectedBeneficiaryPercent = expectedPercentForAllBeneficiariesAfterTheEnd * beneficiary1shareAmount / BP;
      let expectedBeneficiary2Percent = expectedPercentForAllBeneficiariesAfterTheEnd * beneficiary2shareAmount / BP;
      let expectedBeneficiary3Percent = expectedPercentForAllBeneficiariesAfterTheEnd * beneficiary3shareAmount / BP;
      
      expect((await balanceOf(beneficiary1))).to.equal(expectedBeneficiaryPercent);
      expect((await balanceOf(beneficiary2))).to.equal(expectedBeneficiary2Percent);
      expect((await balanceOf(beneficiary3))).to.equal(expectedBeneficiary3Percent);
      
      increaseTime(300 * day);

      tokenVesting.claimTokens({ from: beneficiary1 }).then(assert.fail).catch((error) => {
        if (error.toString().indexOf("transaction: revert") === -1) {
          assert(false, error.toString());
        }
      });

      tokenVesting.claimTokens({ from: beneficiary2 }).then(assert.fail).catch((error) => {
        if (error.toString().indexOf("transaction: revert") === -1) {
          assert(false, error.toString());
        }
      });

      tokenVesting.claimTokens({ from: beneficiary3 }).then(assert.fail).catch((error) => {
        if (error.toString().indexOf("transaction: revert") === -1) {
          assert(false, error.toString());
        }
      });

      expect((await balanceOf(beneficiary1))).to.equal(expectedBeneficiaryPercent);
      expect((await balanceOf(beneficiary2))).to.equal(expectedBeneficiary2Percent);
      expect((await balanceOf(beneficiary3))).to.equal(expectedBeneficiary3Percent);

    });
  });
});