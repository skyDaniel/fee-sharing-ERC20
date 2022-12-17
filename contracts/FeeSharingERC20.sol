// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol"; // nonReentrant

import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
// import '@uniswap/v2-core/contracts/interfaces/IUniswapV2ERC20.sol';

import './UniswapV2Library.sol';

contract FeeSharingERC20 is IERC20, Ownable, ReentrancyGuard {
    mapping(address => uint256) private _internalTokenBalances;   // the balance for reflection token (internal)

    mapping(address => mapping(address => uint256)) private _allowances;

    mapping(address => bool) private _isExcludedFromPayingFee;

    address private constant ADDRESS_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address private constant ADDRESS_BUSD = 0x4Fabb145d64652a948d72533023f6E7A623C7C53;

    IUniswapV2Router02 public uniswapV2Router02;
    IUniswapV2Factory public uniswapV2Factory;
    address public busdPairAddress;


    uint256 private constant MAX = type(uint).max;
    uint256 private _totalSupply = 1e5 * 1e18; // total supply: 100,000
    uint256 private _internalTokenTotalSupply = (MAX / _totalSupply) * _totalSupply;
    // let (_internalTokenTotalSupply % _totalSupply) == 0
    // --> (_internalTokenTotalSupply / _totalSupply): # of internal tokens that 1 of the ERC-20 token represent

    string private _name;
    string private _symbol;
    uint8 private _decimals = 18;

    // Transfer tax: 5% (the fee will be distributed to other holders immeditately when the transfer happens)
    //   5% = 1/20
    uint8 transferTaxNumerator = 1; 
    uint8 transferTaxDenominator = 20;
    // Uniswap sell tax: 10% 
    //   - 5% for adding liquidity into uniswap pool
    //     5% = 1 / 20
    //   - 5% will be distributed to the token stakers
    //     5% = 1 / 20
    uint8 sellTaxForAddingLiquidityNumerator = 1;
    uint8 sellTaxForAddingLiquidityDenominator = 20;
    uint8 sellTaxForStakerRewardNumerator = 1;
    uint8 sellTaxForStakerRewardDenominator = 20;

    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;

        _internalTokenBalances[owner()] = _internalTokenTotalSupply;
        _isExcludedFromPayingFee[owner()] = true;
        _isExcludedFromPayingFee[address(this)] = true;

        uniswapV2Router02 = IUniswapV2Router02(ADDRESS_ROUTER);
        uniswapV2Factory = IUniswapV2Factory(uniswapV2Router02.factory());
        busdPairAddress = uniswapV2Factory.createPair(address(this), ADDRESS_BUSD);

        emit Transfer(address(0), _msgSender(), _totalSupply);
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

    function balanceOf(address account) public view override returns (uint256) {
        uint256 internalTokenBalance = _internalTokenBalances[account];
        uint256 internalTokenAmountFor1ERC20 = _getInternalTokenExchangeRateForERC20Token();
        
        return internalTokenBalance / internalTokenAmountFor1ERC20;
    }

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function transfer(address to, uint256 amount) external returns (bool) {        
        _transfer(_msgSender(), to, amount);
        return true;
    }

    function allowance(address owner, address spender) public view returns (uint256) {
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

    function _approve(address owner, address spender, uint256 amount) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
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
        require(amount > 0, "Transfer amount must be greater than zero");

        uint256 internalTokenAmountFor1ERC20 = _getInternalTokenExchangeRateForERC20Token();
    
        uint256 transferTax;
        uint256 transferAmountAfterTax;
        uint256 sellTaxForAddingLiquidity;
    
        uint256 internalTokenTransferTax;
        uint256 internalTokenTransferAmountAfterTax;
        uint256 internalTokenSellTaxForAddingLiquidity;

        // Sell Token vs. Add Liquidity at Uniswap:
        //               |       Sell token       |       Add Liquidity      |
        // =====================================================================
        //    tx.origin  |   user (token owner)   |   This contract (ERC20)  |
        // ---------------------------------------------------------------------
        //   msg.sender  |     UniswapRouterV2    |      UniswapRouterV2     |
        // ---------------------------------------------------------------------
        //         from  |    user (token owner)  |   This contract (ERC20)  |
        // ---------------------------------------------------------------------
        //           to  |      UniswapV2Pair     |       UniswapV2Pair      |   
        // ---------------------------------------------------------------------

        if (_isExcludedFromPayingFee[from]) {
            transferTax = 0;
        }
        else {
        // else if (to != busdPairAddress) {
            transferTax = amount / transferTaxDenominator * transferTaxNumerator;
        }
        // else {
            // This situation is selling the token on uniswap
            // transferTax = 0;
            // sellTaxForAddingLiquidity = amount / sellTaxForAddingLiquidityDenominator * sellTaxForAddingLiquidityNumerator;

            // addLiquidityForBUSDPair(sellTaxForAddingLiquidity, 2 * sellTaxForAddingLiquidity);
            // amount -= sellTaxForAddingLiquidity;
        // }
        
        transferAmountAfterTax = amount - transferTax;

        internalTokenTransferTax = transferTax * internalTokenAmountFor1ERC20;
        internalTokenTransferAmountAfterTax = transferAmountAfterTax * internalTokenAmountFor1ERC20;

        _internalTokenBalances[from] -= (internalTokenTransferTax + internalTokenTransferAmountAfterTax);
        _internalTokenBalances[to] += internalTokenTransferAmountAfterTax;
        _internalTokenTotalSupply -= internalTokenTransferTax;

        emit Transfer(from, to, transferAmountAfterTax);
    }

    function addLiquidityForBUSDPair(uint tokenAmount, uint BUSDAmount) internal {
        (uint amountA, uint amountB, uint liquidity) = uniswapV2Router02.addLiquidity(
            ADDRESS_BUSD,
            address(this),
            BUSDAmount,
            tokenAmount,
            1,
            1,
            address(this),
            block.timestamp
        );
    }
}


