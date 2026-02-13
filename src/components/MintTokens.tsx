"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import {
  DARK_TOKEN_ABI,
  DARK_TOKEN_ADDRESS,
  ERC20_ABI,
  USDC_ADDRESS,
} from "@/config/contracts";
import { Coins, Loader2, CheckCircle } from "lucide-react";

export function MintTokens() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [minting, setMinting] = useState(false);
  const [success, setSuccess] = useState(false);

  const { data: darkDecimals } = useReadContract({
    address: DARK_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "decimals",
  });
  const { data: usdcDecimals } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "decimals",
  });
  const darkDec = Number(darkDecimals ?? 18);
  const usdcDec = Number(usdcDecimals ?? 18);

  const { data: darkBalance, refetch: refetchDark } = useReadContract({
    address: DARK_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const handleMintDark = async () => {
    setMinting(true);
    setSuccess(false);
    try {
      await writeContractAsync({
        address: DARK_TOKEN_ADDRESS,
        abi: DARK_TOKEN_ABI,
        functionName: "mint",
      });
      setSuccess(true);
      setTimeout(() => {
        refetchDark();
        setSuccess(false);
      }, 4000);
    } catch (err: any) {
      console.error("Mint error:", err);
    }
    setMinting(false);
  };

  if (!isConnected) return null;

  return (
    <div className="bg-card border border-card-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Coins className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-semibold">Test Token Faucet</h3>
      </div>

      <div className="space-y-3">
        {/* Balances */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-background rounded px-3 py-2">
            <span className="text-muted block mb-0.5">DARK Balance</span>
            <span className="font-mono text-sm">
              {formatUnits((darkBalance as bigint) || BigInt(0), darkDec)}
            </span>
          </div>
          <div className="bg-background rounded px-3 py-2">
            <span className="text-muted block mb-0.5">USDC Balance</span>
            <span className="font-mono text-sm">
              {formatUnits((usdcBalance as bigint) || BigInt(0), usdcDec)}
            </span>
          </div>
        </div>

        {/* Mint DARK button */}
        <button
          onClick={handleMintDark}
          disabled={minting}
          className="w-full flex items-center justify-center gap-2 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
        >
          {minting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : success ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <Coins className="w-4 h-4" />
          )}
          {success ? "10,000 DARK Minted!" : "Mint 10,000 DARK"}
        </button>

        <p className="text-xs text-muted text-center">
          For USDC, request from the hackathon Telegram channel
        </p>
      </div>
    </div>
  );
}
