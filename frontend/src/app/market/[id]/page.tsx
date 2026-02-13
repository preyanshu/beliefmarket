"use client";

import { use } from "react";
import { useReadContract, useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { formatUnits } from "viem";
import { BELIEF_MARKET_ADDRESS, USDC_DECIMALS, CTX_GAS_PAYMENT } from "@/config/contracts";
import { BELIEF_MARKET_ABI } from "@/config/beliefMarketAbi";
import { Market, MarketStatus, ASSET_TYPE_LABELS, STATUS_LABELS } from "@/types/market";
import { getDataSourceById, generateMarketQuestion } from "@/config/dataSources";
import { SubmitPosition } from "@/components/SubmitPosition";
import { PositionList } from "@/components/PositionList";
import { PriceChart } from "@/components/PriceChart";
import { PoolDistribution } from "@/components/PoolDistribution";
import { PRICE_PRECISION } from "@/config/contracts";
import { useState, useEffect } from "react";
import { fetchPrice, formatPrice } from "@/utils/priceOracle";
import Link from "next/link";

export default function MarketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const marketId = Number(id);
  const { address } = useAccount();

  const { data } = useReadContract({
    address: BELIEF_MARKET_ADDRESS,
    abi: BELIEF_MARKET_ABI,
    functionName: "getMarket",
    args: [BigInt(marketId)],
  });

  const [livePrice, setLivePrice] = useState<number | null>(null);

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

  const source = market ? getDataSourceById(market.dataSourceId) : null;
  const targetPrice = market
    ? Number(market.targetPrice) / Number(PRICE_PRECISION)
    : 0;

  useEffect(() => {
    if (!source) return;
    const fetch_ = async () => {
      const result = await fetchPrice(source);
      if (result.success) setLivePrice(result.price);
    };
    fetch_();
    const interval = setInterval(fetch_, 30000);
    return () => clearInterval(interval);
  }, [source]);

  if (!market) {
    return (
      <div className="page-container">
        <div className="card" style={{ maxWidth: 800, margin: "0 auto", padding: 40 }}>
          <div className="skeleton" style={{ height: 32, width: 320, marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 20, width: "100%", marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 20, width: "75%" }} />
        </div>
      </div>
    );
  }

  const question = source
    ? generateMarketQuestion(source, targetPrice, market.conditionAbove)
    : `Market #${marketId}`;

  const isOpen = market.status === MarketStatus.OPEN;
  const isSettled = market.status === MarketStatus.SETTLED;
  const isExpired = Number(market.resolutionTime) * 1000 <= Date.now();
  const isCreator = address?.toLowerCase() === market.creator.toLowerCase();
  const canResolve = isCreator && isOpen && isExpired;

  // YES/NO probability circles (for settled markets)
  const yesNum = Number(formatUnits(market.yesPool, USDC_DECIMALS));
  const noNum = Number(formatUnits(market.noPool, USDC_DECIMALS));
  const poolTotal = yesNum + noNum;
  const yesPercent = poolTotal > 0 ? Math.round((yesNum / poolTotal) * 100) : 50;
  const noPercent = poolTotal > 0 ? 100 - yesPercent : 50;

  return (
    <div className="page-container">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Back link */}
        <Link
          href="/markets"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--text-muted)",
            fontSize: 14,
            fontWeight: 500,
            marginBottom: 24,
            textDecoration: "none",
          }}
        >
          &larr; Back to Markets
        </Link>

        {/* Title section with prob circles */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 32, marginBottom: 32 }}>
          <div style={{ flex: 1 }}>
            {/* Badges */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              {source && (
                <span className="badge badge-accent">
                  {ASSET_TYPE_LABELS[source.assetType]}
                </span>
              )}
              {isOpen && !isExpired && (
                <span className="badge badge-live">
                  <span className="pulse-dot" />
                  Live
                </span>
              )}
              {!isOpen && (
                <span className="badge" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                  {STATUS_LABELS[market.status]}
                </span>
              )}
            </div>

            <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: 6 }}>{question}</h1>

            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Created by{" "}
              <span style={{ fontFamily: "var(--font-mono), monospace", color: "var(--text-secondary)" }}>
                {market.creator.slice(0, 6)}...{market.creator.slice(-4)}
              </span>
              <span style={{ margin: "0 10px", color: "var(--border)" }}>|</span>
              <span>
                Resolves {new Date(Number(market.resolutionTime) * 1000).toLocaleString()}
              </span>
            </p>
          </div>

          {/* YES / NO probability circles */}
          {isSettled && poolTotal > 0 && (
            <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
              <div
                className="prob-circle"
                style={{
                  background: market.outcome ? "var(--yes-dim)" : "var(--bg-elevated)",
                  color: "var(--yes)",
                  border: market.outcome ? "2px solid var(--yes)" : "1px solid var(--border)",
                }}
              >
                {yesPercent}%
                <span className="prob-circle-label">YES</span>
              </div>
              <div
                className="prob-circle"
                style={{
                  background: !market.outcome ? "var(--no-dim)" : "var(--bg-elevated)",
                  color: "var(--no)",
                  border: !market.outcome ? "2px solid var(--no)" : "1px solid var(--border)",
                }}
              >
                {noPercent}%
                <span className="prob-circle-label">NO</span>
              </div>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
          {[
            { label: "Total Pool", value: formatUnits(market.totalDeposits, USDC_DECIMALS), unit: "USDC" },
            { label: "Positions", value: market.totalPositions.toString() },
            { label: "Target Price", value: `$${formatPrice(targetPrice)}` },
            {
              label: livePrice !== null ? "Live Price" : "Resolution Date",
              value: livePrice !== null ? `$${formatPrice(livePrice)}` : new Date(Number(market.resolutionTime) * 1000).toLocaleDateString(),
              color: livePrice !== null ? "var(--yes)" : undefined,
            },
          ].map((stat) => (
            <div key={stat.label} style={{
              background: "var(--bg-raised)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)", padding: "16px 20px",
            }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>{stat.label}</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{
                  fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em",
                  fontFamily: "var(--font-mono), monospace",
                  color: stat.color || "var(--text-primary)",
                }}>{stat.value}</span>
                {stat.unit && <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>{stat.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Chart (left ~65%) + Execution Swap (right ~35%) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, marginBottom: 32, alignItems: "stretch" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {source ? (
              <PriceChart
                source={source}
                targetPrice={targetPrice}
                conditionAbove={market.conditionAbove}
              />
            ) : (
              <div className="card" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p className="text-body" style={{ color: "var(--text-muted)" }}>No price feed available</p>
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <SubmitPosition market={market} />
          </div>
        </div>

        {/* Settlement Receipt */}
        {isSettled && <SettlementReceipt market={market} />}

        {/* Positions (left) + Pool Distribution (right) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "stretch" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <PositionList marketId={marketId} marketStatus={market.status} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <PoolDistribution
              yesPool={market.yesPool}
              noPool={market.noPool}
              totalDeposits={market.totalDeposits}
              totalPositions={market.totalPositions}
              isSettled={isSettled}
              outcome={market.outcome}
            />
          </div>
        </div>

        {/* Resolve */}
        {canResolve && (
          <div style={{ marginTop: 32 }}>
            <ResolveSection marketId={marketId} />
          </div>
        )}
      </motion.div>
    </div>
  );
}

function SettlementReceipt({ market }: { market: Market }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="card"
      style={{
        marginBottom: 32,
        borderColor: market.outcome ? "var(--yes)" : "var(--no)",
        padding: 28,
      }}
    >
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>Settlement Receipt</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Outcome</span>
          <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono), monospace", color: market.outcome ? "var(--yes)" : "var(--no)" }}>
            {market.outcome ? "YES" : "NO"}
          </span>
        </div>
        <div>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>YES Pool</span>
          <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono), monospace", color: "var(--text-primary)" }}>{formatUnits(market.yesPool, USDC_DECIMALS)}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>USDC</span>
        </div>
        <div>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>NO Pool</span>
          <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono), monospace", color: "var(--text-primary)" }}>{formatUnits(market.noPool, USDC_DECIMALS)}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>USDC</span>
        </div>
      </div>
    </motion.div>
  );
}

function ResolveSection({ marketId }: { marketId: number }) {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<boolean>(true);

  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
    }
  }, [isSuccess, queryClient]);

  function handleResolve() {
    writeContract({
      address: BELIEF_MARKET_ADDRESS,
      abi: BELIEF_MARKET_ABI,
      functionName: "resolveMarket",
      args: [BigInt(marketId), outcome],
      value: CTX_GAS_PAYMENT,
    });
  }

  return (
    <div style={{
      background: "var(--bg-raised)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)", padding: 24,
    }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Resolve Market</h3>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
        As the market creator, submit the oracle outcome. This triggers BITE v2 CTX
        to decrypt all positions atomically and settle payouts.
      </p>

      <div style={{ marginBottom: 20 }}>
        <span className="text-caption" style={{ display: "block", marginBottom: 8 }}>Oracle Outcome</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setOutcome(true)}
            style={{
              flex: 1,
              padding: "14px 0",
              borderRadius: "var(--radius-md)",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              background: outcome ? "var(--yes-dim)" : "var(--bg)",
              color: outcome ? "var(--yes)" : "var(--text-muted)",
              border: `1px solid ${outcome ? "var(--yes)" : "var(--border)"}`,
            }}
          >
            YES
          </button>
          <button
            onClick={() => setOutcome(false)}
            style={{
              flex: 1,
              padding: "14px 0",
              borderRadius: "var(--radius-md)",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              background: !outcome ? "var(--no-dim)" : "var(--bg)",
              color: !outcome ? "var(--no)" : "var(--text-muted)",
              border: `1px solid ${!outcome ? "var(--no)" : "var(--border)"}`,
            }}
          >
            NO
          </button>
        </div>
      </div>

      <button
        onClick={handleResolve}
        disabled={isPending || isConfirming}
        className="btn-primary"
        style={{ width: "100%" }}
      >
        {isPending ? "Confirm in Wallet..." : isConfirming ? "Resolving..." : isSuccess ? "Resolved" : "Resolve & Decrypt All Positions"}
      </button>

      {isSuccess && (
        <p className="text-body" style={{ marginTop: 16, textAlign: "center", color: "var(--yes)" }}>
          Market resolved. Positions decrypted via CTX.
        </p>
      )}
    </div>
  );
}
