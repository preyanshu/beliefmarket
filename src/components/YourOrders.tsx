"use client";

import { useAccount, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import {
  SHADOW_POOL_ABI,
  SHADOW_POOL_ADDRESS,
  PRICE_PRECISION,
  ERC20_ABI,
  USDC_ADDRESS,
  DARK_TOKEN_ADDRESS,
} from "@/config/contracts";
import { formatUnits } from "viem";
import {
  OrderStatus,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
} from "@/types/pool";
import { Lock, Loader2, X } from "lucide-react";
import { useState } from "react";

export function YourOrders() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [cancellingId, setCancellingId] = useState<number | null>(null);

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
  const usdcDec = Number(usdcDecimals ?? 6);
  const darkDec = Number(darkDecimals ?? 18);

  // Get user's order IDs
  const { data: orderIds } = useReadContract({
    address: SHADOW_POOL_ADDRESS,
    abi: SHADOW_POOL_ABI,
    functionName: "getUserOrders",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Fetch each order
  const { data: orderResults, refetch } = useReadContracts({
    contracts: ((orderIds as bigint[]) || []).map((id) => ({
      address: SHADOW_POOL_ADDRESS,
      abi: SHADOW_POOL_ABI,
      functionName: "getOrder" as const,
      args: [id],
    })),
    query: { enabled: !!orderIds && (orderIds as bigint[]).length > 0 },
  });

  const handleCancel = async (orderId: number) => {
    setCancellingId(orderId);
    try {
      await writeContractAsync({
        address: SHADOW_POOL_ADDRESS,
        abi: SHADOW_POOL_ABI,
        functionName: "cancelOrder",
        args: [BigInt(orderId)],
      });
      setTimeout(() => refetch(), 3000);
    } catch (err: any) {
      console.error("Cancel error:", err);
    }
    setCancellingId(null);
  };

  if (!isConnected) {
    return (
      <div className="bg-card border border-card-border rounded-lg">
        <div className="px-4 py-3 border-b border-card-border">
          <h3 className="text-sm font-semibold">Your Orders</h3>
        </div>
        <div className="p-4 text-center">
          <p className="text-sm text-muted">Not connected</p>
          <p className="text-xs text-muted mt-1">
            Connect wallet to view your orders
          </p>
        </div>
      </div>
    );
  }

  const orders = ((orderIds as bigint[]) || [])
    .map((id, index) => {
      if (!orderResults || !orderResults[index]) return null;
      const result = orderResults[index];
      if (result.status !== "success" || !result.result) return null;
      const d = result.result as any;
      return {
        id: Number(id),
        trader: d[0] || d.trader,
        isBuy: d[1] ?? d.isBuy,
        deposit: d[2] || d.deposit,
        status: Number(d[4] ?? d.status),
        createdAt: d[5] || d.createdAt,
        settledPrice: d[6] || d.settledPrice,
        settledAmount: d[7] || d.settledAmount,
      };
    })
    .filter(Boolean)
    .reverse(); // Newest first

  return (
    <div className="bg-card border border-card-border rounded-lg">
      <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
        <h3 className="text-sm font-semibold">Your Orders</h3>
        <span className="text-xs text-muted">{orders.length} orders</span>
      </div>

      <div className="max-h-[300px] overflow-y-auto">
        {orders.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-sm text-muted">No orders yet</p>
            <p className="text-xs text-muted mt-1">
              Submit an order to start trading
            </p>
          </div>
        ) : (
          <div className="divide-y divide-card-border/50">
            {orders.map(
              (order) =>
                order && (
                  <div
                    key={order.id}
                    className="px-4 py-3 text-xs flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold ${
                            order.isBuy ? "text-buy" : "text-sell"
                          }`}
                        >
                          {order.isBuy ? "BUY" : "SELL"}
                        </span>
                        <span className="text-muted">#{order.id}</span>
                        <span
                          className={
                            ORDER_STATUS_COLORS[
                              order.status as OrderStatus
                            ] || "text-muted"
                          }
                        >
                          {ORDER_STATUS_LABELS[
                            order.status as OrderStatus
                          ] || "Unknown"}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-muted">
                        <span>
                          Deposit:{" "}
                          <span className="text-foreground font-mono">
                            {formatUnits(BigInt(order.deposit || 0), order.isBuy ? usdcDec : darkDec)}
                          </span>{" "}
                          {order.isBuy ? "USDC" : "DARK"}
                        </span>

                        {order.status === OrderStatus.PENDING && (
                          <span className="flex items-center gap-1 text-accent">
                            <Lock className="w-3 h-3" />
                            Encrypted
                          </span>
                        )}
                      </div>

                      {/* Show settlement details if matched */}
                      {order.status === OrderStatus.MATCHED &&
                        order.settledPrice > 0 && (
                          <div className="text-muted">
                            Filled at{" "}
                            <span className="text-foreground font-mono">
                              {(
                                Number(order.settledPrice) /
                                Number(PRICE_PRECISION)
                              ).toFixed(6)}
                            </span>{" "}
                            USDC —{" "}
                            <span className="text-foreground font-mono">
                              {formatUnits(
                                BigInt(order.settledAmount || 0),
                                darkDec
                              )}
                            </span>{" "}
                            DARK
                          </div>
                        )}
                    </div>

                    {/* Cancel button for pending orders */}
                    {order.status === OrderStatus.PENDING && (
                      <button
                        onClick={() => handleCancel(order.id)}
                        disabled={cancellingId === order.id}
                        className="p-1.5 hover:bg-sell/10 rounded transition-colors text-muted hover:text-sell"
                        title="Cancel order"
                      >
                        {cancellingId === order.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <X className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
