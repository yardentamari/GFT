// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GFTTokenVesting is Ownable {
  using SafeERC20 for IERC20;

  event Released(address beneficiary, uint256 amount);

  IERC20 public token;
  uint256 public cliff;
  uint256 public start;
  uint256 public duration;
  uint256 public period;
  uint256 public percent;

  mapping (address => uint256) public shares;
  mapping (address => uint256) public lastReleaseDate;
  mapping (address => uint256) public releasedAmount;

  uint256 released = 0;
  uint256 BP = 10000;

  address[] public beneficiaries;

  modifier onlyBeneficiaries {
    require(msg.sender == owner() || shares[msg.sender] > 0, "You cannot release tokens!");
    _;
  }

  constructor(
    IERC20 _token,
    uint256 _start,
    uint256 _cliff,
    uint256 _duration,
    uint256 _period,
    uint256 _percent
  ) {
    require(_cliff <= _duration, "Cliff has to be lower or equal to duration");
    token = _token;
    duration = _duration;
    cliff = _start + _cliff;
    start = _start;
    period = _period;
    percent = _percent;
  }

  function addBeneficiaryes(address[] memory _beneficiaryes, uint256[] memory _sharesAmounts) onlyOwner public {
    require(_beneficiaryes.length == _sharesAmounts.length);
    
    for (uint i = 0; i <_beneficiaryes.length; i++) {
      addBeneficiary(_beneficiaryes[i], _sharesAmounts[i]);
    }

    require(totalShares() == 10000, "Invalid shares amount");
  }

  function addBeneficiary(address _beneficiary, uint256 _sharesAmount) onlyOwner public {
    require(block.timestamp < cliff);
    require(_beneficiary != address(0), "The beneficiary's address cannot be 0");
    require(_sharesAmount > 0, "Shares amount has to be greater than 0");

    if (shares[_beneficiary] == 0) {
      beneficiaries.push(_beneficiary);
    }

    lastReleaseDate[_beneficiary] = cliff;
    shares[_beneficiary] = shares[_beneficiary] + _sharesAmount;
  }

  function claimTokens() onlyBeneficiaries public {
    uint256 currentBalance = token.balanceOf(address(this));
    uint256 totalBalance = currentBalance + released;

    require(releasedAmount[msg.sender] < calculateShares(totalBalance, msg.sender), "User already released all available tokens");

    uint256 unreleased = releasableAmount();

    if (unreleased > 0) {
      uint256 userShare = calculateShares(unreleased, msg.sender);
      released += userShare;
      release(msg.sender, userShare);
      lastReleaseDate[msg.sender] = block.timestamp;
    }
  }

  function userReleasableAmount() public view returns (uint256) {
    return calculateShares(releasableAmount(), msg.sender) - releasedAmount[msg.sender];
  }

  function releasableAmount() public view returns (uint256) {
    return vestedAmount();
  }

  function calculateShares(uint256 _amount, address _beneficiary) public view returns (uint256) {
    return _amount * shares[_beneficiary] / 10000;
  }

  function totalShares() public view returns (uint256 sum) {
    for (uint i = 0; i < beneficiaries.length; i++) {
      sum += shares[beneficiaries[i]];
    }
  }
  
  function vestedAmount() public view returns (uint256) {
    uint256 currentBalance = token.balanceOf(address(this));
    uint256 totalBalance = currentBalance + released;

    if (block.timestamp < cliff) {
      return 0;
    } else if (block.timestamp >= start + duration) {
      return totalBalance;
    } else {
      if(block.timestamp < lastReleaseDate[msg.sender]) return 0;
      uint256 periodsPassed = (block.timestamp - lastReleaseDate[msg.sender]) / period;
      if (periodsPassed > 0) {
        return totalBalance * (periodsPassed * percent) / BP;
      } else {
        return 0;
      }
    }
  }

  function release(address _beneficiary, uint256 _amount) private {
    token.safeTransfer(_beneficiary, _amount);
    releasedAmount[_beneficiary] += _amount;
    emit Released(_beneficiary, _amount);
  }
}