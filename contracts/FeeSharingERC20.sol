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

    mapping(address => bool) public isStakedFor30Days;
    mapping(address => bool) public isStakedFor180Days;
    mapping(address => uint256) public stakeUnlockedTimestamp;

    address private constant ADDRESS_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address private constant ADDRESS_BUSD = 0x4Fabb145d64652a948d72533023f6E7A623C7C53;

    IERC20 public busd;
    IUniswapV2Router02 public uniswapV2Router02;
    IUniswapV2Factory public uniswapV2Factory;
    address public busdPairAddress;

    uint256 private constant MAX = type(uint).max;
    uint256 private _totalSupply = 1e5 * 1e18; // total supply: 100,000
    uint256 private _internalTokenTotalSupply = (MAX / _totalSupply) * _totalSupply;
    // let (_internalTokenTotalSupply % _totalSupply) == 0
    // --> (_internalTokenTotalSupply / _totalSupply): # of internal tokens that 1 of the ERC-20 token represent

    uint256 private _internalTokenTotalStakedAmountFor30Days = 0;
    uint256 private _internalTokenTotalStakedAmountFor180Days = 0;
    uint256 private _internalTokenAccumulatedStakeRewardFor30Days = 0;
    uint256 private _internalTokenAccumulatedStakeRewardFor180Days = 0;

    string private _name;
    string private _symbol;
    uint8 private _decimals = 18;

    // Transfer tax: 5% (the fee will be distributed to other holders immeditately when the transfer happens)
    //   (5% = 1 / 20)
    uint8 transferTaxNumerator = 1; 
    uint8 transferTaxDenominator = 20;
    
    // Uniswap sell tax: 10% 
    //   - 5% for adding liquidity into uniswap pool
    //     (5% = 1 / 20)
    //   - 5% will be distributed to the token stakers
    //     (5% = 1 / 20)
    uint8 sellTaxForAddingLiquidityNumerator = 1;
    uint8 sellTaxForAddingLiquidityDenominator = 20;
    uint8 sellTaxForStakerRewardNumerator = 1;
    uint8 sellTaxForStakerRewardDenominator = 20;

    // If you stake for 180 days, you will get 3x stake reward than staking for 30 days
    uint8 stakeRewardMultiplierFor30Days = 1;
    uint8 stakeRewardMultiplierFor180Days = 3;

    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;

        _internalTokenBalances[owner()] = _internalTokenTotalSupply;
        _isExcludedFromPayingFee[owner()] = true;
        _isExcludedFromPayingFee[address(this)] = true;


        busd = IERC20(ADDRESS_BUSD);
        uniswapV2Router02 = IUniswapV2Router02(ADDRESS_ROUTER);
        uniswapV2Factory = IUniswapV2Factory(uniswapV2Router02.factory());
        busdPairAddress = uniswapV2Factory.createPair(address(this), ADDRESS_BUSD);



        emit Transfer(address(0), _msgSender(), _totalSupply);
    }

    // return # of internal tokens that 1 of the ERC-20 token represent
    function _getInternalTokenExchangeRateForERC20Token() private view returns (uint256) {
        return _internalTokenTotalSupply / _totalSupply;
    }

    function convertInternalTokenAmountToRealTokenAmount(uint256 internalTokenAmount) private view returns(uint256) {
        uint256 internalTokenAmountFor1ERC20 = _getInternalTokenExchangeRateForERC20Token();
        return internalTokenAmount / internalTokenAmountFor1ERC20;
    }

    function convertRealTokenAmountToInternalTokenAmount(uint256 realTokenAmount) private view returns(uint256) {
        uint256 internalTokenAmountFor1ERC20 = _getInternalTokenExchangeRateForERC20Token();
        return realTokenAmount * internalTokenAmountFor1ERC20;
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
        return convertInternalTokenAmountToRealTokenAmount(internalTokenBalance);
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

        require(!isStaked(from), "Sender is staking token");
        require(!isStaked(to), "Recipient is staking token");
    
        uint256 transferTax;
        uint256 transferAmountAfterTax;
        
        uint256 sellTaxForAddingLiquidity;
        uint256 sellTaxForRewardingStakers;
    
        uint256 internalTokenTransferTax;
        uint256 internalTokenTransferAmountAfterTax;
        uint256 internalTokenSellTaxForAddingLiquidity;
        uint256 internalTokenSellTaxForRewardingStakers;

        // Sell Token vs. Add Liquidity at Uniswap:
        //               |       Sell token       |       Add Liquidity      |
        // =====================================================================
        //   msg.sender  |     UniswapRouterV2    |      UniswapRouterV2     |
        // ---------------------------------------------------------------------
        //         from  |    user (token owner)  |   This contract (ERC20)  |
        // ---------------------------------------------------------------------
        //           to  |      UniswapV2Pair     |       UniswapV2Pair      |   
        // ---------------------------------------------------------------------

        if (_isExcludedFromPayingFee[from]) {
            // transfer from this contract || add liquidity (from == address(this))
            transferTax = 0;
        }
        else if (msg.sender == address(uniswapV2Router02) && from != address(this) && to == busdPairAddress) {
            // sell token
            transferTax = 0;

            sellTaxForAddingLiquidity = amount / sellTaxForAddingLiquidityDenominator * sellTaxForAddingLiquidityNumerator;
            internalTokenSellTaxForAddingLiquidity = convertRealTokenAmountToInternalTokenAmount(sellTaxForAddingLiquidity);

            _internalTokenBalances[from] -= internalTokenSellTaxForAddingLiquidity;
            _internalTokenBalances[address(this)] += internalTokenSellTaxForAddingLiquidity;

            addLiquidityForBUSDPair(sellTaxForAddingLiquidity);

        
            sellTaxForRewardingStakers = amount / sellTaxForStakerRewardDenominator * sellTaxForStakerRewardNumerator;
            internalTokenSellTaxForRewardingStakers = convertRealTokenAmountToInternalTokenAmount(sellTaxForRewardingStakers);

            _internalTokenBalances[from] -= internalTokenSellTaxForRewardingStakers;
            _internalTokenBalances[address(this)] += internalTokenSellTaxForRewardingStakers;
            
            // Accumulated staked reward for 30 days += sell tax * (1 / 4)
            _internalTokenAccumulatedStakeRewardFor30Days += internalTokenSellTaxForRewardingStakers / (stakeRewardMultiplierFor30Days + stakeRewardMultiplierFor180Days) * stakeRewardMultiplierFor30Days;
            // Accumulated staked reward for 180 days += sell tax * (3 / 4)
            _internalTokenAccumulatedStakeRewardFor180Days += internalTokenSellTaxForRewardingStakers / (stakeRewardMultiplierFor30Days + stakeRewardMultiplierFor180Days) * stakeRewardMultiplierFor180Days;
        }
        else {
            // normal toten tramsfer
            transferTax = amount / transferTaxDenominator * transferTaxNumerator;
        }

        transferAmountAfterTax = amount - transferTax - sellTaxForAddingLiquidity - sellTaxForRewardingStakers;

        internalTokenTransferTax = convertRealTokenAmountToInternalTokenAmount(transferTax);
        internalTokenTransferAmountAfterTax = convertRealTokenAmountToInternalTokenAmount(transferAmountAfterTax);

        _internalTokenBalances[from] -= (internalTokenTransferTax + internalTokenTransferAmountAfterTax);
        _internalTokenBalances[to] += internalTokenTransferAmountAfterTax;
        _internalTokenTotalSupply -= internalTokenTransferTax;

        emit Transfer(from, to, transferAmountAfterTax);
    }

    function addLiquidityForBUSDPair(uint tokenAmount) public {
        uint busdAmount;

        (uint reserveToken, uint reserveBUSD) = UniswapV2Library.getReserves(address(uniswapV2Factory), address(this), ADDRESS_BUSD);        
        if (reserveToken == 0 && reserveBUSD == 0) {
            busdAmount = 2 * tokenAmount; // initial proportion for the pool
        }
        else {
            busdAmount = UniswapV2Library.quote(tokenAmount, reserveToken, reserveBUSD);
        }

        (uint amountTokenAdded, uint amountBUSDAdded, uint liquidity) = _addLiquidity(tokenAmount, busdAmount, ADDRESS_BUSD);
    }

    function _addLiquidity(uint tokenAmount, uint otherTokenAmount, address otherTokenAddress) 
        internal returns(uint amountTokenAdded, uint amountOtherTokenAdded, uint liquidity) {
        
        IERC20 otherToken = IERC20(otherTokenAddress);
        otherToken.approve(address(uniswapV2Router02), otherTokenAmount);
        _approve(address(this), address(uniswapV2Router02), tokenAmount);
    
        (amountTokenAdded, amountOtherTokenAdded, liquidity) = uniswapV2Router02.addLiquidity(
            address(this),
            otherTokenAddress,
            tokenAmount,
            otherTokenAmount,
            1,
            1,
            address(this),
            block.timestamp
        );
    }

    function isStaked(address addr) public view returns (bool) {
        return (isStakedFor30Days[addr] || isStakedFor180Days[addr]);
    }

    function stakeFor30Days() public {
        require(!isStaked(_msgSender()), "You have already been staking your tokens");

        isStakedFor30Days[_msgSender()] = true;
        stakeUnlockedTimestamp[_msgSender()] = block.timestamp + 30 * 24 * 60 * 60; // 30 days

        _internalTokenTotalStakedAmountFor30Days += _internalTokenBalances[_msgSender()];
    }

    function stakeFor180Days() public {
        require(!isStaked(_msgSender()), "You have already been staking your tokens");

        isStakedFor180Days[_msgSender()] = true;
        stakeUnlockedTimestamp[_msgSender()] = block.timestamp + 180 * 24 * 60 * 60; // 180 days

        _internalTokenTotalStakedAmountFor180Days += _internalTokenBalances[_msgSender()];
    }

    function redeemStakedTokensAndRewards() public {
        require(isStaked(_msgSender()), "You haven't staked your tokens!");
        require(block.timestamp > stakeUnlockedTimestamp[_msgSender()], "Your stake period haven't ended");

        uint internalTokenStakeReward;

        if (isStakedFor30Days[_msgSender()]) {
            internalTokenStakeReward = 
                _internalTokenAccumulatedStakeRewardFor30Days * _internalTokenBalances[_msgSender()] / _internalTokenTotalStakedAmountFor30Days;
            
            _internalTokenTotalStakedAmountFor30Days -= _internalTokenBalances[_msgSender()];
            _internalTokenAccumulatedStakeRewardFor30Days -= internalTokenStakeReward;   
        }
        
        else {
            // stake for 180 days
            internalTokenStakeReward = 
                _internalTokenAccumulatedStakeRewardFor180Days * _internalTokenBalances[_msgSender()] / _internalTokenTotalStakedAmountFor180Days;
            
            _internalTokenTotalStakedAmountFor180Days -= _internalTokenBalances[_msgSender()];
            _internalTokenAccumulatedStakeRewardFor180Days -= internalTokenStakeReward;
        }

        _internalTokenBalances[_msgSender()] += internalTokenStakeReward;

        isStakedFor30Days[_msgSender()] = false;
        isStakedFor180Days[_msgSender()] = false;
        delete(stakeUnlockedTimestamp[_msgSender()]);
    }


}


