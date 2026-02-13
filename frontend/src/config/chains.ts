import { defineChain } from "viem";

export const skaleBiteV2Sandbox = defineChain({
  id: 103698795,
  name: "SKALE BITE V2 Sandbox",
  nativeCurrency: {
    decimals: 18,
    name: "sFUEL",
    symbol: "sFUEL",
  },
  rpcUrls: {
    default: {
      http: ["https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox"],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://base-sepolia-testnet-explorer.skalenodes.com:10032",
    },
  },
  testnet: true,
});

export const BITE_RPC_URL =
  "https://base-sepolia-testnet.skalenodes.com/v1/bite-v2-sandbox";
