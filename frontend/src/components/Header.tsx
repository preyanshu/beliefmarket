"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { USDC_ADDRESS, USDC_DECIMALS } from "@/config/contracts";
import { ERC20_ABI } from "@/config/beliefMarketAbi";
import { useAgentContextSafe } from "@/providers/AgentProvider";

const NAV_ITEMS = [
  { href: "/markets", label: "Home" },
  { href: "/create", label: "Create" },
  { href: "/agent", label: "Agents" },
  { href: "/history", label: "History" },
];

function truncateAddress(addr: string) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ─── Wallet Dropdown ────────────────────────────────────────────────

function WalletDropdown({
  address,
  onLogout,
}: {
  address: `0x${string}`;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // sFUEL balance
  const { data: nativeBalance } = useBalance({ address });

  // USDC balance
  const { data: usdcRaw } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });

  const sfuel = nativeBalance
    ? Number(formatUnits(nativeBalance.value, 18)).toFixed(4)
    : "—";
  const usdc = usdcRaw !== undefined
    ? Number(formatUnits(usdcRaw as bigint, USDC_DECIMALS)).toFixed(2)
    : "—";

  function handleCopy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 14px",
          borderRadius: 10,
          cursor: "pointer",
          background: "var(--bg-raised)",
          border: open
            ? "1px solid rgba(167, 111, 250, 0.3)"
            : "1px solid var(--border)",
          transition: "all 200ms",
        }}
      >
        {/* Dot indicator */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#34d399",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 13,
            fontFamily: "var(--font-mono), monospace",
            color: "var(--text-secondary)",
          }}
        >
          {truncateAddress(address)}
        </span>
        {/* Chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 200ms",
          }}
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 280,
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 0,
            boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
            zIndex: 200,
            overflow: "hidden",
          }}
        >
          {/* Address row */}
          <div
            style={{
              padding: "16px 16px 12px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: "var(--text-muted)",
                }}
              >
                Connected Wallet
              </span>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#34d399",
                  display: "inline-block",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontFamily: "var(--font-mono), monospace",
                  color: "var(--text-primary)",
                  flex: 1,
                }}
              >
                {truncateAddress(address)}
              </span>
              <button
                onClick={handleCopy}
                title="Copy address"
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 500,
                  background: copied
                    ? "rgba(52, 211, 153, 0.1)"
                    : "rgba(167, 111, 250, 0.06)",
                  color: copied ? "#34d399" : "#A76FFA",
                  border: copied
                    ? "1px solid rgba(52, 211, 153, 0.2)"
                    : "1px solid rgba(167, 111, 250, 0.15)",
                  transition: "all 200ms",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {copied ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Balances */}
          <div style={{ padding: "12px 16px" }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: "var(--text-muted)",
                marginBottom: 10,
              }}
            >
              Balances
            </div>

            {/* USDC */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                borderRadius: 8,
                background: "var(--bg)",
                marginBottom: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #2775ca, #1a5fb4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  $
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                  }}
                >
                  USDC
                </span>
              </div>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono), monospace",
                  color: "var(--text-primary)",
                }}
              >
                {usdc}
              </span>
            </div>

            {/* sFUEL */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                borderRadius: 8,
                background: "var(--bg)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #A76FFA, #7c3aed)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  ⚡
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                  }}
                >
                  sFUEL
                </span>
              </div>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono), monospace",
                  color: "var(--text-primary)",
                }}
              >
                {sfuel}
              </span>
            </div>
          </div>

          {/* Network */}
          <div
            style={{
              padding: "10px 16px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              Network
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#A76FFA",
                  display: "inline-block",
                }}
              />
              SKALE BITE V2
            </span>
          </div>

          {/* Disconnect */}
          <div style={{ padding: "0 12px 12px" }}>
            <button
              onClick={() => {
                onLogout();
                setOpen(false);
              }}
              style={{
                width: "100%",
                padding: "10px 0",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                background: "rgba(239, 68, 68, 0.06)",
                color: "#ef4444",
                border: "1px solid rgba(239, 68, 68, 0.15)",
                transition: "all 200ms",
              }}
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Header ─────────────────────────────────────────────────────────

export function Header() {
  const pathname = usePathname();
  const { ready, authenticated, logout } = usePrivy();
  const { login } = useLogin();
  const { address } = useAccount();
  const agentCtx = useAgentContextSafe();
  const pendingCount = agentCtx?.pendingApprovalCount || 0;

  // Hide main header on the landing page (it has its own navbar)
  if (pathname === "/") return null;

  return (
    <header
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          padding: "0 32px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Left: Logo + Nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-primary)",
                letterSpacing: "-0.03em",
              }}
            >
              Belief<span style={{ color: "#A76FFA" }}>Market</span>
            </span>
          </Link>

          <nav style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    padding: "6px 14px",
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 500,
                    color: isActive
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    textDecoration: "none",
                    borderRadius: 8,
                    background: isActive
                      ? "rgba(167, 111, 250, 0.06)"
                      : "transparent",
                    border: isActive
                      ? "1px solid rgba(167, 111, 250, 0.15)"
                      : "1px solid transparent",
                    transition: "all 200ms",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {item.label}
                    {item.href === "/agent" && pendingCount > 0 && (
                      <span
                        style={{
                          minWidth: 16,
                          height: 16,
                          borderRadius: 999,
                          background: "#A76FFA",
                          color: "#fff",
                          fontSize: 10,
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0 4px",
                          animation: "pulse-glow 2s ease-in-out infinite",
                        }}
                      >
                        {pendingCount}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Wallet */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!ready ? (
            <div
              style={{
                padding: "8px 16px",
                fontSize: 14,
                color: "var(--text-muted)",
              }}
            >
              Loading...
            </div>
          ) : authenticated && address ? (
            <WalletDropdown address={address} onLogout={logout} />
          ) : (
            <button
              onClick={() => login()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 16px",
                borderRadius: 999,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase" as const,
                color: "#fff",
                background: "#A76FFA",
                border: "none",
                boxShadow: "0 0 20px rgba(167, 111, 250, 0.3), 0 0 40px rgba(167, 111, 250, 0.1)",
                transition: "all 200ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 0 24px rgba(167, 111, 250, 0.5), 0 0 48px rgba(167, 111, 250, 0.2)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 0 20px rgba(167, 111, 250, 0.3), 0 0 40px rgba(167, 111, 250, 0.1)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {/* Wallet icon */}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
