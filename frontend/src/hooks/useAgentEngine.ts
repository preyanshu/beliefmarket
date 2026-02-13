"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useReadContract } from "wagmi";
import { formatUnits, createPublicClient, http } from "viem";
import {
  BELIEF_MARKET_ADDRESS,
  USDC_DECIMALS,
} from "@/config/contracts";
import { BELIEF_MARKET_ABI } from "@/config/beliefMarketAbi";
import { skaleBiteV2Sandbox } from "@/config/chains";
import { DATA_SOURCES, getDataSourceById } from "@/config/dataSources";
import { fetchAllPrices, PriceResult } from "@/utils/priceOracle";
import { autoExecutePosition } from "@/utils/agentWallet";
import { encryptDirection } from "@/utils/encryption";
import { loadAgentMemory, addAgentMemory, type AgentMemoryEntry } from "@/utils/agentMemory";
import type { LLMDecision } from "@/app/api/agent-decision/route";
import {
  AgentProfile,
  AgentRecommendation,
  AgentStats,
  AuditEntry,
  AuditAction,
  AgentPersonality,
  PERSONALITY_FROM_INDEX,
  SignalBreakdown,
  RecommendationStatus,
  DEFAULT_AGENT_STATS,
  AGENT_COLORS,
} from "@/types/market";

// Public client for direct contract reads inside async scan functions
const publicClient = createPublicClient({
  chain: skaleBiteV2Sandbox,
  transport: http(),
});

// ─── Log Types ───────────────────────────────────────────────────────

export interface AgentLog {
  timestamp: number;
  agentId: number;
  agentName: string;
  message: string;
  type: "info" | "scan" | "recommendation" | "execution" | "error" | "warning";
}

// ─── Personality multipliers ─────────────────────────────────────────

const PERSONALITY_PARAMS: Record<
  AgentPersonality,
  {
    confidenceBoost: number;
    stakeMultiplier: number;
    momentumWeight: number;
    distanceWeight: number;
    contrarianFlip: boolean;
  }
> = {
  conservative: {
    confidenceBoost: -15,
    stakeMultiplier: 0.25,
    momentumWeight: 0.6,
    distanceWeight: 0.4,
    contrarianFlip: false,
  },
  balanced: {
    confidenceBoost: 0,
    stakeMultiplier: 0.5,
    momentumWeight: 0.5,
    distanceWeight: 0.5,
    contrarianFlip: false,
  },
  aggressive: {
    confidenceBoost: 15,
    stakeMultiplier: 0.8,
    momentumWeight: 0.3,
    distanceWeight: 0.7,
    contrarianFlip: false,
  },
  contrarian: {
    confidenceBoost: 5,
    stakeMultiplier: 0.4,
    momentumWeight: 0.7,
    distanceWeight: 0.3,
    contrarianFlip: true,
  },
};

// ─── Storage (encrypted IndexedDB) ───────────────────────────────────

import { getItem, setItem } from "@/utils/encryptedStore";

const AGENT_LOCAL_DATA_KEY = "beliefmarket_agent_local_data";
const AUDIT_KEY = "beliefmarket_audit_trail";
const RUNNING_AGENTS_KEY = "beliefmarket_running_agents";

interface AgentLocalData {
  stats: AgentStats;
  color: string;
}

async function loadAgentLocalData(): Promise<Map<number, AgentLocalData>> {
  if (typeof window === "undefined") return new Map();
  try {
    const entries = await getItem<Array<[number, AgentLocalData]>>(AGENT_LOCAL_DATA_KEY);
    if (entries) {
      return new Map(entries.map(([id, data]) => [
        id,
        {
          stats: { ...DEFAULT_AGENT_STATS, ...data.stats },
          color: data.color || AGENT_COLORS[id % AGENT_COLORS.length],
        },
      ]));
    }
  } catch {
    /* ignore */
  }
  return new Map();
}

function saveAgentLocalData(data: Map<number, AgentLocalData>) {
  if (typeof window === "undefined") return;
  const entries = Array.from(data.entries());
  // Fire-and-forget async persist — in-memory state is source of truth
  setItem(AGENT_LOCAL_DATA_KEY, entries).catch((err) =>
    console.error("[AgentEngine] Failed to persist agent local data:", err)
  );
}

async function loadAuditTrail(): Promise<AuditEntry[]> {
  if (typeof window === "undefined") return [];
  try {
    const data = await getItem<AuditEntry[]>(AUDIT_KEY);
    if (data) return data;
  } catch {
    /* ignore */
  }
  return [];
}

function saveAuditTrail(trail: AuditEntry[]) {
  if (typeof window === "undefined") return;
  // Fire-and-forget async persist
  setItem(AUDIT_KEY, trail.slice(0, 500)).catch((err) =>
    console.error("[AgentEngine] Failed to persist audit trail:", err)
  );
}

// ─── Persisted running-agent state ──────────────────────────────────

async function loadRunningAgentIds(): Promise<number[]> {
  if (typeof window === "undefined") return [];
  try {
    const ids = await getItem<number[]>(RUNNING_AGENTS_KEY);
    return ids ?? [];
  } catch {
    return [];
  }
}

