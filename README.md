## Usage
### Install
```
npm install
```
### Create .env File and Add Your ALCHEMY_API_KEY inside it

### Run Test
```
npx hardhat test test/test.js
```

## 分潤型代幣（參考 SafeMoon 實作的）
  - 功能1: 每次 Transfer 會徵收 5% 的稅 (transfer tax)，"即時" 依照餘額比例分給所有持幣者
    - 合約 以及 合約 owner transfer 不會被徵稅
    - 在 uniswap 上賣出 token 不會被徵 transfer tax (但會有 sell tax，見功能2)
  - 功能2: 每次在 Uniswap 上賣出 token (目前只支援與 busd swap 的 pair) 會徵收 10% 的稅，其中 5% 會用來向 Uniswap 上的池子添加流動性，另外 5% 會分給代幣鎖倉的人
    - 如果沒有任何人鎖倉代幣，則總共只會收取 5% 的稅，用來添加 Uniswap 上的池子的流動性
  - 功能3: 用戶可以鎖倉代幣，一次鎖越久分潤比例越高
    - 進行鎖倉可以獲得每次有人在 Uniswap 上賣出 token 的 5% 分潤
    - 鎖倉分為兩種到期日：30天 和 180天，到期後才可以執行代幣贖回的動作
      - 鎖倉 180天 可以獲得 鎖倉 30天 3 倍的質押分潤獎勵
    - 鎖倉後在執行代幣贖回之前，原本帳戶內所有的 token 都不允許被轉移，也不允許有其他人再轉移 token 進已鎖倉的地址
    - 鎖倉功能有個小 bug，就是後來進行鎖倉的人會把前面鎖倉的人的鎖倉份額縮小，比如說原本只有 A 和 B 鎖倉 30 天，他們各自都質押 100 個代幣，如果他們鎖倉了 29 天後，理論上再過一天，他們就可以領出，並且獲得這 30 天 的鎖倉獎勵，但是如果第 29 天的時候有一個超級大戶進來鎖倉 30 天，然後他質押了 10000 個代幣，則會把原本 A 和 B 隔天各自應該領到的鎖倉獎勵稀釋掉
      - 這個 bug 還沒想到怎麼處理比較好
