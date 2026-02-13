# BeliefMarket

AI native Private, conditional prediction markets using BITE v2 on SKALE.

BeliefMarket keeps market beliefs private until a condition is met. Users and agents submit encrypted positions. The chain cannot see which side is winning. When the market resolves, BITE v2 conditional threshold execution decrypts positions and settles payouts atomically.

<img width="1852" height="984" alt="BeliefMarket screenshot" src="https://github.com/user-attachments/assets/3027ea69-dc6f-40d9-a327-01e6e60d9d00" />

## Links and deployed contracts

| Item | Value |
|------|-------|
| Live demo | `https://belief.preyanshu.me` |
| Demo video (YouTube) | `https://youtu.be/` |
| GitHub | `https://github.com/preyanshu/beliefmarket` |
| Network | SKALE BITE V2 Sandbox (Chain ID `103698795`) |
| BeliefMarket | `0x15A4e6Be6840a0D54FB6a4A6F97E84F5D2a1453e` |
| USDC  | `0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8` |

Explorer links:
- BeliefMarket: `https://base-sepolia-testnet-explorer.skalenodes.com:10032/address/0x15A4e6Be6840a0D54FB6a4A6F97E84F5D2a1453e`
- USDC: `https://base-sepolia-testnet-explorer.skalenodes.com:10032/address/0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8`


## Features

### Private prediction markets
- Markets are tied to real world oracle data (commodities, ETFs, FX rates)
- Live charts use DIA price feeds (22 trusted sources)
- Positions are submitted with BITE v2 encryption for direction (YES or NO)
- Settlement is parimutuel (winners split the losing pool)
- Resolution outcome is derived from oracle price vs target

<img width="1856" height="990" alt="Market UI screenshot" src="https://github.com/user-attachments/assets/d2a85d5a-a195-4430-8610-b4a8d7599d72" />

### Agents (AI native, guardrailed)
- Multiple agents per user
- Each agent has a custom system prompt stored on chain
- Agents have persistent memory of past actions and user rejections
- Agents read real world data (DIA oracle prices) to make informed decisions
- Two modes:
  - Auto execute: delegate wallet signs and submits from the agent vault
  - Manual: user approves and signs from their wallet
- LLM decisions via Groq (Llama 3.3 70B)
- Background scanning across pages, with in app notifications for approvals

<img width="1856" height="990" alt="Agent UI screenshot" src="https://github.com/user-attachments/assets/3679eab8-bafd-499c-bef6-c23aa72a9f8c" />

### Self custodial agent wallets
- Delegate keypairs are generated on the client and kept in the user's browser
- Private keys never touch our server
- Local agent data is encrypted at rest (AES 256 GCM via Web Crypto)
- Delegate address is registered on chain


## Why private plus conditional

Public markets leak belief and intent. That causes copy trading, front running, and agent alpha leakage. BeliefMarket fixes this by keeping the only sensitive part private: the direction of each position.

The workflow is conditional:
- Before resolution: direction stays encrypted and no one can infer which side is winning
- At resolution: a condition is met and the system decrypts and settles
- After settlement: everything is auditable

## What is private vs public

Private during the market:
- YES or NO direction per position (stored as `encryptedDirection` ciphertext)
- Side split of the pool (only total deposits are visible)
- Any implied odds (there is no pricing logic)

Always public:
- Market metadata (question, oracle source, target, condition, resolution time)
- Total deposits
- Position count
- Stake amount per position (how much, not which side)

## Conditional trigger (what unlocks execution)

Condition:
- `block.timestamp >= resolutionTime`
- plus the resolver submitting the oracle outcome via `resolveMarket(marketId, oracleOutcome)`

What happens:
1. Contract moves market into RESOLVING
2. Contract submits encrypted payloads to BITE v2 CTX
3. BITE v2 threshold network decrypts directions
4. `biteCallback()` receives decrypted directions and computes parimutuel payouts
5. USDC payouts are distributed atomically and the market becomes SETTLED

