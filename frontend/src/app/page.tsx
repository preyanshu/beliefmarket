"use client";

import { Header } from "@/components/Header";
import { PriceChart } from "@/components/PriceChart";
import { SubmitOrder } from "@/components/SubmitOrder";
import { TradingPairStats } from "@/components/TradingPairStats";
import { YourOrders } from "@/components/YourOrders";
import { MintTokens } from "@/components/MintTokens";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 py-4 space-y-4">
        {/* Price Chart (top) */}
        <PriceChart />

        {/* Bottom 3-panel layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Submit Order (left) */}
          <div className="space-y-4">
            <SubmitOrder />
            <MintTokens />
          </div>

          {/* Trading Pair Stats (center) */}
          <TradingPairStats />

          {/* Your Orders (right) */}
          <YourOrders />
        </div>
      </main>
    </div>
  );
}
