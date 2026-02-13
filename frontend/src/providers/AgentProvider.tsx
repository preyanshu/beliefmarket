"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { useMultiAgent, type AgentLog } from "@/hooks/useAgentEngine";
import type { AgentProfile, AgentRecommendation, AuditEntry } from "@/types/market";
import type { PriceResult } from "@/utils/priceOracle";

// ─── Notification Types ──────────────────────────────────────────────

export interface AgentNotification {
  id: string;
  agentId: number;
  agentName: string;
  message: string;
  type: "approval_needed" | "executed" | "stopped" | "info";
  recId?: string;
  timestamp: number;
  dismissed: boolean;
}

// ─── Context Type ────────────────────────────────────────────────────

interface AgentContextValue {
  engine: ReturnType<typeof useMultiAgent>;
  notifications: AgentNotification[];
  dismissNotification: (id: string) => void;
  dismissAll: () => void;
  pendingApprovalCount: number;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function useAgentContext() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgentContext must be used within AgentProvider");
  return ctx;
}

// Safe hook that returns null when outside provider (for Header etc.)
export function useAgentContextSafe(): AgentContextValue | null {
  return useContext(AgentContext);
}

// ─── Provider ────────────────────────────────────────────────────────

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const { address } = useAccount();
  const engine = useMultiAgent(address);

  const [notifications, setNotifications] = useState<AgentNotification[]>([]);
  const prevRecsRef = useRef<string[]>([]);

  // Track new pending recommendations and generate notifications
  useEffect(() => {
    const pendingRecs = engine.recommendations.filter((r) => r.status === "pending");
    const prevIds = prevRecsRef.current;

    for (const rec of pendingRecs) {
      if (!prevIds.includes(rec.id)) {
        // New pending recommendation — create notification
        const agentName = `Agent #${rec.agentId}`;
        setNotifications((prev) => [
          {
            id: `notif-${rec.id}`,
            agentId: rec.agentId,
            agentName,
            message: `${rec.direction ? "YES" : "NO"} on Market #${rec.marketId} — ${(Number(rec.suggestedStake) / 1e6).toFixed(2)} USDC @ ${rec.confidence}% confidence`,
            type: "approval_needed",
            recId: rec.id,
            timestamp: Date.now(),
            dismissed: false,
          },
          ...prev,
        ]);
      }
    }

    prevRecsRef.current = pendingRecs.map((r) => r.id);
  }, [engine.recommendations]);

  // Also watch for agents stopping (vault empty)
  const prevLogsCountRef = useRef(0);
  useEffect(() => {
    const newLogs = engine.logs.slice(0, engine.logs.length - prevLogsCountRef.current);
    prevLogsCountRef.current = engine.logs.length;

    for (const log of newLogs) {
      if (log.type === "warning" && log.message.includes("Vault balance is 0")) {
        setNotifications((prev) => [
          {
            id: `notif-stop-${log.agentId}-${Date.now()}`,
            agentId: log.agentId,
            agentName: log.agentName,
            message: "Agent stopped — vault empty. Fund to resume.",
            type: "stopped",
            timestamp: Date.now(),
            dismissed: false,
          },
          ...prev,
        ]);
      }
    }
  }, [engine.logs]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, dismissed: true } : n))
    );
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, dismissed: true })));
  }, []);

  const pendingApprovalCount = engine.recommendations.filter(
    (r) => r.status === "pending"
  ).length;

  const pathname = usePathname();
  const isLanding = pathname === "/";

  return (
    <AgentContext.Provider
      value={{ engine, notifications, dismissNotification, dismissAll, pendingApprovalCount }}
    >
      {children}
      {!isLanding && (
        <NotificationToast
          notifications={notifications.filter((n) => !n.dismissed)}
          onDismiss={dismissNotification}
        />
      )}
    </AgentContext.Provider>
  );
}

// ─── Notification Toast ──────────────────────────────────────────────

function NotificationToast({
  notifications,
  onDismiss,
}: {
  notifications: AgentNotification[];
  onDismiss: (id: string) => void;
}) {
  const router = useRouter();
  const visible = notifications.slice(0, 3);

  // Auto-dismiss after 12 seconds
  useEffect(() => {
    const timers = visible.map((n) =>
      setTimeout(() => onDismiss(n.id), 12000)
    );
    return () => timers.forEach(clearTimeout);
  }, [visible, onDismiss]);

  if (visible.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 68,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        width: 340,
      }}
    >
      {visible.map((n, i) => {
        const isApproval = n.type === "approval_needed";
        const isStopped = n.type === "stopped";

        return (
          <div
            key={n.id}
            style={{
              background: "rgba(18, 18, 24, 0.95)",
              backdropFilter: "blur(16px)",
              border: `1px solid ${isApproval ? "rgba(167, 111, 250, 0.25)" : isStopped ? "rgba(239, 68, 68, 0.2)" : "rgba(255,255,255,0.06)"}`,
              borderRadius: 12,
              padding: "14px 16px",
              boxShadow: isApproval
                ? "0 4px 24px rgba(167, 111, 250, 0.1), 0 12px 40px rgba(0,0,0,0.5)"
                : "0 4px 24px rgba(0,0,0,0.5)",
              animation: "slideInDown 280ms ease-out",
              opacity: 1 - i * 0.1,
              transform: `translateY(${i * 4}px)`,
              transition: "opacity 200ms, transform 200ms",
            }}
          >
            {/* Top bar: type + agent + dismiss */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {isApproval ? (
                  <span style={{
                    padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700,
                    background: "rgba(167, 111, 250, 0.15)", color: "#A76FFA",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>
                    Action Required
                  </span>
                ) : isStopped ? (
                  <span style={{
                    padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700,
                    background: "rgba(239, 68, 68, 0.1)", color: "#ef4444",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>
                    Stopped
                  </span>
                ) : (
                  <span style={{
                    padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700,
                    background: "rgba(255,255,255,0.04)", color: "var(--text-muted)",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>
                    Info
                  </span>
                )}
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                  {n.agentName}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}
                style={{
                  background: "rgba(255,255,255,0.04)", border: "none", borderRadius: 6,
                  color: "var(--text-muted)", cursor: "pointer", fontSize: 11,
                  width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 150ms",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              >
                ✕
              </button>
            </div>

            {/* Message */}
            <p style={{
              fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5,
              margin: 0, marginBottom: isApproval ? 10 : 0,
            }}>
              {n.message}
            </p>

            {/* Action row for approvals */}
            {isApproval && (
              <button
                onClick={() => { router.push(`/agent?select=${n.agentId}&tab=signals`); onDismiss(n.id); }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: "#A76FFA", color: "#fff", border: "none", cursor: "pointer",
                  transition: "opacity 150ms",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                Review & Approve
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
