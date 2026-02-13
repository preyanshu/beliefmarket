"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { parseUnits } from "viem";
import { BELIEF_MARKET_ADDRESS, PRICE_PRECISION } from "@/config/contracts";
import { BELIEF_MARKET_ABI } from "@/config/beliefMarketAbi";
import {
  DATA_SOURCES,
  DataSource,
  getDataSourcesByCategory,
  generateMarketQuestion,
} from "@/config/dataSources";
import { fetchPrice, formatPrice } from "@/utils/priceOracle";

type CategoryFilter = "all" | "commodity" | "etf" | "fx";

export default function CreateMarketPage() {
  const router = useRouter();
  const { isConnected } = useAccount();

  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const [targetPrice, setTargetPrice] = useState("");
  const [conditionAbove, setConditionAbove] = useState(true);
  const [durationHours, setDurationHours] = useState("24");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [livePrices, setLivePrices] = useState<Record<number, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(true);

  const queryClient = useQueryClient();
  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
    }
  }, [isSuccess, queryClient]);

  // Fetch live prices for all sources on mount
  useEffect(() => {
    async function loadPrices() {
      setLoadingPrices(true);
      const results = await Promise.allSettled(
        DATA_SOURCES.map(async (src) => {
          const r = await fetchPrice(src);
          return { id: src.id, price: r.price };
        })
      );
      const prices: Record<number, number> = {};
      results.forEach((r) => {
        if (r.status === "fulfilled") {
          prices[r.value.id] = r.value.price;
        }
      });
      setLivePrices(prices);
      setLoadingPrices(false);
    }
    loadPrices();
  }, []);

  const filteredSources = category === "all"
    ? DATA_SOURCES
    : getDataSourcesByCategory(category);

  const resolutionTime = Math.floor(
    Date.now() / 1000 + Number(durationHours || 0) * 3600
  );

  const question =
    selectedSource && targetPrice
      ? generateMarketQuestion(selectedSource, Number(targetPrice), conditionAbove)
      : null;

  async function handleCreate() {
    if (!selectedSource || !targetPrice) return;
    const targetPriceScaled = parseUnits(targetPrice, 6);
    writeContract({
      address: BELIEF_MARKET_ADDRESS,
      abi: BELIEF_MARKET_ABI,
      functionName: "createMarket",
      args: [
        BigInt(selectedSource.id),
        targetPriceScaled,
        conditionAbove,
        selectedSource.assetType,
        BigInt(resolutionTime),
      ],
    });
  }

  if (isSuccess) {
    setTimeout(() => router.push("/markets"), 1500);
  }

  const CATEGORIES: { key: CategoryFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: DATA_SOURCES.length },
    { key: "commodity", label: "Commodities", count: getDataSourcesByCategory("commodity").length },
    { key: "etf", label: "ETFs", count: getDataSourcesByCategory("etf").length },
    { key: "fx", label: "FX Rates", count: getDataSourcesByCategory("fx").length },
  ];

  return (
    <div className="page-container" style={{ maxWidth: 1040 }}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: 2 }}>
            Create Market <span style={{ color: "#A76FFA", opacity: 0.5 }}>/</span>
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Pick an oracle-backed data source. All positions are encrypted until resolution.
          </p>
        </div>

        {/* Two-column layout: Source picker | Config */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "start" }}>

          {/* ─── Left: Source Picker ─── */}
          <div>
            {/* Category Tabs */}
            <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => { setCategory(cat.key); setSelectedSource(null); }}
                  style={{
                    padding: "5px 14px", fontSize: 12, fontWeight: 500, borderRadius: 8, cursor: "pointer",
                    color: category === cat.key ? "var(--text-primary)" : "var(--text-muted)",
                    background: category === cat.key ? "rgba(167, 111, 250, 0.06)" : "transparent",
                    border: category === cat.key ? "1px solid rgba(167, 111, 250, 0.15)" : "1px solid transparent",
                    transition: "all 200ms",
                  }}
                >
                  {cat.label} <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 2 }}>{cat.count}</span>
                </button>
              ))}
            </div>

            {/* Sources Grid */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
              gap: 10, maxHeight: 600, overflowY: "auto", paddingRight: 4,
            }}>
              {filteredSources.map((src, i) => {
                const isSelected = selectedSource?.id === src.id;
                const price = livePrices[src.id];

                return (
                  <motion.button
                    key={src.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02, duration: 0.2 }}
                    onClick={() => {
                      setSelectedSource(src);
                      // Pre-fill target price with current price rounded
                      if (price) {
                        setTargetPrice(price >= 1 ? Math.round(price).toString() : price.toFixed(4));
                      }
                    }}
                    style={{
                      display: "flex", flexDirection: "column", gap: 0,
                      padding: "14px 14px 12px", borderRadius: 10, cursor: "pointer",
                      textAlign: "left", transition: "all 200ms",
                      background: isSelected ? "rgba(167, 111, 250, 0.05)" : "var(--bg-raised)",
                      border: `1px solid ${isSelected ? "rgba(167, 111, 250, 0.3)" : "var(--border)"}`,
                      boxShadow: isSelected ? "0 0 0 1px rgba(167, 111, 250, 0.08)" : "none",
                    }}
                  >
                    {/* Top row: Icon + Price */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                        background: "var(--bg)", border: "1px solid var(--border)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        overflow: "hidden",
                      }}>
                        <img src={src.icon} alt={src.name} width={26} height={26} style={{ objectFit: "contain" }} />
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        {loadingPrices ? (
                          <div className="skeleton" style={{ width: 48, height: 14, borderRadius: 4 }} />
                        ) : price ? (
                          <span style={{
                            fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono), monospace",
                            color: isSelected ? "#A76FFA" : "var(--text-primary)",
                          }}>
                            ${formatPrice(price)}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>
                        )}
                      </div>
                    </div>

                    {/* Name */}
                    <div style={{
                      fontSize: 13, fontWeight: 600, lineHeight: 1.2, marginBottom: 3,
                      color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {src.name}
                    </div>

                    {/* Symbol + Exchange */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)" }}>
                        {src.symbol}
                      </span>
                      {src.exchange && (
                        <>
                          <span style={{ fontSize: 11, color: "var(--border)" }}>·</span>
                          <span style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 3 }}>
                            {src.exchange.icon && (
                              <img src={src.exchange.icon} alt="" width={10} height={10} style={{ opacity: 0.5 }} />
                            )}
                            {src.exchange.name}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Description */}
                    <div style={{
                      fontSize: 10.5, lineHeight: 1.4, color: "var(--text-muted)",
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                      overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {src.description}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
              {DATA_SOURCES.length} sources · All powered by DIA oracles
            </p>
          </div>

          {/* ─── Right: Config Panel ─── */}
          <div style={{
            background: "var(--bg-raised)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)", padding: 24,
            position: "sticky", top: 80,
            marginTop: 38,
          }}>
            {/* Selected source summary */}
            {selectedSource ? (
              <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: "var(--bg)", border: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden",
                  }}>
                    <img src={selectedSource.icon} alt="" width={32} height={32} style={{ objectFit: "contain" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{selectedSource.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
                        {selectedSource.symbol}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--border)" }}>·</span>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono), monospace", color: "#A76FFA" }}>
                        ${livePrices[selectedSource.id] ? formatPrice(livePrices[selectedSource.id]) : formatPrice(selectedSource.defaultPrice)}
                      </span>
                    </div>
                  </div>
                </div>
                <p style={{
                  fontSize: 11.5, lineHeight: 1.5, color: "var(--text-muted)",
                  margin: 0,
                }}>
                  {selectedSource.description}
                </p>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "20px 0 24px", borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Select a data source to begin</p>
              </div>
            )}

            {/* Target Price */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                Target Price (USD)
              </label>
              <input
                type="number"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder={selectedSource ? `e.g. ${Math.round(selectedSource.defaultPrice)}` : "Select a source first"}
                className="input"
                step="any"
                disabled={!selectedSource}
                style={{ fontSize: 15, fontFamily: "var(--font-mono), monospace" }}
              />
            </div>

            {/* Condition */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                Condition
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { val: true, label: "Above" },
                  { val: false, label: "Below" },
                ].map((opt) => (
                  <button
                    key={String(opt.val)}
                    onClick={() => setConditionAbove(opt.val)}
                    style={{
                      flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                      background: conditionAbove === opt.val ? "rgba(167, 111, 250, 0.06)" : "transparent",
                      color: conditionAbove === opt.val ? "var(--text-primary)" : "var(--text-muted)",
                      border: `1px solid ${conditionAbove === opt.val ? "rgba(167, 111, 250, 0.2)" : "var(--border)"}`,
                      transition: "all 200ms",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                Resolution in (hours)
              </label>
              <input
                type="number"
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
                placeholder="24"
                className="input"
                min="1"
                style={{ fontFamily: "var(--font-mono), monospace" }}
              />
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Resolves: {new Date(resolutionTime * 1000).toLocaleString()}
              </p>
            </div>

            {/* Preview */}
            <AnimatePresence>
              {question && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: "hidden", marginBottom: 20 }}
                >
                  <div style={{
                    padding: "14px 16px", borderRadius: 8,
                    background: "rgba(167, 111, 250, 0.04)", border: "1px solid rgba(167, 111, 250, 0.12)",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 500, color: "#A76FFA", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Market Question
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4 }}>{question}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <button
              onClick={handleCreate}
              disabled={!isConnected || !selectedSource || !targetPrice || isPending || isConfirming}
              className="btn-primary"
              style={{ width: "100%", padding: "12px 20px", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              {!isConnected
                ? "Connect Wallet"
                : isPending
                ? "Confirm in Wallet..."
                : isConfirming
                ? "Creating..."
                : isSuccess
                ? "Market Created"
                : <>Create Market <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></>}
            </button>

            {isSuccess && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ fontSize: 12, color: "#A76FFA", textAlign: "center", marginTop: 8 }}
              >
                Market created successfully. Redirecting...
              </motion.p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
