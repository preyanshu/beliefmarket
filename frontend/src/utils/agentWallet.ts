/**
 * Agent Wallet Manager
 *
 * Generates and stores ephemeral keypairs per agent in encrypted IndexedDB.
 * These delegate wallets allow agents to auto-sign transactions
 * without wallet popups.
 */

import {
  generatePrivateKey,
  privateKeyToAccount,
  type PrivateKeyAccount,
} from "viem/accounts";
import { createWalletClient, createPublicClient, http, type Chain } from "viem";
import { BELIEF_MARKET_ADDRESS } from "@/config/contracts";
import { BELIEF_MARKET_ABI } from "@/config/beliefMarketAbi";
import { getItem, setItem } from "@/utils/encryptedStore";

const WALLET_STORAGE_KEY = "beliefmarket_agent_wallets";

// SKALE BITE V2 Sandbox chain config
const biteV2Sandbox: Chain = {
  id: 103698795,
  name: "SKALE BITE V2 Sandbox",
  nativeCurrency: { name: "sFUEL", symbol: "sFUEL", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox"],
    },
  },
};

interface StoredWallet {
  agentId: number;
  privateKey: string;
  address: string;
  createdAt: number;
}

// ─── In-memory cache (loaded once from IndexedDB) ────────────────────

let walletsCache: StoredWallet[] | null = null;
let cacheLoaded = false;
let loadPromise: Promise<void> | null = null;

async function ensureCache(): Promise<StoredWallet[]> {
  if (cacheLoaded && walletsCache !== null) return walletsCache;
  if (loadPromise) {
    await loadPromise;
    return walletsCache || [];
  }
  loadPromise = (async () => {
    try {
      const data = await getItem<StoredWallet[]>(WALLET_STORAGE_KEY);
      walletsCache = data || [];
    } catch {
      walletsCache = [];
    }
    cacheLoaded = true;
  })();
  await loadPromise;
  loadPromise = null;
  return walletsCache || [];
}

async function persistWallets(): Promise<void> {
  if (walletsCache) {
    await setItem(WALLET_STORAGE_KEY, walletsCache);
  }
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Generate a new ephemeral keypair for an agent.
 * Returns the delegate address to register on-chain.
 */
export async function createAgentWallet(agentId: number): Promise<{
  address: `0x${string}`;
  privateKey: `0x${string}`;
}> {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const wallets = await ensureCache();
  wallets.push({
    agentId,
    privateKey,
    address: account.address,
    createdAt: Date.now(),
  });
  walletsCache = wallets;
  await persistWallets();

  return { address: account.address, privateKey };
}

/**
 * Get the stored wallet for an agent.
 */
export async function getAgentWallet(
  agentId: number
): Promise<{ account: PrivateKeyAccount; address: `0x${string}` } | null> {
  const wallets = await ensureCache();
  const stored = wallets.find((w) => w.agentId === agentId);
  if (!stored) return null;

  const account = privateKeyToAccount(stored.privateKey as `0x${string}`);
  return { account, address: account.address };
}

/**
 * Check if an agent has a stored wallet.
 */
export async function hasAgentWallet(agentId: number): Promise<boolean> {
  const wallets = await ensureCache();
  return wallets.some((w) => w.agentId === agentId);
}

/**
 * Delete an agent's wallet (e.g., when deleting the agent).
 */
export async function deleteAgentWallet(agentId: number): Promise<void> {
  const wallets = await ensureCache();
  walletsCache = wallets.filter((w) => w.agentId !== agentId);
  await persistWallets();
}

/**
 * Get all stored wallets (for debugging/display).
 */
export async function getAllAgentWallets(): Promise<StoredWallet[]> {
  return await ensureCache();
}

/**
 * Get the raw private key for an agent (for export).
 */
export async function getAgentWalletPrivateKey(agentId: number): Promise<string | null> {
  const wallets = await ensureCache();
  const stored = wallets.find((w) => w.agentId === agentId);
  return stored?.privateKey || null;
}

/**
 * Get the delegate address for an agent.
 */
export async function getAgentWalletAddress(agentId: number): Promise<string | null> {
  const wallets = await ensureCache();
  const stored = wallets.find((w) => w.agentId === agentId);
  return stored?.address || null;
}

/**
 * Ensure a delegate wallet exists for an agent — create one if missing.
 * Returns the wallet address.
 */
export async function ensureAgentWallet(agentId: number): Promise<`0x${string}`> {
  const existing = await getAgentWallet(agentId);
  if (existing) return existing.address;

  console.log(`[AgentWallet] No wallet found for agent ${agentId}, auto-creating...`);
  const wallet = await createAgentWallet(agentId);
  return wallet.address;
}

// ─── Auto-Execution ─────────────────────────────────────────────────

/**
 * Submit a position for an agent using the delegate wallet.
 * This bypasses the user's wallet — no popup.
 */
export async function autoExecutePosition(
  agentId: number,
  marketId: number,
  encryptedDirection: `0x${string}`,
  deposit: bigint
): Promise<`0x${string}`> {
  let wallet = await getAgentWallet(agentId);
  if (!wallet) {
    // Auto-create wallet if missing
    console.log(`[AgentWallet] Auto-creating wallet for agent ${agentId} during execution`);
    const created = await createAgentWallet(agentId);
    const account = privateKeyToAccount(created.privateKey);
    wallet = { account, address: account.address };
  }

  const walletClient = createWalletClient({
    account: wallet.account,
    chain: biteV2Sandbox,
    transport: http(),
  });

  const publicClient = createPublicClient({
    chain: biteV2Sandbox,
    transport: http(),
  });

  try {
    const { request } = await publicClient.simulateContract({
      account: wallet.account,
      address: BELIEF_MARKET_ADDRESS,
      abi: BELIEF_MARKET_ABI,
      functionName: "submitPositionForAgent",
      args: [BigInt(agentId), BigInt(marketId), encryptedDirection, deposit],
    });

    const hash = await walletClient.writeContract(request);
    return hash;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[AgentWallet] Auto-execute failed for agent ${agentId}:`, errMsg);
    // Throw so the caller can see the actual error instead of just getting null
    throw new Error(`Auto-execute failed: ${errMsg.slice(0, 200)}`);
  }
}
