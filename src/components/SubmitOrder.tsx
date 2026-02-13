"use client";

import { useState } from "react";
import {
  useAccount,
  useWriteContract,
  useReadContract,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";
import {
  SHADOW_POOL_ABI,
  SHADOW_POOL_ADDRESS,
  ERC20_ABI,
  DARK_TOKEN_ADDRESS,
  USDC_ADDRESS,
  PRICE_PRECISION,
  DECIMAL_SCALE,
} from "@/config/contracts";
import { encryptOrder } from "@/utils/encryption";
import { Lock, Loader2, CheckCircle } from "lucide-react";

export function SubmitOrder() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [isBuy, setIsBuy] = useState(true);
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [step, setStep] = useState<
    "idle" | "approving" | "encrypting" | "submitting" | "success"
  >("idle");
  const [error, setError] = useState("");

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

  const usdcDec = Number(usdcDecimals ?? 18);
  const darkDec = Number(darkDecimals ?? 18);

  // Token balances
  const { data: usdcBalance, refetch: refetchUsdcBal } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: darkBalance, refetch: refetchDarkBal } = useReadContract({
    address: DARK_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Allowances
  const { data: usdcAllowance, refetch: refetchUsdcAllowance } =
    useReadContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: address ? [address, SHADOW_POOL_ADDRESS] : undefined,
      query: { enabled: !!address },
    });

  const { data: darkAllowance, refetch: refetchDarkAllowance } =
    useReadContract({
      address: DARK_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: address ? [address, SHADOW_POOL_ADDRESS] : undefined,
      query: { enabled: !!address },
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!price || !quantity) {
      setError("Enter price and quantity");
      return;
    }

    try {
      // Price in PRICE_PRECISION (6 decimals) -- this is what the contract expects
      const priceWei = parseUnits(price, 6);
      // Amount in DARK decimals -- this is what the contract expects for base token
      const amountWei = parseUnits(quantity, darkDec);

      // Deposit calculation must match the contract's settlement logic:
      //   cost = (matchAmount * clearingPrice) / (PRICE_PRECISION * DECIMAL_SCALE)
      // For buy: deposit is in USDC (6 decimals)
      // For sell: deposit is in DARK (18 decimals)
      const depositAmount = isBuy
        ? (priceWei * amountWei) / (PRICE_PRECISION * DECIMAL_SCALE)
        : amountWei;

      // Balance check
      const balance = isBuy ? (usdcBalance as bigint) : (darkBalance as bigint);
      if (balance !== undefined && depositAmount > balance) {
        setError(
          `Insufficient ${isBuy ? "USDC" : "DARK"} balance. Need ${
            isBuy
              ? formatUnits(depositAmount, usdcDec)
              : formatUnits(depositAmount, darkDec)
          }, have ${
            isBuy
              ? formatUnits(balance, usdcDec)
              : formatUnits(balance, darkDec)
          }`
        );
        return;
      }

      const tokenAddress = isBuy ? USDC_ADDRESS : DARK_TOKEN_ADDRESS;
      const currentAllowance = isBuy ? usdcAllowance : darkAllowance;

      // Step 1: Approve if needed
      if (
        currentAllowance !== undefined &&
        depositAmount > (currentAllowance as bigint)
      ) {
        setStep("approving");
        await writeContractAsync({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [SHADOW_POOL_ADDRESS, depositAmount],
        });
        await new Promise((r) => setTimeout(r, 3000));
        if (isBuy) await refetchUsdcAllowance();
        else await refetchDarkAllowance();
      }

      // Step 2: Encrypt order via BITE SDK
      setStep("encrypting");
      const encrypted = await encryptOrder(priceWei, amountWei);

      // Step 3: Submit order
      setStep("submitting");
      const functionName = isBuy ? "submitBuyOrder" : "submitSellOrder";
      await writeContractAsync({
        address: SHADOW_POOL_ADDRESS,
        abi: SHADOW_POOL_ABI,
        functionName,
        args: [encrypted as `0x${string}`, depositAmount],
      });

      setStep("success");
      setPrice("");
      setQuantity("");
      if (isBuy) refetchUsdcBal();
      else refetchDarkBal();
      setTimeout(() => setStep("idle"), 3000);
    } catch (err: any) {
      console.error("Order submission error:", err);
      setError(err?.shortMessage || err?.message || "Failed to submit order");
      setStep("idle");
    }
  };

  const depositPreview = () => {
    if (!price || !quantity) return "—";
    try {
      const p = parseFloat(price);
      const q = parseFloat(quantity);
      if (isBuy) return `${(p * q).toFixed(2)} USDC`;
      return `${q} DARK`;
    } catch {
      return "—";
    }
  };

  return (
    <div className="bg-card border border-card-border rounded-lg">
      <div className="px-4 py-3 border-b border-card-border">
        <h3 className="text-sm font-semibold">Submit Order</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Trading Pair */}
        <div>
          <label className="text-xs text-muted mb-1 block">Trading Pair</label>
          <div className="bg-background border border-card-border rounded px-3 py-2 text-sm">
            DARK / USDC
          </div>
        </div>

        {/* Buy / Sell Toggle */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setIsBuy(true)}
            className={`py-2 rounded text-sm font-semibold transition-colors ${
              isBuy
                ? "bg-buy/20 text-buy border border-buy/40"
                : "bg-background border border-card-border text-muted hover:text-foreground"
            }`}
          >
            BUY
          </button>
          <button
            onClick={() => setIsBuy(false)}
            className={`py-2 rounded text-sm font-semibold transition-colors ${
              !isBuy
                ? "bg-sell/20 text-sell border border-sell/40"
                : "bg-background border border-card-border text-muted hover:text-foreground"
            }`}
          >
            SELL
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Price */}
          <div>
            <label className="text-xs text-muted mb-1 block">
              Price (USDC)
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              step="any"
              className="w-full bg-background border border-card-border rounded px-3 py-2 text-sm font-mono focus:border-accent/50 transition-colors"
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="text-xs text-muted mb-1 block">
              Quantity (DARK)
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0.00"
              step="any"
              className="w-full bg-background border border-card-border rounded px-3 py-2 text-sm font-mono focus:border-accent/50 transition-colors"
            />
          </div>

          {/* Deposit preview */}
          <div className="flex items-center justify-between text-xs text-muted py-1">
            <span>Deposit:</span>
            <span className="font-mono">{depositPreview()}</span>
          </div>

          {/* Balances */}
          {isConnected && (
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Balance:</span>
              <span className="font-mono">
                {isBuy
                  ? `${formatUnits((usdcBalance as bigint) || BigInt(0), usdcDec)} USDC`
                  : `${formatUnits((darkBalance as bigint) || BigInt(0), darkDec)} DARK`}
              </span>
            </div>
          )}

          {/* Encryption notice */}
          <div className="flex items-center gap-2 text-xs text-accent bg-accent/5 border border-accent/20 rounded px-3 py-2">
            <Lock className="w-3 h-3 flex-shrink-0" />
            <span>Price and quantity will be encrypted with BITE v2</span>
          </div>

          {/* Error */}
          {error && (
            <div className="text-xs text-sell bg-sell/10 border border-sell/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          {/* Submit */}
          {!isConnected ? (
            <div className="text-center text-xs text-muted py-4">
              Connect wallet to trade
            </div>
          ) : step === "success" ? (
            <div className="flex items-center justify-center gap-2 py-3 text-buy text-sm">
              <CheckCircle className="w-4 h-4" />
              Order submitted!
            </div>
          ) : (
            <button
              type="submit"
              disabled={step !== "idle"}
              className={`w-full py-2.5 rounded text-sm font-semibold transition-colors ${
                isBuy
                  ? "bg-buy hover:bg-buy/80 text-white"
                  : "bg-sell hover:bg-sell/80 text-white"
              } disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
            >
              {step === "idle" ? (
                isBuy ? "Buy DARK" : "Sell DARK"
              ) : (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {step === "approving" && "Approving..."}
                  {step === "encrypting" && "Encrypting order..."}
                  {step === "submitting" && "Submitting..."}
                </>
              )}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
