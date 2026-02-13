🥇 Illiquid, Priceless Private Prediction Markets
Encrypted Belief Markets for Agents using BITE v2

Built on SKALE Labs

Overview

This project introduces a new prediction market primitive:

a market with no visible price, no visible sides, and no belief leakage until resolution.

Users and agents submit encrypted positions (direction + amount) using BITE v2 (Blockchain Integrated Threshold Encryption).
During the lifetime of the market, no participant can see prices, odds, or sentiment.
Only after the oracle resolves the outcome are positions decrypted and settled.

This design cannot be built on standard public execution chains.

Why This Exists (Problem)

Traditional prediction markets (Polymarket, Omen, Azuro-style AMMs) suffer from:

Signaling & copy trading
Early or large trades reveal conviction

MEV & front-running
Visible order flow is exploitable

Agent disadvantage
Automated traders leak alpha immediately

Bandwagon effects
Prices influence beliefs instead of aggregating them

These problems are structural and unsolvable without encryption.

Core Insight

A market without a visible price is impossible on public execution chains.

BITE v2 enables:

Encrypted belief expression

Conditional decryption at resolution

Full post-finality auditability

This unlocks illiquid, priceless markets where beliefs remain private until they matter.

What This Project Builds

A private prediction market where:

Positions (YES / NO + stake) are encrypted

No odds or prices exist during the market

Only total deposited value is visible

Oracle resolution triggers conditional decryption

Payouts are computed and distributed atomically

Architecture
┌──────────────┐
│  Human User  │
│ (Policies)   │
└──────┬───────┘
       │
       │ sets guardrails
       ▼
┌──────────────┐
│    Agent     │
│ (Belief +    │
│  Automation) │
└──────┬───────┘
       │ encrypted intent (YES/NO, amount)
       ▼
┌─────────────────────────┐
│ Prediction Market       │
│ Smart Contract          │
│                         │
│ - Stores encrypted data │
│ - Tracks total deposits │
│ - No pricing logic      │
└──────────┬──────────────┘
           │
           │ oracle outcome
           ▼
┌─────────────────────────┐
│ Oracle / Resolver       │
└──────────┬──────────────┘
           │ CTX trigger
           ▼
┌─────────────────────────┐
│ BITE v2 Decryption      │
│ (Conditional Unlock)    │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Settlement + Receipt    │
│ - Decrypted positions   │
│ - Payouts computed      │
│ - Transparent logs     │
└─────────────────────────┘

Role of Humans vs Agents
Humans

Create markets (question, oracle, deadline)

Define risk limits and policies

Choose agent strategy (aggressive, conservative)

Review outcomes and receipts

Agents

Monitor data feeds

Form beliefs privately

Decide YES / NO and stake size

Submit encrypted positions

Trigger resolution when conditions are met

Humans define intent and control.
Agents handle execution and speed.

Market Lifecycle
1. Market Creation (Public)

A market is created with:

Question

Resolution timestamp

Oracle address

Settlement rules

No prices, odds, or sides are ever defined.

2. Encrypted Position Submission (BITE v2)

Users or agents submit an encrypted payload containing:

Direction (YES / NO)

Stake amount

Optional timing or weight

On-chain:

Only an encrypted blob is stored

Contract cannot read direction or amount

Only totalDeposited is updated

3. Live Market State (What Everyone Sees)

During the market:

Question

Total deposited amount

Time remaining

Not visible:

Which side is winning

How many participants per side

Any implied probability

4. Resolution (Conditional Trigger)

At resolution time:

Oracle submits outcome (YES or NO)

This triggers BITE v2 conditional decryption (CTX)

Until this point:

All beliefs remain encrypted

5. Decrypt → Settle → Execute

Once CTX fires:

Positions are decrypted

Winning side is determined

Payouts are calculated

Funds are distributed atomically

Settlement examples:

Winner-takes-loser pool

Weighted by stake or timing

6. Receipt & Transparency

After settlement:

Outcome is public

Total pool size is visible

Individual payouts are logged

Before resolution: zero belief leakage
After resolution: full auditability

What Stays Encrypted

Direction (YES / NO)

Stake amount

Timing strategy

Agent conviction

What Is Public

Market question

Resolution time

Oracle

Total deposited amount

Final outcome and payouts

Why BITE v2 Is Essential

Without BITE v2:

Stakes and directions must be public

Prices emerge immediately

Agents leak alpha

MEV is unavoidable

With BITE v2:

Beliefs remain private

Execution is conditional

Markets become agent-native

This project cannot function correctly without encryption.

Demo Flow (End-to-End)

Create market
“ETH > $4,000 on March 31”

Submit multiple encrypted positions

Show live UI (no prices, no sides)

Oracle resolves outcome

BITE v2 decrypts positions

Payouts executed

Receipt displayed

Why Judges Will Care

✅ Clear “why private + conditional”

✅ Not a Polymarket clone

✅ Strong agent-first design

✅ Clean encrypted → decrypt → execute lifecycle

✅ Demonstrates a new market primitive

Future Extensions

Multi-outcome markets

SLA / KPI-based resolution

DAO-governed oracles

Cross-market agent portfolios

Private hedging strategies

Built With

SKALE Network

BITE v2 SDK (TypeScript)

Solidity Smart Contracts

React Frontend

Track

