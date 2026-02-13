"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { formatUnits } from "viem";
import { BELIEF_MARKET_ADDRESS, USDC_DECIMALS, PRICE_PRECISION } from "@/config/contracts";
import { BELIEF_MARKET_ABI } from "@/config/beliefMarketAbi";
import { PositionStatus, MarketStatus, ASSET_TYPE_LABELS } from "@/types/market";
import { getDataSourceById, generateMarketQuestion, DataSource } from "@/config/dataSources";
import { fetchPrice, formatPrice } from "@/utils/priceOracle";
import Link from "next/link";
/* eslint-disable @next/next/no-img-element */

// ═══════════════════════════════════════════════════════════════════
// History Page
// ═══════════════════════════════════════════════════════════════════

export default function HistoryPage() {
  const { address, isConnected } = useAccount();

  const { data: positionIds } = useReadContract({
    address: BELIEF_MARKET_ADDRESS,
    abi: BELIEF_MARKET_ABI,
    functionName: "getUserPositionIds",
    args: address ? [address] : undefined,
  });

  const ids = (positionIds as bigint[]) || [];

  // Summary stats
  const [stats, setStats] = useState({ total: 0, won: 0, lost: 0, pending: 0, totalStaked: 0, totalPayout: 0 });

  const updateStats = useCallback((s: { isSettled: boolean; isWin: boolean; deposit: number; payout: number }) => {
    setStats((prev) => ({
      total: prev.total,
      won: prev.won + (s.isSettled && s.isWin ? 1 : 0),
      lost: prev.lost + (s.isSettled && !s.isWin ? 1 : 0),
      pending: prev.pending + (!s.isSettled ? 1 : 0),
      // Only count settled positions in P&L — pending positions haven't won or lost yet
      totalStaked: prev.totalStaked + (s.isSettled ? s.deposit : 0),
      totalPayout: prev.totalPayout + (s.isSettled ? s.payout : 0),
    }));
  }, []);

  useEffect(() => {
    setStats({ total: ids.length, won: 0, lost: 0, pending: 0, totalStaked: 0, totalPayout: 0 });
  }, [ids.length]);

  return (
    <div className="page-container">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: 2 }}>
            History <span style={{ color: "#A76FFA", opacity: 0.5 }}>/</span>
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Your positions across all prediction markets.
          </p>
        </div>

        {!isConnected ? (
          <div style={{
            background: "var(--bg-raised)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)", padding: "56px 24px", textAlign: "center",
          }}>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>Connect your wallet to view history.</p>
          </div>
        ) : ids.length === 0 ? (
          <div style={{
            background: "var(--bg-raised)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)", padding: "56px 24px", textAlign: "center",
          }}>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 12 }}>No positions yet.</p>
            <Link href="/markets">
              <button style={{
                padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)",
                cursor: "pointer",
              }}>
                Browse Markets
              </button>
            </Link>
          </div>
        ) : (
          <>
            {/* Stats Row */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24,
            }}>
              {[
                { label: "Positions", value: ids.length.toString(), accent: true },
                { label: "Won", value: stats.won.toString(), accent: false },
                { label: "Lost", value: stats.lost.toString(), accent: false },
                { label: "Pending", value: stats.pending.toString(), accent: false },
                { label: "Net P&L", value: `${(stats.totalPayout - stats.totalStaked) >= 0 ? "+" : ""}${(stats.totalPayout - stats.totalStaked).toFixed(2)}`, accent: false },
              ].map((s) => (
                <div key={s.label} style={{
                  background: s.accent ? "rgba(167, 111, 250, 0.04)" : "var(--bg-raised)",
                  border: `1px solid ${s.accent ? "rgba(167, 111, 250, 0.12)" : "var(--border)"}`,
                  borderRadius: "var(--radius-md)", padding: "14px 16px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--font-mono), monospace", color: s.accent ? "#A76FFA" : "var(--text-primary)", marginBottom: 2 }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Position List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...ids].reverse().map((id, index) => (
                <HistoryRow
                  key={id.toString()}
                  positionId={Number(id)}
                  index={index}
                  onStatsReady={updateStats}
                />
              ))}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// History Row — rich card with asset image, resolve time, live audit
// ═══════════════════════════════════════════════════════════════════

function HistoryRow({
  positionId,
  index,
  onStatsReady,
}: {
  positionId: number;
  index: number;
  onStatsReady: (s: { isSettled: boolean; isWin: boolean; deposit: number; payout: number }) => void;
}) {
  const { data: posData } = useReadContract({
    address: BELIEF_MARKET_ADDRESS,
    abi: BELIEF_MARKET_ABI,
    functionName: "getPosition",
    args: [BigInt(positionId)],
  });

  const { data: marketData } = useReadContract({
    address: BELIEF_MARKET_ADDRESS,
    abi: BELIEF_MARKET_ABI,
    functionName: "getMarket",
    args: posData ? [posData.marketId] : undefined,
  });

  // Live price audit
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  const source = marketData ? getDataSourceById(Number(marketData.dataSourceId)) : undefined;

  // Report stats upward
  useEffect(() => {
    if (posData && marketData) {
      const deposit = Number(formatUnits(posData.deposit, USDC_DECIMALS));
      const payout = Number(formatUnits(posData.payout, USDC_DECIMALS));
      const isSettled = posData.status === PositionStatus.SETTLED;
      const isWin = isSettled && posData.direction === marketData.outcome && posData.payout > BigInt(0);
      onStatsReady({ isSettled, isWin, deposit, payout });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posData?.deposit, marketData?.outcome]);

  async function handleAudit() {
    if (!source) return;
    setAuditing(true);
    try {
      const result = await fetchPrice(source);
      if (result.success) {
        setLivePrice(result.price);
      }
    } catch { /* ignore */ }
    setAuditing(false);
    setShowAudit(true);
  }

  if (!posData || !marketData) {
    return (
      <div style={{
        background: "var(--bg-raised)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: "18px 20px",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 14, width: "60%", marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 12, width: "40%" }} />
        </div>
        <div className="skeleton" style={{ height: 28, width: 80 }} />
      </div>
    );
  }

  const targetPrice = Number(marketData.targetPrice) / Number(PRICE_PRECISION);
  const question = source
    ? generateMarketQuestion(source, targetPrice, marketData.conditionAbove)
    : `Market #${Number(posData.marketId)}`;

  const deposit = formatUnits(posData.deposit, USDC_DECIMALS);
  const payout = formatUnits(posData.payout, USDC_DECIMALS);
  const depositNum = Number(deposit);
  const payoutNum = Number(payout);
  const status = posData.status as PositionStatus;
  const marketStatus = marketData.status as MarketStatus;
  const isSettled = status === PositionStatus.SETTLED;
  const isWin = isSettled && posData.direction === marketData.outcome && posData.payout > BigInt(0);
  const isLoss = isSettled && posData.payout === BigInt(0);
  const isRefunded = status === PositionStatus.REFUNDED;

  const resolutionTime = Number(marketData.resolutionTime);
  const resolveDate = new Date(resolutionTime * 1000);
  const now = Date.now();
  const isExpired = now >= resolutionTime * 1000;

  // Time formatting
  function formatRelativeTime(ts: number): string {
    const diffMs = ts * 1000 - now;
    if (diffMs <= 0) {
      // In the past
      const ago = Math.abs(diffMs);
      if (ago < 60000) return "just now";
      if (ago < 3600000) return `${Math.floor(ago / 60000)}m ago`;
      if (ago < 86400000) return `${Math.floor(ago / 3600000)}h ago`;
      return `${Math.floor(ago / 86400000)}d ago`;
    }
    // In the future
    if (diffMs < 3600000) return `in ${Math.floor(diffMs / 60000)}m`;
    if (diffMs < 86400000) return `in ${Math.floor(diffMs / 3600000)}h`;
    return `in ${Math.floor(diffMs / 86400000)}d`;
  }

  const statusLabel = isSettled
    ? isWin
      ? "Won"
      : isLoss
      ? "Lost"
      : "Settled"
    : isRefunded
    ? "Refunded"
    : marketStatus === MarketStatus.RESOLVING
    ? "Resolving"
    : "Open";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
    >
      <div style={{
        background: "var(--bg-raised)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", overflow: "hidden",
        transition: "border-color 200ms",
      }}>
        {/* Main Row */}
        <Link href={`/market/${Number(posData.marketId)}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div style={{
            padding: "16px 20px",
            display: "flex", alignItems: "center", gap: 16,
            cursor: "pointer",
          }}>
            {/* Asset Image */}
            <div style={{
              width: 44, height: 44, borderRadius: 10, flexShrink: 0,
              background: "var(--bg)", border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
            }}>
              {source?.icon ? (
                <img
                  src={source.icon}
                  alt={source.name}
                  width={32}
                  height={32}
                  style={{ objectFit: "contain" }}
                />
              ) : (
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text-muted)" }}>?</span>
              )}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, lineHeight: 1.3 }}>
                {question}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {/* Direction badge */}
                {isSettled ? (
                  <span style={{
                    padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                    color: "var(--text-secondary)", background: "var(--bg)", border: "1px solid var(--border)",
                  }}>
                    {posData.direction ? "YES" : "NO"}
                  </span>
                ) : (
                  <span style={{
                    padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 500,
                    color: "#A76FFA", background: "rgba(167, 111, 250, 0.06)", border: "1px solid rgba(167, 111, 250, 0.15)",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Encrypted
                  </span>
                )}

                {/* Category */}
                {source && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {source.category.charAt(0).toUpperCase() + source.category.slice(1)}
                  </span>
                )}

                <span style={{ fontSize: 11, color: "var(--border)" }}>·</span>

                {/* Stake */}
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
                  {Number(deposit).toFixed(2)} USDC
                </span>

                <span style={{ fontSize: 11, color: "var(--border)" }}>·</span>

                {/* Resolve time */}
                <span style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                  {isExpired ? "Resolved " : "Resolves "}{formatRelativeTime(resolutionTime)}
                </span>
              </div>
            </div>

            {/* Outcome / P&L */}
            <div style={{ textAlign: "right", flexShrink: 0, minWidth: 90 }}>
              {isSettled ? (
                <>
                  <div style={{
                    fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono), monospace",
                    color: "var(--text-primary)", marginBottom: 2,
                  }}>
                    {isWin ? `+${Number(payout).toFixed(2)}` : isLoss ? `-${Number(deposit).toFixed(2)}` : Number(payout).toFixed(2)}
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>USDC</span>
                </>
              ) : isRefunded ? (
                <>
                  <div style={{
                    fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono), monospace",
                    color: "var(--text-muted)", marginBottom: 2,
                  }}>
                    {Number(deposit).toFixed(2)}
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Refunded</span>
                </>
              ) : (
                <div style={{
                  fontSize: 12, fontWeight: 500, color: "var(--text-muted)",
                }}>
                  {statusLabel}
                </div>
              )}
            </div>

            {/* Status pip */}
            <div style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: isSettled
                ? isWin ? "#A76FFA" : "var(--text-muted)"
                : !isExpired ? "rgba(167, 111, 250, 0.3)" : "var(--border)",
              opacity: isSettled ? 1 : 0.6,
            }} />
          </div>
        </Link>

        {/* Audit Bar */}
        <div style={{
          padding: "0 20px 12px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Exchange badge */}
            {source?.exchange && (
              <span style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                {source.exchange.icon && (
                  <img src={source.exchange.icon} alt="" width={12} height={12} style={{ opacity: 0.6 }} />
                )}
                {source.exchange.name}
              </span>
            )}

            {/* Target price */}
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
              Target: ${targetPrice.toLocaleString()}
            </span>

            {/* Resolve date */}
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {resolveDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              {" "}
              {resolveDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          {/* Audit button */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleAudit();
            }}
            disabled={auditing}
            style={{
              padding: "3px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600,
              cursor: auditing ? "wait" : "pointer",
              background: "rgba(167, 111, 250, 0.06)", color: "#A76FFA", border: "1px solid rgba(167, 111, 250, 0.2)",
              transition: "all 150ms", display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
            </svg>
            {auditing ? "Fetching..." : "Live Audit"}
          </button>
        </div>

        {/* Audit Expansion */}
        <AnimatePresence>
          {showAudit && livePrice !== null && source && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div style={{
                padding: "12px 20px", borderTop: "1px solid var(--border)",
                background: "var(--bg)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Live Price (DIA Oracle)
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono), monospace", color: "#A76FFA" }}>
                      ${formatPrice(livePrice)}
                    </div>
                  </div>

                  <div style={{ width: 1, height: 28, background: "var(--border)" }} />

                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Target Price
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)" }}>
                      ${targetPrice.toLocaleString()}
                    </div>
                  </div>

                  <div style={{ width: 1, height: 28, background: "var(--border)" }} />

                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Distance
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-mono), monospace", color: "var(--text-secondary)" }}>
                      {targetPrice > 0 ? `${(((livePrice - targetPrice) / targetPrice) * 100).toFixed(2)}%` : "—"}
                    </div>
                  </div>

                  <div style={{ width: 1, height: 28, background: "var(--border)" }} />

                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Condition
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                      {marketData.conditionAbove ? "Above" : "Below"} target
                    </div>
                  </div>

                  <div style={{ width: 1, height: 28, background: "var(--border)" }} />

                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Currently Met?
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                      {(marketData.conditionAbove ? livePrice > targetPrice : livePrice < targetPrice) ? "Yes" : "No"}
                    </div>
                  </div>
                </div>

                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAudit(false); }}
                  style={{
                    padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 500,
                    background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
