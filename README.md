## Usage
### Install
```
npm install
```
### Create an .env File and Add Your ALCHEMY_API_KEY inside it
```
ALCHEMY_API_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```
### Run Test
```
npx hardhat test test/test.js
```
## Fee-Sharing Token (Inspired by SafeMoon's Implementation)

- Feature 1: A 5% transfer tax will be levied on each Transfer. This is "instantly" distributed to all token holders based on their balance ratio.
  - Contract and contract owner transfers are not taxed.
  - Selling tokens on Uniswap won't be subject to the transfer tax (but there is a sell tax, see Feature 2).
- Feature 2: Every time a token is sold on Uniswap (currently only supporting pairs swapped with busd), a 10% tax is levied. Out of this, 5% is used to add liquidity to the pool on Uniswap, while the other 5% is distributed to those who have locked their tokens.
  - If no one locks their tokens, only a 5% tax is collected and used to add liquidity to the pool on Uniswap.
- Feature 3: Users can lock their tokens. The longer they lock, the higher the revenue share ratio they receive.
  - Locking will earn them a 5% share every time someone sells a token on Uniswap.
  - There are two lock-in periods: 30 days and 180 days. Tokens can be redeemed only after the maturity date.
    - Locking for 180 days earns 3 times the revenue share reward of locking for 30 days.
  - After locking, all tokens in the original account cannot be transferred, and no one else is allowed to transfer tokens into a locked address.