## Encrypted to decrypt to receipt (end to end)

1. Encrypted intent:
   - User or agent encrypts direction using the BITE v2 TypeScript SDK
   - On chain only ciphertext is stored, direction field stays false until callback
2. Condition check:
   - Resolution time reached
   - Oracle outcome submitted
3. Conditional decryption:
   - BITE v2 CTX decrypts all encrypted directions
4. Execution:
   - `biteCallback()` settles and transfers USDC
5. Receipt:
   - UI and logs show market id, symbol, direction, stake, confidence, and tx hash
   - On chain shows decrypted directions and payouts

## Guardrails (on chain enforcement)

Guardrails are enforced by the smart contract. Frontend checks exist, but the contract is the final gate.

<img width="1852" height="984" alt="Guardrails screenshot" src="https://github.com/user-attachments/assets/bf6667d8-8c78-4b48-bd9a-3b6e1b3222e9" />

On chain enforced:
- Max bet per market
- Max total exposure
- Vault balance (auto execute spends only from the agent vault)
- Delegate authorization (only owner or delegate can act for an agent)

Frontend enforced:
- Confidence threshold (LLM plus engine)
- Allowed asset types (engine filters)
- Human approval in manual mode


## Failure handling

Market level:
- No positions: resolves with no payouts
- All positions on one side: everyone is refunded
- CTX failure: market stays in RESOLVING and can be retried

Agent level:
- Auto execute fails: error recorded in audit and agent pauses
- LLM call fails: rule based fallback selects an action
- Vault empty (auto mode): agent stops and prompts user to fund
- Vault empty (manual mode): agent continues scanning since user signs
- Guardrail violation: transaction reverts on chain and is logged

## Receipts and audit output

Receipt output exists in UI and structured logs:
- Per scan cycle: which markets were checked and why one was picked
- Per action: timestamp, market, direction, stake, confidence, mode, source, tx hash (if executed)
- Full LLM reasoning text is stored with the action for audit
- Market resolution receipt: oracle outcome, decrypted directions, pool totals, payouts

<img width="1852" height="984" alt="Receipt log screenshot" src="https://github.com/user-attachments/assets/8c816488-217e-4991-8c05-132767050276" />

Example structured log:

```
Scan: mode=manual personality=balanced
Market #3 WTI/USD price=73.14 target=100.00 condition=above dist=-26.9 conf=73
Decision: buy_no stake=10 reason=...
Result: recommended txHash=null
```

## Smart contract interface (high signal)

Core functions:
- `createMarket()`
- `submitPosition()`
- `submitPositionForAgent()`
- `resolveMarket()` (starts CTX)
- `biteCallback()` (decrypts and settles)
- `createAgent()` (stores system prompt and guardrails, registers delegate, forwards sFUEL)
- `fundAgent()`, `withdrawFromAgent()`
- `updateAgent()`

On chain agent config includes:
- `systemPrompt`
- `personality`
- `maxBetPerMarket`, `maxTotalExposure`, `currentExposure`
- `balance`
- `delegate`, `owner`
- `confidenceThreshold`
- `allowedAssetTypes`
- `autoExecute`

## Data sources (DIA)

22 sources across:
- Commodities: NG, WTI, XBR
- FX: CAD, AUD, CNY
- ETFs: SPY, VOO, QQQ, VTI, IBIT, FBTC, ARKB, HODL, GBTC, BITO, ETHA, BETH, TLT, SHY, VGSH, GOVT

## Setup

Contracts:
```bash
cd contracts
npm install
PRIVATE_KEY=... npx hardhat run scripts/deploy.ts --network biteV2Sandbox
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

## Tech stack

- Smart contracts: Solidity, Hardhat, OpenZeppelin, BITE v2 Solidity SDK
- Frontend: Next.js, React, TypeScript, Tailwind
- Wallet: Privy, wagmi, viem
- Oracles: DIA
- LLM: Groq (OpenAI compatible)

## License

MIT
