"use client";

import { useReadContract, useAccount, useWriteContract } from "wagmi";
import {
  SHADOW_POOL_ABI,
  SHADOW_POOL_ADDRESS,
  CTX_GAS_PAYMENT,
  PRICE_PRECISION,
  ERC20_ABI,
  USDC_ADDRESS,
  DARK_TOKEN_ADDRESS,
} from "@/config/contracts";
import { formatUnits } from "viem";
import { Lock, Zap, Loader2, Shield } from "lucide-react";
import { useState } from "react";

export function TradingPairStats() {
  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [isTriggering, setIsTriggering] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [matchSuccess, setMatchSuccess] = useState("");

  // Read token decimals
  const { data: usdcDecimals } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "decimals",
  });
  const { data: darkDecimals } = useReadContract({
    address: DARK_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "decimals",
  });
  const usdcDec = Number(usdcDecimals ?? 18);
  const darkDec = Number(darkDecimals ?? 18);

  // Aggregate stats
  const { data: stats, refetch: refetchStats } = useReadContract({
    address: SHADOW_POOL_ADDRESS,
    abi: SHADOW_POOL_ABI,
    functionName: "getAggregateStats",
  });

  // Latest settlement
  const { data: settlementCount } = useReadContract({
    address: SHADOW_POOL_ADDRESS,
    abi: SHADOW_POOL_ABI,
    functionName: "getSettlementCount",
  });

  const lastSettlementId =
    settlementCount && Number(settlementCount) > 0
      ? Number(settlementCount) - 1
      : null;

  const { data: lastSettlement } = useReadContract({
    address: SHADOW_POOL_ADDRESS,
    abi: SHADOW_POOL_ABI,
    functionName: "getSettlement",
    args: lastSettlementId !== null ? [BigInt(lastSettlementId)] : undefined,
    query: { enabled: lastSettlementId !== null },
  });

  const pendingBuys = stats ? Number((stats as any)[0]) : 0;
  const pendingSells = stats ? Number((stats as any)[1]) : 0;
  const buyDeposits = stats ? (stats as any)[2] : BigInt(0);
  const sellDeposits = stats ? (stats as any)[3] : BigInt(0);
  const totalSettlements = stats ? Number((stats as any)[4]) : 0;

  const canMatch = pendingBuys > 0 && pendingSells > 0;

  const handleTriggerMatch = async () => {
    setMatchError("");
    setMatchSuccess("");
    setIsTriggering(true);
    try {
      await writeContractAsync({
        address: SHADOW_POOL_ADDRESS,
        abi: SHADOW_POOL_ABI,
        functionName: "triggerMatch",
        value: CTX_GAS_PAYMENT,
      });
      setMatchSuccess(
        "Match triggered! BITE v2 will decrypt orders in the next block..."
      );
      setTimeout(() => {
        refetchStats();
        setMatchSuccess("");
      }, 6000);
    } catch (err: any) {
      setMatchError(
        err?.shortMessage || err?.message || "Failed to trigger match"
      );
    }
    setIsTriggering(false);
  };

  return (
    <div className="bg-card border border-card-border rounded-lg">
      <div className="px-4 py-3 border-b border-card-border">
        <h3 className="text-sm font-semibold">Trading Pair Stats</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Encrypted notice */}
        <div className="flex items-center gap-2 text-xs">
          <Lock className="w-3.5 h-3.5 text-accent" />
          <span className="text-accent font-medium">
            Order book is encrypted
          </span>
        </div>
        <p className="text-xs text-muted -mt-2">
          Only aggregated stats shown for privacy
        </p>

        {/* Stats */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Total Orders</span>
            <span className="font-mono">
              <span className="text-buy">{pendingBuys} buys</span>
              {" / "}
              <span className="text-sell">{pendingSells} sells</span>
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Buy Deposits</span>
            <span className="font-mono">
              {formatUnits(BigInt(buyDeposits || 0), usdcDec)} USDC
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Sell Deposits</span>
            <span className="font-mono">
              {formatUnits(BigInt(sellDeposits || 0), darkDec)} DARK
            </span>
          </div>

          <div className="border-t border-card-border pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Pair Status</span>
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  canMatch
                    ? "bg-buy/20 text-buy"
                    : "bg-card-border text-muted"
                }`}
              >
                {canMatch ? "Ready to Match" : "Awaiting Orders"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Total Settlements</span>
            <span className="font-mono">{totalSettlements}</span>
          </div>

          {/* Last settlement price */}
          {lastSettlement && (lastSettlement as any)[0] > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Last Price</span>
              <span className="font-mono text-accent">
                {(
                  Number((lastSettlement as any)[0]) / Number(PRICE_PRECISION)
                ).toFixed(6)}{" "}
                USDC
              </span>
            </div>
          )}
        </div>

        {/* Match trigger */}
        {isConnected && canMatch && (
          <div className="pt-2">
            <button
              onClick={handleTriggerMatch}
              disabled={isTriggering}
              className="w-full flex items-center justify-center gap-2 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
            >
              {isTriggering ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Trigger Match (0.06 sFUEL)
            </button>
            <p className="text-xs text-muted mt-1.5 text-center">
              Decrypts all orders via BITE v2 CTX and settles atomically
            </p>
          </div>
        )}

        {matchError && (
          <div className="text-xs text-sell bg-sell/10 border border-sell/30 rounded px-3 py-2">
            {matchError}
          </div>
        )}
        {matchSuccess && (
          <div className="text-xs text-buy bg-buy/10 border border-buy/30 rounded px-3 py-2">
            {matchSuccess}
          </div>
        )}

        {/* Privacy info */}
        <div className="border-t border-card-border pt-3 space-y-2">
          <div className="flex items-start gap-2 text-xs text-muted">
            <Shield className="w-3 h-3 mt-0.5 text-accent flex-shrink-0" />
            <span>
              Individual order prices and amounts are hidden. Only aggregate
              counts and deposited volumes are visible.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
