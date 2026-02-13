"use client";

import { Header } from "@/components/Header";
import { useReadContract, useReadContracts } from "wagmi";
import {
  SHADOW_POOL_ABI,
  SHADOW_POOL_ADDRESS,
  PRICE_PRECISION,
} from "@/config/contracts";
import { formatUnits } from "viem";
import { Clock, TrendingUp, BarChart3, Shield, Lock } from "lucide-react";

export default function HistoryPage() {
  const { data: settlementCount } = useReadContract({
    address: SHADOW_POOL_ADDRESS,
    abi: SHADOW_POOL_ABI,
    functionName: "getSettlementCount",
  });

  const count = Number(settlementCount || 0);
  const ids = Array.from({ length: count }, (_, i) => BigInt(i)).reverse();

  const { data: settlementResults } = useReadContracts({
    contracts: ids.map((id) => ({
      address: SHADOW_POOL_ADDRESS,
      abi: SHADOW_POOL_ABI,
      functionName: "getSettlement" as const,
      args: [id],
    })),
    query: { enabled: ids.length > 0 },
  });

  const settlements = ids
    .map((id, index) => {
      if (!settlementResults || !settlementResults[index]) return null;
      const r = settlementResults[index];
      if (r.status !== "success" || !r.result) return null;
      const d = r.result as any;
      return {
        id: Number(id),
        clearingPrice: d[0],
        matchedVolume: d[1],
        totalTrades: Number(d[2]),
        timestamp: d[3],
      };
    })
    .filter(Boolean);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">Settlement History</h1>
          <p className="text-sm text-muted">
            Past batch settlements from the sealed dark pool. Individual order
            details remain private — only clearing prices and volumes are shown.
          </p>
        </div>

        {/* Privacy notice */}
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 mb-6 flex items-start gap-3">
          <Shield className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-accent font-medium mb-1">
              Privacy-Preserving Settlement Records
            </p>
            <p className="text-muted text-xs">
              Each settlement shows the uniform clearing price and total matched
              volume. Individual trader orders, prices, and amounts are never
              published — they were decrypted and matched atomically inside a
              single BITE v2 CTX callback.
            </p>
          </div>
        </div>

        {settlements.length === 0 ? (
          <div className="bg-card border border-card-border rounded-lg p-12 text-center">
            <BarChart3 className="w-12 h-12 text-muted mx-auto mb-3" />
            <h2 className="text-lg font-semibold mb-1">No Settlements Yet</h2>
            <p className="text-sm text-muted">
              Settlements will appear here after encrypted orders are matched.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {settlements.map(
              (s) =>
                s && (
                  <div
                    key={s.id}
                    className="bg-card border border-card-border rounded-lg p-5"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono text-muted">
                            Settlement #{s.id}
                          </span>
                          <span className="text-xs text-buy bg-buy/10 px-2 py-0.5 rounded">
                            Settled
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-6 text-sm">
                          <div>
                            <span className="text-muted block text-xs mb-0.5">
                              Clearing Price
                            </span>
                            <span className="font-mono text-accent font-semibold">
                              {(
                                Number(s.clearingPrice) /
                                Number(PRICE_PRECISION)
                              ).toFixed(6)}{" "}
                              USDC
                            </span>
                          </div>

                          <div>
                            <span className="text-muted block text-xs mb-0.5">
                              Volume Matched
                            </span>
                            <span className="font-mono">
                              {formatUnits(
                                BigInt(s.matchedVolume || 0),
                                18
                              )}{" "}
                              DARK
                            </span>
                          </div>

                          <div>
                            <span className="text-muted block text-xs mb-0.5">
                              Trades
                            </span>
                            <span className="font-mono">{s.totalTrades}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right text-xs text-muted">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {new Date(
                          Number(s.timestamp) * 1000
                        ).toLocaleString()}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-card-border/50 flex items-center gap-2 text-xs text-muted">
                      <Lock className="w-3 h-3 text-accent" />
                      <span>
                        Individual order details were encrypted and decrypted
                        atomically via BITE v2 threshold decryption
                      </span>
                    </div>
                  </div>
                )
            )}
          </div>
        )}
      </main>
    </div>
  );
}
