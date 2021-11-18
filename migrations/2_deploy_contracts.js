const GFTToken = artifacts.require("GFTToken");

module.exports = function (deployer) {
  deployer.deploy(GFTToken, "GFT", "Gold Finger");
};