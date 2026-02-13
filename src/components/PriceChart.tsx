"use client";

import { useEffect, useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { SHADOW_POOL_ABI, SHADOW_POOL_ADDRESS, PRICE_PRECISION } from "@/config/contracts";
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi, type CandlestickData, type Time } from "lightweight-charts";

export function PriceChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // Get settlement count
  const { data: settlementCount } = useReadContract({
    address: SHADOW_POOL_ADDRESS,
    abi: SHADOW_POOL_ABI,
    functionName: "getSettlementCount",
  });

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: "#12121a" },
        textColor: "#71717a",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "#1e1e2e" },
        horzLines: { color: "#1e1e2e" },
      },
      crosshair: {
        vertLine: { color: "#a855f7", width: 1, style: 2 },
        horzLine: { color: "#a855f7", width: 1, style: 2 },
      },
      timeScale: {
        borderColor: "#1e1e2e",
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: "#1e1e2e",
      },
      width: chartContainerRef.current.clientWidth,
      height: 350,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Handle resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  // Update chart with settlement data
  useEffect(() => {
    if (!seriesRef.current || !settlementCount) return;

    const count = Number(settlementCount);
    if (count === 0) {
      // Show placeholder data
      const now = Math.floor(Date.now() / 1000);
      const placeholder: CandlestickData<Time>[] = [];
      for (let i = 10; i >= 0; i--) {
        const base = 1.0 + Math.random() * 0.2;
        placeholder.push({
          time: (now - i * 300) as Time,
          open: base,
          high: base + Math.random() * 0.05,
          low: base - Math.random() * 0.05,
          close: base + (Math.random() - 0.5) * 0.08,
        });
      }
      seriesRef.current.setData(placeholder);
      return;
    }

    // We would fetch settlement data here and plot it
    // For now, show placeholder until contract is deployed
  }, [settlementCount]);

  return (
    <div className="bg-card border border-card-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">DARK / USDC</span>
          <span className="text-xs text-muted">Sealed Dark Pool</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted">Settlement prices</span>
        </div>
      </div>
      <div ref={chartContainerRef} />
    </div>
  );
}
