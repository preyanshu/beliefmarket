"use client";

import { useEffect } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "@/config/wagmi";
import { skaleBiteV2Sandbox } from "@/config/chains";
import { migrateFromLocalStorage } from "@/utils/encryptedStore";
import { AgentProvider } from "@/providers/AgentProvider";

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: React.ReactNode }) {
  // One-time migration from localStorage to encrypted IndexedDB
  useEffect(() => {
    migrateFromLocalStorage().catch((err) =>
      console.error("[Migration] Failed to migrate localStorage to IndexedDB:", err)
    );
  }, []);
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
          padding: 24,
          textAlign: "center",
        }}
      >
        <p style={{ color: "var(--text-primary)", fontSize: 16 }}>
          Privy is not configured. Add <code>NEXT_PUBLIC_PRIVY_APP_ID</code> to your
          .env file.
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Get your App ID at{" "}
          <a
            href="https://dashboard.privy.io"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#A76FFA" }}
          >
            dashboard.privy.io
          </a>
        </p>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        defaultChain: skaleBiteV2Sandbox,
        supportedChains: [skaleBiteV2Sandbox],
        loginMethods: ["wallet", "email", "sms", "google", "apple"],
        appearance: {
          theme: "dark",
          accentColor: "#A76FFA",
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
          showWalletUIs: true,
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config}>
          <AgentProvider>{children}</AgentProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