function saveRunningAgentIds(ids: number[]) {
  if (typeof window === "undefined") return;
  setItem(RUNNING_AGENTS_KEY, ids).catch((err) =>
    console.error("[AgentEngine] Failed to persist running agents:", err)
  );
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─── Hook ──────────────────────────────────────────────────────────

export function useMultiAgent(address: string | undefined) {
  const [agentIds, setAgentIds] = useState<number[]>([]);
  const [runningAgents, setRunningAgents] = useState<Set<number>>(new Set());
  const [recommendations, setRecommendations] = useState<AgentRecommendation[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [globalAudit, setGlobalAudit] = useState<AuditEntry[]>([]);
  const [prices, setPrices] = useState<PriceResult[]>([]);
  const [agentLocalData, setAgentLocalData] = useState<Map<number, AgentLocalData>>(
    new Map()
  );

  const intervalsRef = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const priceHistoryRef = useRef<Record<number, number[]>>({});
  const agentProfilesRef = useRef<Map<number, AgentProfile>>(new Map());
  const recommendationsRef = useRef<AgentRecommendation[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    recommendationsRef.current = recommendations;
  }, [recommendations]);

  // Read agent IDs from contract
  const { data: ownerAgentIds, refetch: refetchAgentIds, isError, error } = useReadContract({
    address: BELIEF_MARKET_ADDRESS,
    abi: BELIEF_MARKET_ABI,
    functionName: "getOwnerAgentIds",
    args: address ? [address as `0x${string}`] : undefined,
    query: {
      enabled: !!address,
    },
  });

  // Debug logging
  useEffect(() => {
    if (address) {
      console.log("[Agent Engine] Querying agents for address:", address);
      console.log("[Agent Engine] Contract address:", BELIEF_MARKET_ADDRESS);
      if (isError) {
        console.error("[Agent Engine] Query error:", error);
      }
    }
  }, [address, isError, error]);

  // Update agent IDs when contract data changes
  useEffect(() => {
    if (ownerAgentIds && Array.isArray(ownerAgentIds)) {
      const ids = ownerAgentIds.map((id) => Number(id));
      console.log("[Agent Engine] Loaded agent IDs from chain:", ids);
      setAgentIds(ids);
    } else {
      console.log("[Agent Engine] No agent IDs found or invalid data:", ownerAgentIds);
      setAgentIds([]);
    }
  }, [ownerAgentIds]);

  // Load from encrypted IndexedDB on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [localData, audit] = await Promise.all([
        loadAgentLocalData(),
        loadAuditTrail(),
      ]);
      if (!cancelled) {
        setAgentLocalData(localData);
        setGlobalAudit(audit);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Audit logger ──────────────────────────────────────────────

  const addAudit = useCallback(
    (
      agentId: number,
      action: AuditAction,
      summary: string,
      details?: string,
      metadata?: Record<string, string | number | boolean>
    ) => {
      const entry: AuditEntry = {
        id: makeId(),
        agentId,
        timestamp: Date.now(),
        action,
        summary,
        details,
        metadata,
      };
      setGlobalAudit((prev) => {
        const newAudit = [entry, ...prev].slice(0, 500);
        saveAuditTrail(newAudit);
        return newAudit;
      });
    },
    []
  );

  // ─── Activity log ──────────────────────────────────────────────

  const addLog = useCallback(
    (
      agentId: number,
      agentName: string,
      message: string,
      type: AgentLog["type"] = "info"
    ) => {
      setLogs((prev) => [
        {
          timestamp: Date.now(),
          agentId,
          agentName,
          message,
          type,
        },
        ...prev.slice(0, 199),
      ]);
    },
    []
  );

  // ─── Signal Analysis ──────────────────────────────────────────

  const analyzeMarket = useCallback(
    (
      personality: AgentPersonality,
      currentPrice: number,
      targetPrice: number,
      conditionAbove: boolean,
      resolutionTime: number,
      yesPool: bigint,
      noPool: bigint,
      sourceId: number
    ): { signals: SignalBreakdown; confidence: number; direction: boolean } => {
      const params = PERSONALITY_PARAMS[personality];

      const priceDistance = ((currentPrice - targetPrice) / targetPrice) * 100;
      const absDistance = Math.abs(priceDistance);

      const history = priceHistoryRef.current[sourceId] || [];
      let momentum = 0;
      if (history.length >= 3) {
        const recent = history.slice(-5);
        const oldest = recent[0];
        const newest = recent[recent.length - 1];
        momentum = ((newest - oldest) / oldest) * 100 * 10;
        momentum = Math.max(-100, Math.min(100, momentum));
      }

      const now = Date.now() / 1000;
      const timeLeft = resolutionTime - now;
      const totalDuration = Math.max(resolutionTime - (now - 86400), 1);
      const timeUrgency = Math.max(
        0,
        Math.min(100, (1 - timeLeft / totalDuration) * 100)
      );

      const yPool = Number(formatUnits(yesPool, USDC_DECIMALS));
      const nPool = Number(formatUnits(noPool, USDC_DECIMALS));
      const total = yPool + nPool;
      const poolImbalance = total > 0 ? ((yPool - nPool) / total) * 100 : 0;

      const signals: SignalBreakdown = {
        priceDistance: Math.round(priceDistance * 100) / 100,
        momentum: Math.round(momentum),
        timeUrgency: Math.round(timeUrgency),
        poolImbalance: Math.round(poolImbalance),
      };

      let suggestYes: boolean;
      if (conditionAbove) {
        suggestYes = priceDistance > 0 || momentum > 20;
      } else {
        suggestYes = priceDistance < 0 || momentum < -20;
      }

      if (params.contrarianFlip) {
        if (poolImbalance > 30) suggestYes = false;
        else if (poolImbalance < -30) suggestYes = true;
        else suggestYes = !suggestYes;
      }

      let confidence = 50;
      const distContrib =
        absDistance > 20 ? 35 : absDistance > 5 ? 25 : absDistance > 2 ? 15 : absDistance > 0.5 ? 8 : -5;
      confidence += distContrib * params.distanceWeight;
      const momDir = suggestYes ? momentum : -momentum;
      confidence += (momDir / 100) * 30 * params.momentumWeight;
      if (timeUrgency > 50) confidence += 5;
      if (timeUrgency > 70 && momDir > 0) confidence += 10;
      if (timeUrgency > 90 && momDir < 0) confidence -= 10;
      if (params.contrarianFlip && Math.abs(poolImbalance) > 40) confidence += 10;
      confidence += params.confidenceBoost;
      confidence = Math.max(0, Math.min(100, Math.round(confidence)));

      return { signals, confidence, direction: suggestYes };
    },
    []
  );

  // ─── LLM Decision Call ──────────────────────────────────────────

  const callLLMDecision = useCallback(
    async (
      agentId: number,
      profile: AgentProfile,
      balanceNum: number,
      marketsData: Array<{
        marketId: number;
        source: ReturnType<typeof getDataSourceById>;
        priceResult: PriceResult;
        market: any;
        signals: SignalBreakdown;
        hasExistingPosition: boolean;
      }>,
    ): Promise<LLMDecision | null> => {
      try {
        const memory = await loadAgentMemory(agentId);

        const marketsContext = marketsData
          .filter((m) => m.source)
          .map((m) => {
            const targetPrice = Number(m.market.targetPrice) / 1e6;
            const yPool = Number(formatUnits(m.market.yesPool, USDC_DECIMALS));
            const nPool = Number(formatUnits(m.market.noPool, USDC_DECIMALS));
            return {
              marketId: m.marketId,
              symbol: m.source!.symbol,
              name: m.source!.name,
              category: m.source!.category,
              currentPrice: m.priceResult.price,
              targetPrice,
              conditionAbove: m.market.conditionAbove,
              yesPool: yPool,
              noPool: nPool,
              resolutionTime: Number(m.market.resolutionTime),
              priceDistance: m.signals.priceDistance,
              momentum: m.signals.momentum,
              timeUrgency: m.signals.timeUrgency,
              poolImbalance: m.signals.poolImbalance,
              hasExistingPosition: m.hasExistingPosition,
            };
          });

        if (marketsContext.length === 0) return null;

        // For manual agents, balance is irrelevant — user pays from their wallet.
        // Send a high number so LLM doesn't hold due to "0 balance".
        const effectiveBalance = profile.autoExecute ? balanceNum : 999999;

        const agentContext = {
          agentId,
          name: profile.name,
          personality: profile.personality,
          systemPrompt: profile.systemPrompt || "",
          balance: effectiveBalance,
          maxBetPerMarket: Number(formatUnits(profile.maxBetPerMarket, USDC_DECIMALS)),
          maxTotalExposure: Number(formatUnits(profile.maxTotalExposure, USDC_DECIMALS)),
          currentExposure: Number(formatUnits(profile.currentExposure, USDC_DECIMALS)),
          confidenceThreshold: profile.confidenceThreshold,
          autoExecute: profile.autoExecute,
          allowedAssetTypes: profile.allowedAssetTypes,
        };

        const memoryForLLM = memory.map((m) => ({
          timestamp: m.timestamp,
          marketId: m.marketId,
          symbol: m.symbol,
          action: m.action,
          stake: m.stake,
          reasoning: m.reasoning,
          confidence: m.confidence,
        }));

        addLog(agentId, profile.name, `Consulting LLM for decision across ${marketsContext.length} markets...`, "scan");

        const res = await fetch("/api/agent-decision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent: agentContext,
            markets: marketsContext,
            memory: memoryForLLM,
          }),
        });

        const data = await res.json();

        if (data.useFallback) {
          addLog(agentId, profile.name, "LLM unavailable, using rule-based fallback.", "info");
          return null;
        }

        return data as LLMDecision;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        addLog(agentId, profile.name, `LLM call failed: ${errMsg}. Falling back to rules.`, "warning");
        return null;
      }
    },
    [addLog]
  );

  // ─── Scan for a specific agent ─────────────────────────────────

  const scanForAgent = useCallback(
    async (agentId: number) => {
      const profile = agentProfilesRef.current.get(agentId);
      if (!profile || !profile.isActive) return;

      // For manual agents, pause scanning if there's already a pending recommendation
      if (!profile.autoExecute) {
        const hasPending = recommendationsRef.current.some(
          (r) => r.agentId === agentId && r.status === "pending"
        );
        if (hasPending) {
          addLog(agentId, profile.name, "Waiting for pending recommendation to be approved or rejected before scanning.", "info");
          return;
        }
      }

      const personality = profile.personality;

      try {
        // 0. Read fresh agent balance from chain
        const freshAgent = await publicClient.readContract({
          address: BELIEF_MARKET_ADDRESS,
          abi: BELIEF_MARKET_ABI,
          functionName: "getAgent",
          args: [BigInt(agentId)],
        }) as any;

        const freshBalance = freshAgent.balance as bigint;
        const balanceNum = Number(formatUnits(freshBalance, USDC_DECIMALS));

        // Stop auto-execute agents with empty vault
        if (profile.autoExecute && freshBalance === BigInt(0)) {
          addLog(agentId, profile.name, `Vault balance is 0 USDC. Stopping agent. Fund the agent vault to resume.`, "warning");
          addAudit(agentId, "stopped", "Agent stopped: vault empty. Fund to resume.");
          const interval = intervalsRef.current.get(agentId);
          if (interval) { clearInterval(interval); intervalsRef.current.delete(agentId); }
          setRunningAgents((prev) => { const s = new Set(prev); s.delete(agentId); return s; });
          return;
        }

        const modeLabel = profile.autoExecute ? "Auto-Execute" : "Manual";
        addLog(agentId, profile.name, `Scanning markets [${personality}] [${modeLabel}] | Vault: ${balanceNum} USDC...`, "scan");

        // 1. Read market count
        const count = await publicClient.readContract({
          address: BELIEF_MARKET_ADDRESS, abi: BELIEF_MARKET_ABI, functionName: "getMarketCount",
        });
        const marketTotal = Number(count);

        if (marketTotal === 0) {
          addLog(agentId, profile.name, "No markets on-chain yet.", "info");
          addAudit(agentId, "scan", "Scan complete: 0 markets");
          return;
        }

        // 2. Fetch all prices
        const prices = await fetchAllPrices();
        setPrices(prices);

        for (const p of prices) {
          if (!p.success) continue;
          const hist = priceHistoryRef.current[p.sourceId] || [];
          hist.push(p.price);
          if (hist.length > 20) hist.shift();
          priceHistoryRef.current[p.sourceId] = hist;
        }

        // 3. Read agent's existing positions
        const agentPositionMarkets: Set<number> = new Set();
        try {
          const posIds = await publicClient.readContract({
            address: BELIEF_MARKET_ADDRESS, abi: BELIEF_MARKET_ABI,
            functionName: "getAgentPositionIds", args: [BigInt(agentId)],
          }) as bigint[];

          for (const posId of posIds) {
            const pos = await publicClient.readContract({
              address: BELIEF_MARKET_ADDRESS, abi: BELIEF_MARKET_ABI,
              functionName: "getPosition", args: [posId],
            }) as any;
            if (Number(pos.status) === 0) agentPositionMarkets.add(Number(pos.marketId));
          }

          if (agentPositionMarkets.size > 0) {
            addLog(agentId, profile.name, `Agent has active positions in ${agentPositionMarkets.size} market(s): [${[...agentPositionMarkets].join(", ")}]`, "info");
          }
        } catch { /* continue */ }

        // 4. Gather all eligible market data
        const marketsData: Array<{
          marketId: number;
          source: ReturnType<typeof getDataSourceById>;
          priceResult: PriceResult;
          market: any;
          signals: SignalBreakdown;
          hasExistingPosition: boolean;
        }> = [];

        for (let i = 0; i < marketTotal; i++) {
          try {
            const market = await publicClient.readContract({
              address: BELIEF_MARKET_ADDRESS, abi: BELIEF_MARKET_ABI,
              functionName: "getMarket", args: [BigInt(i)],
            }) as any;

            if (Number(market.status) !== 0) continue;
            const resolutionTime = Number(market.resolutionTime);
            if (resolutionTime <= Date.now() / 1000) continue;

            const dataSourceId = Number(market.dataSourceId);
            const source = getDataSourceById(dataSourceId);
            if (!source) continue;
            if ((source.assetType & profile.allowedAssetTypes) === 0) continue;

            const priceResult = prices.find((p) => p.success && p.sourceId === dataSourceId);
            if (!priceResult || !priceResult.success) continue;

            const targetPrice = Number(market.targetPrice) / 1e6;
            const { signals } = analyzeMarket(
              personality, priceResult.price, targetPrice,
              market.conditionAbove, resolutionTime,
              market.yesPool, market.noPool, source.id
            );

            const condLabel = market.conditionAbove ? "above" : "below";
            const distLabel = `${signals.priceDistance > 0 ? "+" : ""}${signals.priceDistance.toFixed(1)}%`;
            addLog(agentId, profile.name,
              `Market #${i} (${source.symbol}): $${priceResult.price.toFixed(2)} vs target $${targetPrice.toFixed(2)} (${condLabel}) | Dist: ${distLabel} | Mom: ${signals.momentum} | Urg: ${signals.timeUrgency}%`,
              "info"
            );

            marketsData.push({
              marketId: i, source, priceResult, market, signals,
              hasExistingPosition: agentPositionMarkets.has(i),
            });
          } catch (marketErr) {
            addLog(agentId, profile.name, `Error reading market #${i}: ${marketErr instanceof Error ? marketErr.message : "unknown"}`, "error");
          }
        }

        if (marketsData.length === 0) {
          addLog(agentId, profile.name, "No eligible markets found.", "info");
          addAudit(agentId, "scan", `Scan complete: ${marketTotal} markets, 0 eligible`);
          return;
        }

        // ═══════════════════════════════════════════════════════════════
        // 5. LLM Decision (with rule-based fallback)
        // ═══════════════════════════════════════════════════════════════

        let decision: LLMDecision | null = null;
        let usedLLM = false;

        // Try LLM first
        decision = await callLLMDecision(agentId, profile, balanceNum, marketsData);
        usedLLM = decision !== null && decision.source === "llm";

        // Fallback to rule-based if LLM unavailable
        if (!decision) {
          addLog(agentId, profile.name, "Using rule-based analysis...", "info");

          let bestRec: { marketId: number; direction: boolean; confidence: number; signals: SignalBreakdown; source: ReturnType<typeof getDataSourceById>; price: number; targetPrice: number } | null = null;

          for (const md of marketsData) {
            if (md.hasExistingPosition) continue;
            const targetPrice = Number(md.market.targetPrice) / 1e6;
            const { signals, confidence, direction } = analyzeMarket(
              personality, md.priceResult.price, targetPrice,
              md.market.conditionAbove, Number(md.market.resolutionTime),
              md.market.yesPool, md.market.noPool, md.source!.id
            );

            if (confidence >= profile.confidenceThreshold) {
              if (!bestRec || confidence > bestRec.confidence) {
                bestRec = { marketId: md.marketId, direction, confidence, signals, source: md.source, price: md.priceResult.price, targetPrice };
              }
            }
          }

          if (bestRec) {
            const params = PERSONALITY_PARAMS[personality];
            const maxBet = Number(formatUnits(profile.maxBetPerMarket, USDC_DECIMALS));
            const stakeNum = Math.round(maxBet * params.stakeMultiplier * 100) / 100;
            decision = {
              action: bestRec.direction ? "buy_yes" : "buy_no",
              marketId: bestRec.marketId,
              symbol: bestRec.source?.symbol || "",
              stake: stakeNum,
              confidence: bestRec.confidence,
              reasoning: buildReasoning(bestRec.source?.symbol || "", bestRec.signals, personality, bestRec.direction),
              marketAnalysis: `Rule-based: best signal from ${marketsData.length} markets. Price distance: ${bestRec.signals.priceDistance.toFixed(1)}%, momentum: ${bestRec.signals.momentum}, urgency: ${bestRec.signals.timeUrgency}%.`,
              source: "fallback",
            };
          } else {
            decision = {
              action: "hold", marketId: null, symbol: "", stake: 0, confidence: 0,
              reasoning: `No market met confidence threshold (${profile.confidenceThreshold}%) via rule-based analysis.`,
              marketAnalysis: `Analyzed ${marketsData.length} markets. None exceeded threshold.`,
              source: "fallback",
            };
          }
        }

        // ═══════════════════════════════════════════════════════════════
        // 6. Execute the decision
        // ═══════════════════════════════════════════════════════════════

        const sourceLabel = usedLLM ? "LLM" : "Rules";

        if (decision.action === "hold" || !decision.marketId) {
          addLog(agentId, profile.name,
            `[${sourceLabel}] Decision: HOLD | ${decision.reasoning}`,
            "recommendation"
          );
          addAudit(agentId, "recommendation", `[${sourceLabel}] HOLD — ${decision.reasoning}`, decision.marketAnalysis, {
            source: decision.source,
            confidence: decision.confidence,
          });

          // Save hold to memory
          await addAgentMemory(agentId, {
            timestamp: Date.now(),
            marketId: -1,
            symbol: "",
            action: "hold",
            stake: 0,
            confidence: decision.confidence,
            reasoning: decision.reasoning,
            source: decision.source,
          });
        } else {
          // We have an actionable decision
          const direction = decision.action === "buy_yes";
          const dirLabel = direction ? "YES" : "NO";
          const md = marketsData.find((m) => m.marketId === decision!.marketId);

          // Enforce stake limits
          let actualStake = decision.stake;
          if (profile.autoExecute) {
            actualStake = Math.min(actualStake, balanceNum);
            if (actualStake <= 0) {
              addLog(agentId, profile.name,
                `[${sourceLabel}] Wanted ${dirLabel} on ${decision.symbol} but vault empty.`,
                "warning"
              );
              return;
            }
          }
          actualStake = Math.min(actualStake, Number(formatUnits(profile.maxBetPerMarket, USDC_DECIMALS)));
          const stakeRaw = BigInt(Math.round(actualStake * 10 ** USDC_DECIMALS));

          addLog(agentId, profile.name,
            `[${sourceLabel}] Signal: ${dirLabel} on ${decision.symbol} (Market #${decision.marketId}) | ${actualStake} USDC @ ${decision.confidence}% confidence`,
            "recommendation"
          );

          if (usedLLM) {
            addLog(agentId, profile.name, `LLM Reasoning: ${decision.reasoning}`, "info");
            if (decision.marketAnalysis) {
              addLog(agentId, profile.name, `Market Analysis: ${decision.marketAnalysis}`, "info");
            }
          }

          const rec: AgentRecommendation = {
            id: `${agentId}-${decision.marketId}-${Date.now()}`,
            agentId,
            marketId: decision.marketId,
            direction,
            confidence: decision.confidence,
            suggestedStake: stakeRaw,
            reasoning: decision.reasoning + (decision.marketAnalysis ? `\n\nMarket Analysis: ${decision.marketAnalysis}` : ""),
            currentPrice: md?.priceResult.price || 0,
            targetPrice: md ? Number(md.market.targetPrice) / 1e6 : 0,
            timestamp: Date.now(),
            status: "pending",
            signals: md?.signals || { priceDistance: 0, momentum: 0, timeUrgency: 0, poolImbalance: 0 },
          };

          addAudit(agentId, "recommendation",
            `[${sourceLabel}] ${dirLabel} on ${decision.symbol} (Market #${decision.marketId}) — ${actualStake} USDC @ ${decision.confidence}%`,
            decision.reasoning + (decision.marketAnalysis ? `\n\nAnalysis: ${decision.marketAnalysis}` : ""),
            {
              confidence: decision.confidence,
              stake: actualStake,
              symbol: decision.symbol,
              marketId: decision.marketId,
              direction,
              source: decision.source,
              mode: profile.autoExecute ? "auto" : "manual",
            }
          );

          // Auto-execute
          if (profile.autoExecute) {
            addLog(agentId, profile.name, `Auto-executing: ${dirLabel} on Market #${decision.marketId} (${decision.symbol}) for ${actualStake} USDC...`, "execution");
            try {
              const encryptedDir = await encryptDirection(direction);
              const txHash = await autoExecutePosition(agentId, decision.marketId, encryptedDir, stakeRaw);
              rec.txHash = txHash;
              rec.status = "executed";
              addLog(agentId, profile.name, `Executed: ${dirLabel} on ${decision.symbol} @ ${actualStake} USDC | tx: ${txHash.slice(0, 14)}...`, "execution");
              addAudit(agentId, "executed", `${dirLabel} on ${decision.symbol} (Market #${decision.marketId}) — ${actualStake} USDC`, undefined, {
                txHash, symbol: decision.symbol, marketId: decision.marketId,
                direction, stake: actualStake, confidence: decision.confidence, source: decision.source, mode: "auto",
              });
            } catch (err) {
              rec.status = "executed";
              const errMsg = err instanceof Error ? err.message : String(err);
              addLog(agentId, profile.name, `Auto-execute failed: ${errMsg}`, "error");
              addAudit(agentId, "error", `Auto-execute failed on ${decision.symbol}: ${errMsg}`, undefined, {
                symbol: decision.symbol, marketId: decision.marketId, direction, stake: actualStake, confidence: decision.confidence,
              });
            }
          }

          // Save decision to memory
          await addAgentMemory(agentId, {
            timestamp: Date.now(),
            marketId: decision.marketId,
            symbol: decision.symbol,
            action: decision.action,
            stake: actualStake,
            confidence: decision.confidence,
            reasoning: decision.reasoning,
            source: decision.source,
            currentPrice: md?.priceResult.price,
            targetPrice: md ? Number(md.market.targetPrice) / 1e6 : undefined,
            txHash: rec.txHash,
          });

          // Update recommendations state
          setRecommendations((prev) => [rec, ...prev].slice(0, 100));
        }

        // Update stats
        const newSignals = decision.action !== "hold" ? 1 : 0;
        const wasExecuted = decision.action !== "hold" && profile.autoExecute;
        setAgentLocalData((prev) => {
          const newMap = new Map(prev);
          const local = newMap.get(agentId) || {
            stats: { ...DEFAULT_AGENT_STATS },
            color: AGENT_COLORS[agentId % AGENT_COLORS.length],
          };
          const prevCount = local.stats.totalRecommendations;
          local.stats = {
            ...local.stats,
            totalScans: local.stats.totalScans + 1,
            totalRecommendations: prevCount + newSignals,
            totalExecuted: local.stats.totalExecuted + (wasExecuted ? 1 : 0),
            avgConfidence: newSignals > 0
              ? Math.round((local.stats.avgConfidence * prevCount + decision!.confidence) / (prevCount + 1))
              : local.stats.avgConfidence,
          };
          newMap.set(agentId, local);
          saveAgentLocalData(newMap);
          return newMap;
        });

        addAudit(agentId, "scan",
          `Scan complete: ${marketTotal} markets, ${marketsData.length} eligible, decision: ${decision.action.toUpperCase()} [${sourceLabel}]`
        );
        addLog(agentId, profile.name,
          `Scan complete. ${marketTotal} markets, ${marketsData.length} eligible. Decision: ${decision.action.toUpperCase()} [${sourceLabel}]`,
          "scan"
        );
      } catch (err) {
        addLog(agentId, profile.name, `Error: ${err instanceof Error ? err.message : "unknown"}`, "error");
        addAudit(agentId, "error", `Scan failed: ${err instanceof Error ? err.message : "unknown"}`);
      }
    },
    [addLog, addAudit, analyzeMarket, callLLMDecision]
  );

  // ─── Start / Stop Agent ────────────────────────────────────────

  const startAgent = useCallback(
    (agentId: number, agentProfile: AgentProfile, _silent = false) => {
      agentProfilesRef.current.set(agentId, agentProfile);
      setRunningAgents((prev) => {
        const newSet = new Set(prev);
        newSet.add(agentId);
        // Persist running IDs to IndexedDB
        saveRunningAgentIds(Array.from(newSet));
        return newSet;
      });

      if (!_silent) {
        addAudit(agentId, "started", `Agent "${agentProfile.name}" started`);
        addLog(
          agentId,
          agentProfile.name,
          `Started [${agentProfile.personality}/${agentProfile.autoExecute ? "auto" : "manual"}]`,
          "info"
        );
      } else {
        addLog(agentId, agentProfile.name, "Auto-resumed from previous session", "info");
      }

      scanForAgent(agentId);
      const interval = setInterval(() => scanForAgent(agentId), 30000); // 30s poll
      intervalsRef.current.set(agentId, interval);
    },
    [scanForAgent, addAudit, addLog]
  );

  const stopAgent = useCallback(
    (agentId: number) => {
      const interval = intervalsRef.current.get(agentId);
      if (interval) {
        clearInterval(interval);
        intervalsRef.current.delete(agentId);
      }
      setRunningAgents((prev) => {
        const newSet = new Set(prev);
        newSet.delete(agentId);
        // Persist running IDs to IndexedDB
        saveRunningAgentIds(Array.from(newSet));
        return newSet;
      });
      const profile = agentProfilesRef.current.get(agentId);
      if (profile) {
        addAudit(agentId, "stopped", `Agent "${profile.name}" stopped`);
        addLog(agentId, profile.name, "Stopped", "info");
      }
    },
    [addAudit, addLog]
  );

  // ─── Approve / Reject / Execute ────────────────────────────────

  // Called after the on-chain transaction is confirmed (manual approve flow)
  const approveRecommendation = useCallback((recId: string) => {
    setRecommendations((prev) =>
      prev.map((r) =>
        r.id === recId ? { ...r, status: "executed" as RecommendationStatus } : r
      )
    );
    const rec = recommendations.find((r) => r.id === recId);
    if (rec) {
      setAgentLocalData((prev) => {
        const newMap = new Map(prev);
        const local = newMap.get(rec.agentId) || {
          stats: { ...DEFAULT_AGENT_STATS },
          color: AGENT_COLORS[rec.agentId % AGENT_COLORS.length],
        };
        local.stats.totalExecuted += 1;
        newMap.set(rec.agentId, local);
        saveAgentLocalData(newMap);
        return newMap;
      });
      const stakeUsdc = Number(rec.suggestedStake) / 10 ** USDC_DECIMALS;
      addAudit(rec.agentId, "executed", `${rec.direction ? "YES" : "NO"} on Market #${rec.marketId} — ${stakeUsdc} USDC @ ${rec.confidence}% confidence (manual approve)`, undefined, {
        marketId: rec.marketId,
        direction: rec.direction,
        stake: stakeUsdc,
        confidence: rec.confidence,
        mode: "manual",
      });
    }
  }, [recommendations, addAudit]);

  const rejectRecommendation = useCallback((recId: string) => {
    setRecommendations((prev) =>
      prev.map((r) =>
        r.id === recId ? { ...r, status: "rejected" as RecommendationStatus } : r
      )
    );
    const rec = recommendations.find((r) => r.id === recId);
    if (rec) {
      setAgentLocalData((prev) => {
        const newMap = new Map(prev);
        const local = newMap.get(rec.agentId) || {
          stats: { ...DEFAULT_AGENT_STATS },
          color: AGENT_COLORS[rec.agentId % AGENT_COLORS.length],
        };
        local.stats.totalRejected += 1;
        newMap.set(rec.agentId, local);
        saveAgentLocalData(newMap);
        return newMap;
      });
      const rejStake = Number(rec.suggestedStake) / 10 ** USDC_DECIMALS;
      addAudit(rec.agentId, "rejected", `${rec.direction ? "YES" : "NO"} on Market #${rec.marketId} rejected — ${rejStake} USDC @ ${rec.confidence}% confidence`, undefined, {
        marketId: rec.marketId,
        direction: rec.direction,
        stake: rejStake,
        confidence: rec.confidence,
      });

      // Store rejection in agent memory so the LLM knows about it on the next scan
      const originalAction: "buy_yes" | "buy_no" = rec.direction ? "buy_yes" : "buy_no";
      addAgentMemory(rec.agentId, {
        timestamp: Date.now(),
        marketId: rec.marketId,
        symbol: rec.reasoning.match(/on (\w+)/)?.[1] || `Market #${rec.marketId}`,
        action: "rejected",
        originalAction,
        stake: rejStake,
        confidence: rec.confidence,
        reasoning: `User rejected ${originalAction.toUpperCase()} recommendation: ${rec.reasoning.slice(0, 200)}`,
        source: "user",
        currentPrice: rec.currentPrice,
        targetPrice: rec.targetPrice,
      });
    }
  }, [recommendations, addAudit]);

  const markExecuted = useCallback((recId: string) => {
    setRecommendations((prev) =>
      prev.map((r) =>
        r.id === recId ? { ...r, status: "executed" as RecommendationStatus } : r
      )
    );
    const rec = recommendations.find((r) => r.id === recId);
    if (rec) {
      setAgentLocalData((prev) => {
        const newMap = new Map(prev);
        const local = newMap.get(rec.agentId) || {
          stats: { ...DEFAULT_AGENT_STATS },
          color: AGENT_COLORS[rec.agentId % AGENT_COLORS.length],
        };
        local.stats.totalExecuted += 1;
        newMap.set(rec.agentId, local);
        saveAgentLocalData(newMap);
        return newMap;
      });
      addAudit(rec.agentId, "executed", `Position executed`);
    }
  }, [recommendations, addAudit]);

  // ─── Auto-resume agents that were running before reload ─────────
  const hasAutoResumedRef = useRef(false);

  useEffect(() => {
    if (hasAutoResumedRef.current) return;        // only once
    if (!agentIds.length) return;                 // wait for chain IDs

    hasAutoResumedRef.current = true;
    let cancelled = false;

    (async () => {
      const savedRunningIds = await loadRunningAgentIds();
      if (cancelled || !savedRunningIds.length) return;

      // Only resume agents that still exist on-chain
      const toResume = savedRunningIds.filter((id) => agentIds.includes(id));
      if (!toResume.length) {
        // Clean up stale IDs
        saveRunningAgentIds([]);
        return;
      }

      console.log("[Agent Engine] Auto-resuming agents from previous session:", toResume);

      for (const id of toResume) {
        if (cancelled) break;
        // Skip if already running (shouldn't happen but be safe)
        if (intervalsRef.current.has(id)) continue;

        try {
          // Fetch fresh on-chain data for the agent
          const agentData = await publicClient.readContract({
            address: BELIEF_MARKET_ADDRESS,
            abi: BELIEF_MARKET_ABI,
            functionName: "getAgent",
            args: [BigInt(id)],
          }) as any;

          if (!agentData || !agentData.isActive) {
            console.log(`[Agent Engine] Skipping auto-resume for agent ${id} — inactive on chain`);
            continue;
          }

          const profile: AgentProfile = {
            onChainId: id,
            owner: agentData.owner,
            delegate: agentData.delegate,
            name: agentData.name || `Agent ${id}`,
            systemPrompt: agentData.systemPrompt || "",
            personality: PERSONALITY_FROM_INDEX[agentData.personality] || "balanced",
            color: AGENT_COLORS[id % AGENT_COLORS.length],
            balance: agentData.balance,
            maxBetPerMarket: agentData.maxBetPerMarket,
            maxTotalExposure: agentData.maxTotalExposure,
            currentExposure: agentData.currentExposure,
            allowedAssetTypes: agentData.allowedAssetTypes,
            confidenceThreshold: agentData.confidenceThreshold,
            autoExecute: agentData.autoExecute,
            isActive: agentData.isActive,
            stats: DEFAULT_AGENT_STATS,
            auditTrail: [],
          };

          // _silent = true  → skip "started" audit, show "auto-resumed" log instead
          startAgent(id, profile, true);
          console.log(`[Agent Engine] Auto-resumed agent "${profile.name}" (ID ${id})`);
        } catch (err) {
          console.error(`[Agent Engine] Failed to auto-resume agent ${id}:`, err);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [agentIds, startAgent]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      intervalsRef.current.forEach((interval) => clearInterval(interval));
    };
  }, []);

  return {
    agentIds,
    runningAgents,
    recommendations,
    logs,
    globalAudit,
    prices,
    startAgent,
    stopAgent,
    approveRecommendation,
    rejectRecommendation,
    markExecuted,
    refreshAgentIds: refetchAgentIds,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function buildReasoning(
  symbol: string,
  signals: SignalBreakdown,
  personality: AgentPersonality,
  direction: boolean
): string {
  const parts: string[] = [];
  const dir = direction ? "YES" : "NO";

  if (Math.abs(signals.priceDistance) > 3) {
    parts.push(
      `Price is ${Math.abs(signals.priceDistance).toFixed(1)}% ${
        signals.priceDistance > 0 ? "above" : "below"
      } target`
    );
  } else {
    parts.push(
      `Price is near target (${signals.priceDistance.toFixed(1)}% away)`
    );
  }

  if (Math.abs(signals.momentum) > 20) {
    parts.push(
      `Strong ${signals.momentum > 0 ? "upward" : "downward"} momentum detected`
    );
  }

  if (signals.timeUrgency > 70) {
    parts.push("Market nearing resolution");
  }

  if (Math.abs(signals.poolImbalance) > 30 && personality === "contrarian") {
    parts.push(
      `Pool heavily ${signals.poolImbalance > 0 ? "YES" : "NO"}-sided — contrarian opportunity`
    );
  }

  return `${dir} on ${symbol}. ${parts.join(". ")}.`;
}
