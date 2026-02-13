/**
 * Agent Memory System
 *
 * Stores per-agent decision history in encrypted IndexedDB.
 * The LLM uses this memory to make informed decisions —
 * avoiding repeated actions and learning from past trades.
 */

import { getItem, setItem } from "@/utils/encryptedStore";

const MEMORY_KEY_PREFIX = "beliefmarket_agent_memory_";
const MAX_MEMORIES_PER_AGENT = 50;

export interface AgentMemoryEntry {
  timestamp: number;
  marketId: number;
  symbol: string;
  action: "buy_yes" | "buy_no" | "hold" | "rejected";
  stake: number;
  confidence: number;
  reasoning: string;
  source: "llm" | "fallback" | "user";
  currentPrice?: number;
  targetPrice?: number;
  txHash?: string;
  /** Original action before user rejected it (only set when action === "rejected") */
  originalAction?: "buy_yes" | "buy_no";
  /** Why the user rejected — optional free-text (for future use) */
  rejectionNote?: string;
}

function memoryKey(agentId: number): string {
  return `${MEMORY_KEY_PREFIX}${agentId}`;
}

/**
 * Load all memory entries for an agent.
 */
export async function loadAgentMemory(agentId: number): Promise<AgentMemoryEntry[]> {
  if (typeof window === "undefined") return [];
  try {
    const data = await getItem<AgentMemoryEntry[]>(memoryKey(agentId));
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Append a new memory entry for an agent.
 */
export async function addAgentMemory(
  agentId: number,
  entry: AgentMemoryEntry
): Promise<void> {
  const memories = await loadAgentMemory(agentId);
  memories.unshift(entry); // newest first
  // Trim to max size
  const trimmed = memories.slice(0, MAX_MEMORIES_PER_AGENT);
  await setItem(memoryKey(agentId), trimmed);
}

/**
 * Get memory entries for a specific market.
 */
export async function getMarketMemory(
  agentId: number,
  marketId: number
): Promise<AgentMemoryEntry[]> {
  const memories = await loadAgentMemory(agentId);
  return memories.filter((m) => m.marketId === marketId);
}

/**
 * Clear all memory for an agent.
 */
export async function clearAgentMemory(agentId: number): Promise<void> {
  await setItem(memoryKey(agentId), []);
}

/**
 * Get a summary of agent's past actions for LLM context.
 */
export async function getMemorySummary(agentId: number): Promise<{
  totalActions: number;
  marketsTraded: number[];
  recentActions: AgentMemoryEntry[];
}> {
  const memories = await loadAgentMemory(agentId);
  const marketsTraded = [...new Set(memories.filter((m) => m.action !== "hold").map((m) => m.marketId))];

  return {
    totalActions: memories.filter((m) => m.action !== "hold").length,
    marketsTraded,
    recentActions: memories.slice(0, 15),
  };
}
