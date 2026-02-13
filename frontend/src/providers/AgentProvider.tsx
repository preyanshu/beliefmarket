"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
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

  return (
    <AgentContext.Provider
      value={{ engine, notifications, dismissNotification, dismissAll, pendingApprovalCount }}
    >
      {children}
      <NotificationToast
        notifications={notifications.filter((n) => !n.dismissed)}
        onDismiss={dismissNotification}
      />
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
  // Only show the latest 3 undismissed notifications
  const visible = notifications.slice(0, 3);

  // Auto-dismiss after 15 seconds
  useEffect(() => {
    const timers = visible.map((n) =>
      setTimeout(() => onDismiss(n.id), 15000)
    );
    return () => timers.forEach(clearTimeout);
  }, [visible, onDismiss]);

  if (visible.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 380,
      }}
    >
      {visible.map((n, i) => (
        <div
          key={n.id}
          style={{
            background: "var(--bg-raised)",
            border: `1px solid ${n.type === "approval_needed" ? "rgba(167, 111, 250, 0.3)" : "var(--border)"}`,
            borderRadius: 10,
            padding: "12px 16px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            animation: "slideInRight 300ms ease-out",
            opacity: 1 - i * 0.15,
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                n.type === "approval_needed"
                  ? "rgba(167, 111, 250, 0.12)"
                  : n.type === "stopped"
                  ? "rgba(239, 68, 68, 0.1)"
                  : "rgba(255,255,255,0.04)",
              fontSize: 13,
            }}
          >
            {n.type === "approval_needed" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A76FFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            ) : n.type === "stopped" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14" />
                <path d="m19 12-7 7-7-7" />
              </svg>
            )}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              {n.type === "approval_needed" && (
                <span
                  style={{
                    padding: "1px 6px",
                    borderRadius: 4,
                    fontSize: 9,
                    fontWeight: 700,
                    background: "rgba(167, 111, 250, 0.15)",
                    color: "#A76FFA",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Approve
                </span>
              )}
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                {n.agentName}
              </span>
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.4,
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical" as const,
              }}
            >
              {n.message}
            </p>
            {n.type === "approval_needed" && (
              <a
                href="/agent"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#A76FFA",
                  textDecoration: "none",
                  marginTop: 4,
                  display: "inline-block",
                }}
              >
                Go to Agents &rarr;
              </a>
            )}
          </div>

          {/* Dismiss */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(n.id);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 14,
              padding: 2,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
