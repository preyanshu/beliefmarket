"use client";

import { Header } from "@/components/Header";
import { PriceChart } from "@/components/PriceChart";
import { SubmitOrder } from "@/components/SubmitOrder";
import { TradingPairStats } from "@/components/TradingPairStats";
import { YourOrders } from "@/components/YourOrders";

export default function TradePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 py-4 space-y-4">
        <PriceChart />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SubmitOrder />
          <TradingPairStats />
          <YourOrders />
        </div>
      </main>
    </div>
  );
}
