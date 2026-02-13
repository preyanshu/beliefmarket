"use client";

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  walletConnectWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { skaleBiteV2Sandbox } from "./chains";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [metaMaskWallet, injectedWallet, walletConnectWallet],
    },
  ],
  {
    appName: "ShadowPool",
    projectId: "b1e88581e462c42cba1bfb3b66afb982", // public demo WC project ID
  }
);

export const config = createConfig({
  connectors,
  chains: [skaleBiteV2Sandbox],
  transports: {
    [skaleBiteV2Sandbox.id]: http(),
  },
  ssr: true,
});
