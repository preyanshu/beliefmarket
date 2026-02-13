"use client";

import { useReadContract, useAccount } from "wagmi";
import { motion } from "framer-motion";
import Link from "next/link";
import { MarketCard } from "@/components/MarketCard";
import { DashboardStats } from "@/components/DashboardStats";
import { BELIEF_MARKET_ADDRESS, USDC_DECIMALS } from "@/config/contracts";
import { BELIEF_MARKET_ABI } from "@/config/beliefMarketAbi";
import { Market, MarketStatus, PERSONALITY_FROM_INDEX, PERSONALITY_META, AGENT_COLORS } from "@/types/market";
import { getDataSourceById } from "@/config/dataSources";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { formatUnits } from "viem";
import { useAgentContextSafe } from "@/providers/AgentProvider";

type CategoryFilter = "all" | "commodity" | "etf" | "fx";
type StatusFilter = "all" | "open" | "awaiting" | "resolved";

export default function Home() {
  const { data: marketCount } = useReadContract({
    address: BELIEF_MARKET_ADDRESS,
    abi: BELIEF_MARKET_ABI,
    functionName: "getMarketCount",
  });

  const [markets, setMarkets] = useState<Market[]>([]);
  const [loadedMarkets, setLoadedMarkets] = useState<Map<number, Market>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const count = Number(marketCount || 0);

  useEffect(() => {
    if (count === 0) {
      setMarkets([]);
      setLoading(false);
      return;
    }
    const loaded: Market[] = [];
    for (let i = 0; i < count; i++) {
      loaded.push({ id: i } as Market);
    }
    setMarkets(loaded);
    setLoading(false);
  }, [count]);

  const handleMarketLoaded = useCallback((market: Market) => {
    setLoadedMarkets((prev) => {
      if (prev.has(market.id)) return prev;
      const next = new Map(prev);
      next.set(market.id, market);
      return next;
    });
  }, []);

  // Filter markets by category, status, and search
  const filteredIds = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return markets
      .map((_, i) => i)
      .filter((id) => {
        const m = loadedMarkets.get(id);
        if (!m) return true; // show unloaded (will be filtered once loaded)

        const source = getDataSourceById(m.dataSourceId);

        // Category filter
        if (filter !== "all") {
          if (!source) return false;
          if (source.category !== filter) return false;
        }

        // Status filter
        if (statusFilter !== "all") {
          const isExpired = Number(m.resolutionTime) * 1000 <= Date.now();
          if (statusFilter === "open" && (m.status !== MarketStatus.OPEN || isExpired)) return false;
          if (statusFilter === "awaiting" && !(m.status === MarketStatus.OPEN && isExpired)) return false;
          if (statusFilter === "resolved" && m.status !== MarketStatus.SETTLED) return false;
        }

        // Search filter
        if (q) {
          const name = source?.name?.toLowerCase() || "";
          const symbol = source?.symbol?.toLowerCase() || "";
          const desc = source?.description?.toLowerCase() || "";
          if (!name.includes(q) && !symbol.includes(q) && !desc.includes(q)) return false;
        }

        return true;
      });
  }, [markets, filter, statusFilter, searchQuery, loadedMarkets]);

  const CATEGORY_TABS: { key: CategoryFilter; label: string }[] = [
    { key: "all", label: "All Markets" },
    { key: "commodity", label: "Commodities" },
    { key: "etf", label: "ETFs" },
    { key: "fx", label: "FX" },
  ];

  const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "awaiting", label: "Awaiting Resolution" },
    { key: "resolved", label: "Resolved" },
  ];

  return (
    <div className="page-container">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        {/* Hero — compact, muted */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 24,
        }}>
          <div>
            <h1 style={{
              fontSize: 22, fontWeight: 600, color: "var(--text-primary)",
              letterSpacing: "-0.02em", marginBottom: 2,
            }}>
              Prediction Markets <span style={{ color: "#A76FFA", opacity: 0.5 }}>/</span>
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 400 }}>
              Encrypted beliefs. Private positions. Oracle-resolved.
            </p>
          </div>
          <Link href="/create">
            <button className="btn-primary">
              Create Market
            </button>
          </Link>
        </div>

        {/* Filters row — search + status left, categories right */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, marginBottom: 20, flexWrap: "wrap",
        }}>
          {/* Search + Status — left */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Search bar */}
            <div style={{ position: "relative", width: 200 }}>
              <svg
                width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search markets..."
                style={{
                  width: "100%",
                  padding: "6px 10px 6px 30px",
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg-raised)",
                  color: "var(--text-primary)",
                  outline: "none",
                  transition: "border-color 200ms, box-shadow 200ms",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "rgba(167, 111, 250, 0.35)";
                  e.currentTarget.style.boxShadow = "0 0 0 2px rgba(167, 111, 250, 0.08)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                    width: 16, height: 16, borderRadius: "50%", cursor: "pointer",
                    background: "var(--border)", border: "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-muted)", fontSize: 10, fontWeight: 600,
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 18, background: "var(--border)", opacity: 0.5 }} />

            {/* Status filter pills */}
            <div style={{ display: "flex", gap: 2 }}>
              {STATUS_TABS.map((tab) => {
                const active = statusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setStatusFilter(tab.key)}
                    style={{
                      padding: "6px 12px", fontSize: 12, fontWeight: 500,
                      whiteSpace: "nowrap",
                      color: active ? "var(--text-primary)" : "var(--text-muted)",
                      background: active ? "rgba(167, 111, 250, 0.06)" : "transparent",
                      border: active ? "1px solid rgba(167, 111, 250, 0.15)" : "1px solid transparent",
                      borderRadius: 8,
                      cursor: "pointer", transition: "all 200ms",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category tabs — right */}
          <div style={{ display: "flex", gap: 2 }}>
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                style={{
                  padding: "6px 14px", fontSize: 12, fontWeight: 500,
                  color: filter === tab.key ? "var(--text-primary)" : "var(--text-muted)",
                  background: filter === tab.key ? "rgba(167, 111, 250, 0.06)" : "transparent",
                  border: filter === tab.key ? "1px solid rgba(167, 111, 250, 0.15)" : "1px solid transparent",
                  borderRadius: 8,
                  cursor: "pointer", transition: "all 200ms",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="market-card" style={{ padding: 20 }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  <div className="skeleton" style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: 16, width: "90%", marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 16, width: "60%" }} />
                  </div>
                </div>
                <div className="skeleton" style={{ height: 32, borderRadius: 8, marginBottom: 6 }} />
                <div className="skeleton" style={{ height: 14, width: 160, marginTop: 10 }} />
              </div>
            ))}
          </div>
        ) : count === 0 ? (
          <EmptyState />
        ) : (
          <>
            <MarketStatsSection count={count} />
            <ActiveAgentsStrip />
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}>
              {filteredIds.map((id) => (
                <MarketCardWrapper
                  key={id}
                  marketId={id}
                  index={id}
                  onLoaded={handleMarketLoaded}
                />
              ))}
            </div>
            {filteredIds.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <p style={{ fontSize: 15, color: "var(--text-muted)" }}>
                  {searchQuery
                    ? `No markets matching "${searchQuery}"`
                    : statusFilter !== "all"
                    ? `No ${statusFilter === "awaiting" ? "markets awaiting resolution" : statusFilter + " markets"} found.`
                    : "No markets in this category yet."}
                </p>
                {(searchQuery || statusFilter !== "all") && (
                  <button
                    onClick={() => { setSearchQuery(""); setStatusFilter("all"); setFilter("all"); }}
                    style={{
                      marginTop: 12, padding: "6px 16px", fontSize: 13,
                      color: "#A76FFA", background: "rgba(167, 111, 250, 0.06)",
                      border: "1px solid rgba(167, 111, 250, 0.15)", borderRadius: 8,
                      cursor: "pointer", transition: "all 200ms",
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}

function MarketStatsSection({ count }: { count: number }) {
  const [statsData, setStatsData] = useState<
    { id: number; totalDeposits: bigint; totalPositions: bigint; status: MarketStatus }[]
  >([]);

  const marketIds = Array.from({ length: count }, (_, i) => i);

  const handleData = useCallback((d: { id: number; totalDeposits: bigint; totalPositions: bigint; status: MarketStatus }) => {
    setStatsData((prev) => {
      const exists = prev.find((p) => p.id === d.id);
      if (exists) return prev;
      return [...prev, d];
    });
  }, []);

  return (
    <>
      {marketIds.map((id) => (
        <MarketStatReader key={id} marketId={id} onData={handleData} />
      ))}
      {statsData.length > 0 && <DashboardStats markets={statsData} />}
    </>
  );
}

function MarketStatReader({
  marketId,
  onData,
}: {
  marketId: number;
  onData: (data: { id: number; totalDeposits: bigint; totalPositions: bigint; status: MarketStatus }) => void;
}) {
  const { data } = useReadContract({
    address: BELIEF_MARKET_ADDRESS,
    abi: BELIEF_MARKET_ABI,
    functionName: "getMarket",
    args: [BigInt(marketId)],
  });

  useEffect(() => {
    if (data) {
      onData({
        id: marketId,
        totalDeposits: data.totalDeposits,
        totalPositions: data.totalPositions,
        status: data.status as MarketStatus,
      });
    }
  }, [data, marketId, onData]);

  return null;
}

function MarketCardWrapper({
  marketId,
  index,
  onLoaded,
}: {
  marketId: number;
  index: number;
  onLoaded: (market: Market) => void;
}) {
  const { data } = useReadContract({
    address: BELIEF_MARKET_ADDRESS,
    abi: BELIEF_MARKET_ABI,
    functionName: "getMarket",
    args: [BigInt(marketId)],
  });

  const market: Market | null = data
    ? {
        id: marketId,
        creator: data.creator,
        dataSourceId: Number(data.dataSourceId),
        targetPrice: data.targetPrice,
        conditionAbove: data.conditionAbove,
        assetType: data.assetType,
        resolutionTime: data.resolutionTime,
        totalDeposits: data.totalDeposits,
        totalPositions: data.totalPositions,
        status: data.status as MarketStatus,
        outcome: data.outcome,
        yesPool: data.yesPool,
        noPool: data.noPool,
      }
    : null;

  useEffect(() => {
    if (market) onLoaded(market);
  }, [market, onLoaded]);

  if (!market) {
    return (
      <div className="market-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div className="skeleton" style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 16, width: "90%", marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 16, width: "60%" }} />
          </div>
        </div>
        <div className="skeleton" style={{ height: 32, borderRadius: 8 }} />
      </div>
    );
  }

  return <MarketCard market={market} index={index} />;
}

// ═══════════════════════════════════════════════════════════════════
// Active Agents Strip
// ═══════════════════════════════════════════════════════════════════

function ActiveAgentsStrip() {
  const { address } = useAccount();

  const { data: ownerAgentIds } = useReadContract({
    address: BELIEF_MARKET_ADDRESS,
    abi: BELIEF_MARKET_ABI,
    functionName: "getOwnerAgentIds",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const ids = ownerAgentIds ? (ownerAgentIds as bigint[]).map((id) => Number(id)) : [];

  if (!address || ids.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{ marginBottom: 24 }}
    >
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 12,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Your Agents</span>
        <Link href="/agent" style={{
          fontSize: 13, fontWeight: 500, color: "#A76FFA",
          textDecoration: "none", transition: "color 200ms", opacity: 0.7,
        }}>
          View all &rarr;
        </Link>
      </div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
        {ids.map((agentId, idx) => (
          <AgentMiniCard key={agentId} agentId={agentId} index={idx} />
        ))}
      </div>
    </motion.div>
  );
}

function AgentMiniCard({ agentId, index }: { agentId: number; index: number }) {
  const { data: agentData } = useReadContract({
    address: BELIEF_MARKET_ADDRESS,
    abi: BELIEF_MARKET_ABI,
    functionName: "getAgent",
    args: [BigInt(agentId)],
  });

  const agentCtx = useAgentContextSafe();
  const isRunning = agentCtx?.engine.runningAgents.has(agentId) ?? false;
  const color = AGENT_COLORS[index % AGENT_COLORS.length];

  if (!agentData) {
    return (
      <div style={{
        minWidth: 200, padding: "14px 18px", borderRadius: "var(--radius-md)",
        background: "var(--bg-raised)", border: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 14, width: 80, marginBottom: 4 }} />
            <div className="skeleton" style={{ height: 12, width: 50 }} />
          </div>
        </div>
      </div>
    );
  }

  const d = agentData as any;
  const name = d.name || `Agent ${agentId}`;
  const personality = PERSONALITY_FROM_INDEX[d.personality] || "balanced";
  const meta = PERSONALITY_META[personality];
  const isActive = d.isActive;
  const autoExecute = d.autoExecute;
  const balance = Number(formatUnits(d.balance, USDC_DECIMALS));

  return (
    <Link href="/agent" style={{ textDecoration: "none" }}>
      <motion.div
        whileHover={{ y: -2 }}
        transition={{ duration: 0.15 }}
        style={{
          minWidth: 220, padding: "14px 18px", borderRadius: "var(--radius-md)",
          background: "var(--bg-raised)", border: "1px solid var(--border)",
          cursor: "pointer", transition: "border-color 200ms",
          display: "flex", alignItems: "center", gap: 14,
        }}
      >
        {/* Sphere */}
        <div style={{ position: "relative", width: 36, height: 36, flexShrink: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: `radial-gradient(circle at 35% 35%, ${color}ee, ${color}88 50%, ${color}44 100%)`,
            boxShadow: isActive ? `0 0 12px ${color}40` : `0 0 6px ${color}20`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#000", opacity: 0.7 }}>
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div style={{
            position: "absolute", bottom: -1, right: -1,
            width: 10, height: 10, borderRadius: "50%",
            background: isRunning ? "#22c55e" : "var(--text-muted)",
            border: "2px solid var(--bg-raised)",
            boxShadow: isRunning ? "0 0 6px rgba(34, 197, 94, 0.5)" : "none",
            animation: isRunning ? "pulse-dot 2s ease-in-out infinite" : "none",
          }} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>{meta.label}</span>
            <span style={{ fontSize: 11, color: "var(--border)" }}>·</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
              {autoExecute ? "Auto" : "Manual"}
            </span>
            {autoExecute && (
              <>
                <span style={{ fontSize: 11, color: "var(--border)" }}>·</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
                  {balance.toFixed(1)}
                </span>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2 }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 0",
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 32, fontWeight: 700, color: "var(--text-muted)" }}>?</span>
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
        No markets yet
      </h2>
      <p style={{
        fontSize: 14, color: "var(--text-muted)", marginBottom: 24,
        textAlign: "center", maxWidth: 420, lineHeight: 1.6,
      }}>
        Create the first encrypted prediction market. Positions stay hidden
        until the oracle resolves.
      </p>
      <Link href="/create">
        <button className="btn-primary" style={{ fontSize: 14, padding: "10px 22px" }}>
          Create Market
        </button>
      </Link>
    </motion.div>
  );
}
