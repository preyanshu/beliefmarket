# BeliefMarket

**Illiquid, Priceless Private Prediction Markets using BITE v2 on SKALE**

BeliefMarket is a AI native prediction market protocol where nobody — not participants, not observers, not bots — can see which side is winning until the market resolves. Positions are encrypted on-chain using BITE v2 threshold encryption. AI agents can autonomously trade on behalf of users with full on-chain guardrails.

> Zero belief leakage. Full post-resolution auditability. Agent-native by design.

| | Link |
|---|------|
| **Live Demo** | [beliefmarket.vercel.app](https://beliefmarket.vercel.app) |
| **Demo Video** | [YouTube](https://youtu.be/PLACEHOLDER) |
| **GitHub** | [github.com/preyanshu/market](https://github.com/preyanshu/market) |
| **Network** | SKALE BITE V2 Sandbox (Chain ID: `103698795`) |
| **BeliefMarket Contract** | [`0x15A4e6Be6840a0D54FB6a4A6F97E84F5D2a1453e`](https://bite-v2-sandbox.explorer.skale.network/address/0x15A4e6Be6840a0D54FB6a4A6F97E84F5D2a1453e) |
| **USDC Contract** | [`0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8`](https://bite-v2-sandbox.explorer.skale.network/address/0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8) |

---

## Features

### Private Prediction Markets
- Create markets tied to real-world oracle data (commodities, ETFs, FX rates)
- 22 trusted data sources from DIA oracles
- Encrypted position submission using BITE v2 — direction is ciphertext on-chain
- Parimutuel settlement: winners split the losing pool proportionally
- Live price charts with real-time oracle feeds
- Oracle-auto-detected resolution outcome (with manual override)

### AI Agent System
- Deploy multiple autonomous agents per user, each with its own identity and strategy
- **Custom system prompt per agent** — users write natural-language instructions stored on-chain that shape the agent's reasoning, priorities, and decision style
- **On-chain guardrails** enforced by the smart contract (see Guardrails section)
- **Two execution modes:**
  - **Auto-Execute** — Agent has its own delegate wallet and funded USDC vault. Signs and submits encrypted transactions autonomously, no wallet popups.
  - **Manual** — Agent scans, analyzes, and recommends. User reviews and approves each transaction via their own wallet.
- **LLM-powered decisions** using Groq (Llama 3.3 70B) — the agent receives live oracle prices, market conditions, and target thresholds from 22 real-world data sources (DIA) to make informed decisions grounded in actual market data
- **Persistent memory** — each agent remembers its past actions, executed trades, and user-rejected recommendations across sessions. The LLM uses this history to avoid repeating mistakes and build on prior reasoning.
- **Rule-based fallback** if LLM calls fail — uses price distance, momentum, and urgency heuristics
- Background operation across all pages with in-app toast notifications for manual approvals
- Per-agent audit trail, activity logs, and full decision history

### Self-Custodial Agent Wallets
- Each agent gets an ephemeral delegate keypair **generated and stored entirely in your browser**
- Private keys never leave the client — no server, no third party, no custody risk
- Delegate address registered on-chain; contract forwards 0.01 sFUEL for gas in a single transaction
- Users can export delegate private keys at any time from the UI
- All local agent data (wallets, memory, audit trails) encrypted at rest using AES-256-GCM

### Guardrails — On-Chain Enforcement

Agent guardrails are **not suggestions** — they are enforced at the smart contract level. Even if the frontend is bypassed, the contract rejects transactions that violate guardrails.

| Guardrail | Enforcement Level | Description |
|-----------|------------------|-------------|
| **Max Bet Per Market** | Smart contract | `_deposit > agent.maxBetPerMarket` → transaction reverts |
| **Max Total Exposure** | Smart contract | `currentExposure + _deposit > maxTotalExposure` → transaction reverts |
| **Vault Balance** | Smart contract | `_deposit > agent.balance` → transaction reverts |
| **Delegate Authorization** | Smart contract | `msg.sender != owner && msg.sender != delegate` → transaction reverts |
| **Confidence Threshold** | Frontend (LLM + engine) | Agent skips markets below its confidence threshold |
| **Allowed Asset Types** | Frontend (engine) | Agent only scans markets matching its allowed categories |
| **Personality** | Frontend (LLM prompt) | Shapes LLM reasoning and risk appetite |
| **Active Positions** | Frontend (engine) | Agent skips markets where it already has an open position |
| **Human Approval (Manual Mode)** | Frontend (UX) | Agent pauses and waits for user to approve/reject before any execution |

### Receipt & Audit Output

After every agent action and market resolution, structured receipts are generated:

**Agent Activity Log (per scan cycle):**
```
3:17:49 PM  Scanning markets [balanced] [Manual] | Vault: 50 USDC...
3:17:52 PM  Market #3 (WTI/USD): $73.14 vs target $100.00 (above) | Dist: -26.9% | Conf: 73%
3:17:52 PM  [LLM] Decision: NO on WTI/USD | Stake: 10 USDC | Confidence: 73%
3:17:52 PM  Signal generated: NO on WTI/USD | 10 USDC | Mode: manual
3:17:52 PM  Scan complete. 4 markets checked, 1 new signal.
```

**Agent Audit Trail (per action):**
- Timestamp, action type (executed/recommended/rejected/error)
- Market ID, symbol, direction, stake, confidence
- LLM reasoning (full text)
- Transaction hash (for executed trades)
- Source (LLM or rule-based fallback)
- Mode (auto/manual)

**Market Resolution Receipt (on-chain):**
- Oracle outcome (YES/NO)
- Decrypted position directions for all participants
- Individual payouts (computed in `biteCallback`)
- YES pool and NO pool totals
- Full position list visible in UI after settlement

---

## Why Private + Conditional?

Traditional prediction markets (Polymarket, Omen, Azuro-style AMMs) have structural flaws that **cannot be solved without encryption**:

| Problem | How BeliefMarket Solves It |
|---------|---------------------------|
| **Signaling & copy trading** — Early trades reveal conviction | Positions are BITE v2 encrypted; no one sees direction until resolution |
| **MEV & front-running** — Visible order flow is exploitable | Nothing to front-run — encrypted blobs have no extractable value |
| **Agent alpha leakage** — Bots reveal strategy on every trade | Agent beliefs stay encrypted on-chain; competitors see nothing |
| **Bandwagon effects** — Prices influence beliefs | No prices exist during the market. No odds. No visible sides. |

**The condition**: Oracle resolution time. Encrypted positions are **only decrypted when the market resolution timestamp is reached and the oracle submits an outcome**. This triggers BITE v2 CTX (Conditional Threshold Execution), which atomically decrypts all positions and settles payouts in a single callback.

**Without BITE v2, this workflow is impossible.** On any public execution chain, positions must be plaintext, prices emerge immediately, and agents leak alpha on every trade.

---

## BITE v2 Usage — What Stays Encrypted, What Unlocks It

### What stays encrypted (during market lifetime)

| Data | Visibility |
|------|-----------|
| Position direction (YES / NO) | Encrypted via BITE v2 — stored as `encryptedDirection` ciphertext on-chain |
| Per-side pool split | Hidden — only `totalDeposits` is visible |
| Implied probability / odds | Do not exist — no pricing mechanism |
| Who bet which side | Unknown until resolution |
| Agent conviction & strategy | Encrypted on-chain + encrypted locally in browser |

### What is always public

| Data | Visibility |
|------|-----------|
| Market question & parameters | Public |
| Total deposited USDC | Public |
| Position count | Public |
| Resolution timestamp | Public |
| Oracle data source | Public |
| Stake amount per position | Public (the "how much", not "which side") |

### What condition unlocks execution

**Oracle resolution trigger.** When `block.timestamp >= market.resolutionTime`, the market calls `resolveMarket(marketId, oracleOutcome)`. This:

1. Sets the market status to `RESOLVING`
2. Submits all encrypted position payloads to BITE v2 CTX with the oracle outcome
3. BITE v2's threshold decryption network decrypts all `encryptedDirection` fields
4. The `biteCallback()` function receives decrypted directions, sorts positions into YES/NO pools, and computes parimutuel payouts
5. USDC is distributed atomically — winners get stake + proportional share of losing pool

**Before this trigger fires: zero belief leakage. After: full auditability.**

### How failure is handled

| Failure Scenario | Handling |
|-----------------|---------|
| Market expires with 0 positions | Market settles immediately with no payouts |
| All positions on one side | All participants get refunded (no losing pool to distribute) |
| CTX decryption fails | Market stays in `RESOLVING` state; can be retried |
| Agent auto-execute fails | Error logged in agent activity log with full error details; agent pauses |
| LLM decision fails | Rule-based fallback computes signal using price distance, momentum, urgency |
| Agent vault empty (auto mode) | Agent stops automatically; user notified to fund vault |
| Agent vault empty (manual mode) | Agent continues scanning — user pays from their own wallet |
| Position exceeds guardrails | Smart contract rejects the transaction (`ExceedsMaxBet`, `ExceedsMaxExposure`) |

---

## Encrypted → Condition → Decrypt → Execute → Receipt

This is the end-to-end conditional flow:

```
1. ENCRYPTED INTENT
   User/Agent encrypts YES/NO direction using BITE v2 TypeScript SDK
   → encryptedDirection = BITE.encrypt(direction)
   → On-chain: only ciphertext stored, direction field = false

2. CONDITION CHECK
   block.timestamp >= market.resolutionTime
   → Market creator calls resolveMarket(id, oracleOutcome)
   → Contract submits encrypted payloads to BITE v2 CTX

3. CONDITIONAL DECRYPTION
   BITE v2 threshold network decrypts all positions atomically
   → biteCallback() receives plaintext directions
   → Positions sorted into YES pool / NO pool

4. EXECUTION (Settlement)
   → Parimutuel payouts computed
   → Winners: stake + (stake / winningPool) * losingPool
   → USDC transferred atomically to all winners
   → Losers: payout = 0

5. RECEIPT
   → Market status = SETTLED
   → All positions now show decrypted direction (YES/NO)
   → Individual payouts visible on-chain
   → Full audit trail in UI: position details, payout amounts, oracle outcome
   → Agent activity logs show every decision, execution, and reasoning
```

---

## Trust Model

| Question | Answer |
|----------|--------|
| **What is private?** | Position direction (YES/NO) — encrypted via BITE v2. On-chain, only ciphertext is stored. Even the contract cannot read it. |
| **When does it unlock?** | When `block.timestamp >= resolutionTime` AND the oracle submits an outcome. This triggers CTX conditional decryption. |
| **Who can trigger?** | Only the market creator can call `resolveMarket()`. BITE v2 threshold network handles decryption — no single party can decrypt alone. |
| **What happens if it fails?** | Market stays in `RESOLVING` state. Can be retried. If no positions exist, market settles with no payouts. If all on one side, everyone is refunded. |
| **Where are agent keys stored?** | In the user's browser only. Self-custodial. Encrypted at rest with AES-256-GCM. Never sent to any server. |
| **Are guardrails enforced?** | Yes — at the smart contract level. `maxBetPerMarket`, `maxTotalExposure`, and `balance` checks are on-chain. The contract rejects violating transactions regardless of frontend state. |
| **Can the LLM override guardrails?** | No. The LLM suggests actions. Guardrails are enforced both in the frontend engine AND on-chain. Even if the LLM suggests an over-limit trade, the contract reverts it. |

---

## Architecture

```
┌──────────────────┐
│   Human User     │
│   (Policies +    │
│    Guardrails)   │
└───────┬──────────┘
        │ creates agents, sets limits, funds vaults
        ▼
┌──────────────────┐      ┌─────────────────┐
│   AI Agent       │─────▶│  Groq LLM API   │
│   (LLM + Rules   │◀─────│  (Llama 3.3)    │
│    + Memory)     │      └─────────────────┘
└───────┬──────────┘
        │ BITE v2 encrypt(direction)
        ▼
┌───────────────────────────────────┐
│   BeliefMarket Smart Contract     │
│   (SKALE BITE V2 Sandbox)         │
│                                   │
│   Encrypted positions stored      │
│   Agent vaults + on-chain limits  │
│   Delegate authorization          │
│   No pricing logic exists         │
└───────────┬───────────────────────┘
            │
            │ block.timestamp >= resolutionTime
            │ + oracle outcome submitted
            ▼
┌───────────────────────────────────┐
│   BITE v2 CTX                     │
│   Conditional Threshold Decrypt   │
│                                   │
│   All positions decrypted         │
│   atomically in biteCallback()    │
└───────────┬───────────────────────┘
            │
            ▼
┌───────────────────────────────────┐
│   Settlement + Receipt            │
│                                   │
│   YES/NO pools computed           │
│   Parimutuel payouts distributed  │
│   All data now public + auditable │
└───────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Smart Contracts** | Solidity 0.8.27, Hardhat, OpenZeppelin, BITE v2 Solidity SDK |
| **Blockchain** | SKALE BITE V2 Sandbox (Chain ID: 103698795) |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS |
| **Wallet Auth** | Privy + wagmi v2 + viem |
| **AI/LLM** | Groq API (OpenAI-compatible), Llama 3.3 70B Versatile |
| **Charts** | TradingView Lightweight Charts, Recharts |
| **On-chain Encryption** | BITE v2 TypeScript SDK + BITE v2 Solidity SDK |
| **Client Encryption** | Web Crypto API (AES-256-GCM, PBKDF2) |
| **Data Oracles** | DIA Data (22 sources: commodities, ETFs, FX rates) |
| **Animations** | Framer Motion |

---

## Smart Contract

**`BeliefMarket.sol`** — Single contract handling markets, positions, agents, and settlement.

### Key Functions

| Function | Description |
|----------|------------|
| `createMarket()` | Create a prediction market with data source, target price, condition, and resolution time |
| `submitPosition()` | Submit an encrypted position (user wallet) |
| `submitPositionForAgent()` | Submit from agent vault (callable by owner or delegate) |
| `resolveMarket()` | Oracle submits outcome → triggers BITE v2 CTX decryption |
| `biteCallback()` | BITE v2 callback — decrypts, computes payouts, distributes USDC |
| `createAgent()` | Deploy agent with guardrails + delegate (payable — sends sFUEL to delegate) |
| `fundAgent()` / `withdrawFromAgent()` | Manage agent USDC vault |
| `updateAgent()` | Update guardrails, personality, delegate |

### Agent Config (On-Chain)

```solidity
struct AgentConfig {
    address owner;              // User who created this agent
    address delegate;           // Browser-generated wallet for auto-execution
    string name;
    string systemPrompt;        // Natural-language instructions
    uint8 personality;          // 0=conservative, 1=balanced, 2=aggressive, 3=contrarian
    uint256 balance;            // USDC vault balance
    uint256 maxBetPerMarket;    // Hard cap — contract reverts if exceeded
    uint256 maxTotalExposure;   // Hard cap — contract reverts if exceeded
    uint256 currentExposure;    // Tracked by contract
    uint8 allowedAssetTypes;    // Bitmask: 1=Commodity, 2=ETF, 4=FX
    uint8 confidenceThreshold;  // Minimum confidence % to act
    bool autoExecute;           // true=delegate signs, false=user signs
    bool isActive;
}
```

---

## Agent System — Deep Dive

### How Agents Work

1. **User creates an agent** — chooses name, personality, custom system prompt, guardrails, and execution mode
2. **Delegate keypair generated in browser** — stored encrypted, never leaves the client
3. **On-chain registration** — `createAgent()` stores the system prompt + guardrails on-chain, registers delegate, sends 0.01 sFUEL for gas
4. **User funds agent vault** — deposits USDC via `fundAgent()`
5. **Agent starts scanning** — polls all open markets every 30 seconds
6. **Real-world data ingestion** — agent fetches live prices from 22 DIA oracle sources (commodities, ETFs, FX), compares against market target prices, and computes distance-from-target, momentum, and urgency signals
7. **LLM analyzes markets** — receives the agent's custom system prompt, live oracle data, all open markets with conditions, the agent's full decision memory (past executions, holds, and user rejections), personality, and guardrails
8. **Execution:**
   - **Auto:** Agent encrypts direction with BITE v2, submits via delegate wallet
   - **Manual:** Agent recommends with reasoning. User reviews, approves/rejects via their wallet.
9. **Memory persists** — every decision (executed, recommended, rejected, held) is stored per agent with full LLM reasoning. On the next scan, the LLM sees its entire history — it learns from rejected recommendations and avoids repeating the same mistakes without stronger reasoning.

### Agent Personality Types

| Personality | Behavior |
|-------------|----------|
| **Conservative** | High-confidence bets only, smaller stakes, avoids uncertainty |
| **Balanced** | Moderate risk, diversified approach |
| **Aggressive** | Higher stakes, lower thresholds, seeks opportunity |
| **Contrarian** | Goes against trends, bets on unlikely outcomes |

### LLM Decision Flow

```
Custom System Prompt (per agent, stored on-chain)
  + Live Oracle Prices (22 DIA sources — commodities, ETFs, FX)
  + Open Markets (targets, conditions, deadlines)
  + Agent Memory (past executions, holds, user rejections)
  + Personality + Guardrails + Confidence Threshold
                    │
                    ▼
            ┌───────────────┐
            │   Groq LLM    │
            │ (Llama 3.3)   │
            └───────┬───────┘
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
      buy_yes    buy_no      hold
         │          │
         ▼          ▼
   Guardrail Check (frontend engine)
         │
         ▼
   On-chain Guardrail Check (smart contract)
         │
         ▼
   Auto-Execute or Manual Approve → Receipt
```

---

## Data Sources

22 oracle-backed data sources from DIA:

| Category | Sources |
|----------|---------|
| **Commodities** (3) | Natural Gas (NG), Crude Oil (WTI), Brent Oil (XBR) |
| **FX Rates** (3) | Canadian Dollar (CAD), Australian Dollar (AUD), Chinese Yuan (CNY) |
| **ETFs** (16) | SPY, VOO, QQQ, VTI, IBIT, FBTC, ARKB, HODL, GBTC, BITO, ETHA, BETH, TLT, SHY, VGSH, GOVT |

Each source provides real-time prices via DIA's API for live charts and oracle resolution.

---

## Setup

### Prerequisites
- Node.js 18+
- A wallet with sFUEL on SKALE BITE V2 Sandbox

### 1. Clone

```bash
git clone https://github.com/preyanshu/market.git
cd market
```

### 2. Smart Contracts

```bash
cd contracts
npm install
```

Create `contracts/.env`:
```env
PRIVATE_KEY=your_deployer_private_key
```

```bash
npx hardhat compile
npx hardhat run scripts/deploy.ts --network biteV2Sandbox
```

Update `frontend/src/config/contracts.ts` with the deployed address.

### 3. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_secret
GROQ_API_KEY=your_groq_api_key
NEXT_PUBLIC_STORAGE_SECRET=any_random_string
```

```bash
npm run dev     # Development
npm run build   # Production build
npm start       # Production server
```

App runs at `http://localhost:3000`.

---

## Market Lifecycle

| Phase | What Happens | What's Visible |
|-------|-------------|----------------|
| **1. Creation** | Market created with oracle source, target, condition, resolution time | Question, parameters, deadline |
| **2. Position Submission** | Users/agents encrypt direction with BITE v2 and submit | Encrypted blob + stake amount |
| **3. Live Market** | Positions accumulate | Total pool, position count. **No sides, no odds, no prices.** |
| **4. Resolution Trigger** | Oracle outcome submitted, `resolveMarket()` called | Market enters RESOLVING state |
| **5. CTX Decryption** | BITE v2 threshold network decrypts all positions atomically | N/A (happens in callback) |
| **6. Settlement** | `biteCallback()` computes payouts, distributes USDC | Winners paid, all positions decrypted |
| **7. Audit** | Everything visible: directions, payouts, outcome | Full transparency |

---

## What Makes This Different

| Feature | Polymarket | BeliefMarket |
|---------|-----------|-------------|
| Position visibility | Public | Encrypted until resolution |
| Price discovery | Real-time AMM | No prices exist |
| MEV risk | High | Zero |
| Agent privacy | Leak alpha every trade | Beliefs stay encrypted |
| Settlement | Continuous | Atomic decrypt + settle |
| On-chain guardrails | None | Per-agent, contract-enforced |
| Condition for execution | None (always public) | Oracle resolution triggers CTX |

---

## Built With

- **[SKALE Network](https://skale.space/)** — Zero gas fees, high throughput EVM
- **[BITE v2 SDK](https://github.com/nicknguyen22/BITE-SDK)** — Blockchain Integrated Threshold Encryption
- **[DIA Data](https://www.diadata.org/)** — Decentralized oracle feeds (22 sources)
- **[Privy](https://privy.io/)** — Wallet authentication
- **[Groq](https://groq.com/)** — LLM inference (Llama 3.3 70B)
- **[Next.js](https://nextjs.org/)** — React framework
- **[Hardhat](https://hardhat.org/)** — Smart contract tooling
- **[OpenZeppelin](https://www.openzeppelin.com/)** — Audited Solidity libraries

---

## License

MIT
