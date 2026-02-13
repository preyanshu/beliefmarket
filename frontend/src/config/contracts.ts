import { SHADOW_POOL_ABI } from "./shadowPoolAbi";
import { DARK_TOKEN_ABI } from "./darkTokenAbi";

// ─── Deployed on SKALE BITE V2 Sandbox (Chain ID: 103698795) ────────
export const SHADOW_POOL_ADDRESS =
  "0x4fa2d7fEF7671A0d2F5d0A0c0cb702cc51996e82" as `0x${string}`;
export const DARK_TOKEN_ADDRESS =
  "0x8ba83c6Fc826b84f3Fb0224Fe84323237F2c30B5" as `0x${string}`;
export const USDC_ADDRESS =
  "0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8" as `0x${string}`;
// ─────────────────────────────────────────────────────────────────────

export { SHADOW_POOL_ABI, DARK_TOKEN_ABI };

export const ERC20_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const CTX_GAS_PAYMENT = BigInt("60000000000000000"); // 0.06 sFUEL
export const PRICE_PRECISION = BigInt("1000000"); // 6 decimals
export const DECIMAL_SCALE = BigInt("1000000000000"); // 1e12 = 10^(18-6) for base/quote decimal conversion
