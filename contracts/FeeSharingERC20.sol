// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; // nonReentrant


contract FeeSharingERC20 is IERC20, Ownable, ReentrancyGuard {
    mapping(address => uint256) private _internalTokenBalances;   // the balance for reflection token (internal)

    mapping(address => mapping(address => uint256)) private _allowances;

    mapping (address => bool) private _isExcludedFromPayingFee;

    uint256 private constant MAX = type(uint).max;
    uint256 private _totalSupply = 1e10 * 1e18;
    uint256 private _internalTokenTotalSupply = (MAX / _totalSupply) * _totalSupply;
    // let (_internalTokenTotalSupply % _totalSupply) == 0
    // --> (_internalTokenTotalSupply / _totalSupply): # of internal tokens that 1 of the ERC-20 token represent

    string private _name;
    string private _symbol;
    uint8 private _decimals = 18;

    // Transfer tax: 5% (the fee will be distributed to other holders immeditately when the transfer happens)
    uint8 transferTaxNumerator = 5;
    uint8 transferTaxDenominator = 100;
    // Uniswap sell tax: 10% 
    //   - 5% for adding liquidity into uniswap pool
    //   - 5% will be distributed to the token stakers
    uint8 sellTaxForAddingLiquidityNumerator = 5;
    uint8 sellTaxForAddingLiquidityDenominator = 100;
    uint8 sellTaxForStakerRewardNumerator = 5;
    uint8 sellTaxForStakerRewardDenominator = 100;

    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;

        _internalTokenBalances[owner()] = _internalTokenTotalSupply;
        _isExcludedFromPayingFee[owner()] = true;
        _isExcludedFromPayingFee[address(this)] = true;
    }

    // return # of internal tokens that 1 of the ERC-20 token represent
    function _getInternalTokenExchangeRateForERC20Token() private view returns(uint256) {
        return _internalTokenTotalSupply / _totalSupply;
    }

    function name() public view returns (string memory) {
        return _name;
    }

    function symbol() public view returns (string memory) {
        return _symbol;
    }

    function decimals() public view returns (uint8) {
        return _decimals;
    }

    function balanceOf(address account) external view override returns (uint256) {
        uint256 internalTokenBalance = _internalTokenBalances[account];
        uint256 internalTokenAmountFor1ERC20 = _getInternalTokenExchangeRateForERC20Token();
        
        return internalTokenBalance / internalTokenAmountFor1ERC20;
    }

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function transfer(address to, uint256 amount) external returns (bool) {        
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        _spendAllowance(from, _msgSender(), amount);
        _transfer(from, to, amount);
        return true;
    }

    function _spendAllowance(address owner, address spender, uint256 amount) internal virtual {
        uint256 currentAllowance = allowance(owner, spender);
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "ERC20: insufficient allowance");
            unchecked {
                _approve(owner, spender, currentAllowance - amount);
            }
        }
    }

    function _transfer(address from, address to, uint256 amount) internal virtual {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");

        require(balanceOf(from) >= amount, "ERC20: transfer amount exceeds balance");

        uint256 internalTokenAmountFor1ERC20 = _getInternalTokenExchangeRateForERC20Token();


        uint256 fromBalance = _balances[from];
        require(fromBalance >= amount, "");
        unchecked {
            _balances[from] = fromBalance - amount;
            // Overflow not possible: the sum of all balances is capped by totalSupply, and the sum is preserved by
            // decrementing then incrementing.
            _balances[to] += amount;
        }

        emit Transfer(from, to, amount);

        _afterTokenTransfer(from, to, amount);
    }



}


