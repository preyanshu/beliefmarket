"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { parseUnits, formatUnits } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { BELIEF_MARKET_ADDRESS, USDC_DECIMALS } from "@/config/contracts";
import { BELIEF_MARKET_ABI, ERC20_ABI } from "@/config/beliefMarketAbi";
import { USDC_ADDRESS } from "@/config/contracts";
import {
  AgentProfile,
  AgentPersonality,
  AgentRecommendation,
  AuditEntry,
  OnChainAgent,
  PERSONALITY_META,
  PERSONALITY_INDEX,
  PERSONALITY_FROM_INDEX,
  AGENT_COLORS,
  DEFAULT_AGENT_STATS,
  ASSET_COMMODITY,
  ASSET_ETF,
  ASSET_FX,
} from "@/types/market";
import { type AgentLog } from "@/hooks/useAgentEngine";
import { useAgentContext } from "@/providers/AgentProvider";
import { createAgentWallet, hasAgentWallet, deleteAgentWallet, getAgentWalletAddress, getAgentWalletPrivateKey } from "@/utils/agentWallet";
import { encryptDirection } from "@/utils/encryption";

// ═══════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════

export default function AgentPageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading agents...</div>}>
      <AgentPage />
    </Suspense>
  );
}

function AgentPage() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "compare" | "audit">("compare");

  const { engine } = useAgentContext();

  // Auto-select agent & tab from query params (e.g. ?select=3&tab=signals)
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    const selectId = searchParams.get("select");
    const tab = searchParams.get("tab");
    if (selectId) {
      const id = Number(selectId);
      if (!isNaN(id)) {
        setSelectedAgentId(id);
        setActiveTab("overview");
        // The detail-level tab (signals/positions/etc) is handled via a ref below
        if (tab) deepLinkDetailTabRef.current = tab;
        deepLinkHandledRef.current = true;
        // Clean up query params from URL without navigation
        router.replace("/agent", { scroll: false });
      }
    }
  }, [searchParams, router]);

  // Ref to pass desired detail tab to AgentDetailView
  const deepLinkDetailTabRef = useRef<string | null>(null);

  // Read on-chain data for each agent
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);

  // Fetch all agent on-chain data
  const fetchAgentData = useCallback(async () => {
    if (!engine.agentIds.length) {
      setAgentProfiles([]);
      return;
    }
    // We'll use the agentIds to build profiles
    // For now, just trigger re-reads on mount/change
  }, [engine.agentIds]);

  useEffect(() => { fetchAgentData(); }, [fetchAgentData]);

  const selectedAgent = agentProfiles.find((p) => p.onChainId === selectedAgentId) || null;

  return (
    <div className="page-container">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: 2 }}>
              Agents <span style={{ color: "#A76FFA", opacity: 0.5 }}>/</span>
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Deploy autonomous agents with individual vaults, guardrails, and execution modes.
            </p>
          </div>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            Create Agent
          </button>
        </div>

        {/* Agent Cards Grid */}
        <div style={{ marginBottom: 28 }}>
          {engine.agentIds.length === 0 ? (
            <div style={{
              background: "var(--bg-raised)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)", padding: "48px 24px", textAlign: "center",
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", margin: "0 auto 16px",
                background: "var(--bg-elevated)", border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: "var(--text-muted)" }}>+</span>
              </div>
              <p style={{ fontSize: 15, color: "var(--text-muted)", marginBottom: 4 }}>No agents created yet</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Create your first agent to start scanning markets.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
              {engine.agentIds.map((agentId, idx) => (
                <AgentInfoCard
                  key={agentId}
                  agentId={agentId}
                  index={idx}
                  isRunning={engine.runningAgents.has(agentId)}
                  isSelected={selectedAgentId === agentId}
                  pendingCount={engine.recommendations.filter((r) => r.agentId === agentId && r.status === "pending").length}
                  onSelect={() => { setSelectedAgentId(agentId); setActiveTab("overview"); }}
                  onStart={(profile) => engine.startAgent(agentId, profile)}
                  onStop={() => engine.stopAgent(agentId)}
                  onProfileLoaded={(profile) => {
                    setAgentProfiles((prev) => {
                      const existing = prev.filter((p) => p.onChainId !== profile.onChainId);
                      return [...existing, profile].sort((a, b) => a.onChainId - b.onChainId);
                    });
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Tab Nav — always show compare & audit; overview only when agent selected */}
        {engine.agentIds.length > 0 && (
          <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
            {(selectedAgent
              ? (["overview", "compare", "audit"] as const)
              : (["compare", "audit"] as const)
            ).map((tab) => {
              const labels: Record<string, string> = {
                overview: selectedAgent?.name || "Overview",
                compare: "Compare Agents",
                audit: "Global Audit",
              };
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "6px 14px", fontSize: 13, fontWeight: 500,
                    color: activeTab === tab ? "var(--text-primary)" : "var(--text-muted)",
                    background: activeTab === tab ? "rgba(167, 111, 250, 0.06)" : "transparent",
                    border: activeTab === tab ? "1px solid rgba(167, 111, 250, 0.15)" : "1px solid transparent",
                    borderRadius: 8, cursor: "pointer", transition: "all 200ms",
                  }}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>
        )}

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === "overview" && selectedAgent && (
            <motion.div key="overview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              <AgentDetailView
                agent={selectedAgent}
                isRunning={engine.runningAgents.has(selectedAgent.onChainId)}
                onStart={() => engine.startAgent(selectedAgent.onChainId, selectedAgent)}
                onStop={() => engine.stopAgent(selectedAgent.onChainId)}
                recommendations={engine.recommendations.filter((r) => r.agentId === selectedAgent.onChainId)}
                onApprove={engine.approveRecommendation}
                onReject={engine.rejectRecommendation}
                logs={engine.logs.filter((l) => l.agentId === selectedAgent.onChainId)}
                audit={engine.globalAudit.filter((a) => a.agentId === selectedAgent.onChainId)}
                onRefresh={() => queryClient.invalidateQueries()}
                initialDetailTab={deepLinkDetailTabRef.current}
                onDetailTabConsumed={() => { deepLinkDetailTabRef.current = null; }}
              />
            </motion.div>
          )}

          {activeTab === "compare" && (
            <motion.div key="compare" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              <AgentComparisonPanel profiles={agentProfiles} recommendations={engine.recommendations} runningAgents={engine.runningAgents} />
            </motion.div>
          )}

          {activeTab === "audit" && (
            <motion.div key="audit" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              <GlobalAuditTrail audit={engine.globalAudit} profiles={agentProfiles} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Create Modal */}
        <AnimatePresence>
          {showCreateModal && (
            <CreateAgentModal
              existingCount={engine.agentIds.length}
              onClose={() => setShowCreateModal(false)}
              onCreated={(agentId) => {
                setSelectedAgentId(agentId);
                setShowCreateModal(false);
                setActiveTab("overview");
                engine.refreshAgentIds();
                queryClient.invalidateQueries();
              }}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Agent Sphere Grid (reads on-chain data for each agent)
// ═══════════════════════════════════════════════════════════════════

function AgentInfoCard({
  agentId,
  index,
  isRunning,
  isSelected,
  pendingCount,
  onSelect,
  onStart,
  onStop,
  onProfileLoaded,
}: {
  agentId: number;
  index: number;
  isRunning: boolean;
  isSelected: boolean;
  pendingCount: number;
  onSelect: () => void;
  onStart: (profile: AgentProfile) => void;
  onStop: () => void;
  onProfileLoaded: (profile: AgentProfile) => void;
}) {
  const { data: agentData } = useReadContract({
    address: BELIEF_MARKET_ADDRESS,
    abi: BELIEF_MARKET_ABI,
    functionName: "getAgent",
    args: [BigInt(agentId)],
  });

  const [copied, setCopied] = useState<string | null>(null);
  const profileRef = useRef<AgentProfile | null>(null);
  const [delegateAddr, setDelegateAddr] = useState<string | null>(null);
  const [walletExists, setWalletExists] = useState(false);

  const color = AGENT_COLORS[index % AGENT_COLORS.length];
  const name = agentData ? (agentData as any).name || `Agent ${agentId}` : `Agent ${agentId}`;
  const personality = agentData ? PERSONALITY_FROM_INDEX[(agentData as any).personality] || "balanced" : "balanced";
  const meta = PERSONALITY_META[personality];

  // Load wallet info from encrypted IndexedDB — auto-create if missing
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const has = await hasAgentWallet(agentId);
      if (!has) {
        // Auto-create delegate wallet for agents that don't have one yet
        console.log(`[AgentCard] Auto-creating delegate wallet for agent ${agentId}`);
        const wallet = await createAgentWallet(agentId);
        if (!cancelled) {
          setDelegateAddr(wallet.address);
          setWalletExists(true);
        }
        return;
      }
      const addr = await getAgentWalletAddress(agentId);
      if (!cancelled) {
        setDelegateAddr(addr);
        setWalletExists(true);
      }
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  // Use ref to avoid infinite re-render loop
  const onProfileLoadedRef = useRef(onProfileLoaded);
  onProfileLoadedRef.current = onProfileLoaded;

  useEffect(() => {
    if (agentData) {
      const d = agentData as any;
      const profile: AgentProfile = {
        onChainId: agentId,
        owner: d.owner,
        delegate: d.delegate,
        name: d.name || `Agent ${agentId}`,
        systemPrompt: d.systemPrompt || "",
        personality: PERSONALITY_FROM_INDEX[d.personality] || "balanced",
        color,
        balance: d.balance,
        maxBetPerMarket: d.maxBetPerMarket,
        maxTotalExposure: d.maxTotalExposure,
        currentExposure: d.currentExposure,
        allowedAssetTypes: d.allowedAssetTypes,
        confidenceThreshold: d.confidenceThreshold,
        autoExecute: d.autoExecute,
        isActive: d.isActive,
        stats: DEFAULT_AGENT_STATS,
        auditTrail: [],
      };
      profileRef.current = profile;
      onProfileLoadedRef.current(profile);
    }
  }, [agentData, agentId, color]);

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleExportKey() {
    const pk = await getAgentWalletPrivateKey(agentId);
    if (pk) {
      copyToClipboard(pk, "key");
    }
  }

  if (!agentData) {
    return (
      <div style={{
        background: "var(--bg-raised)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div className="skeleton" style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 14, width: 100, marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 12, width: 160 }} />
          </div>
        </div>
      </div>
    );
  }

  const d = agentData as any;
  const balance = Number(formatUnits(d.balance, USDC_DECIMALS));
  const maxBet = Number(formatUnits(d.maxBetPerMarket, USDC_DECIMALS));
  const exposure = Number(formatUnits(d.currentExposure, USDC_DECIMALS));
  const maxExposure = Number(formatUnits(d.maxTotalExposure, USDC_DECIMALS));
  const shortDelegate = delegateAddr ? `${delegateAddr.slice(0, 6)}...${delegateAddr.slice(-4)}` : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      onClick={onSelect}
      style={{
        background: "var(--bg-raised)",
        border: `1px solid ${isSelected ? "rgba(167, 111, 250, 0.25)" : "var(--border)"}`,
        borderRadius: "var(--radius-md)",
        padding: "18px 20px",
        cursor: "pointer",
        transition: "border-color 200ms, box-shadow 200ms",
        boxShadow: isSelected ? "0 0 0 1px rgba(167, 111, 250, 0.08)" : "none",
        position: "relative",
      }}
    >
      {/* Top row: sphere + name + badges + start/stop */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <div style={{ position: "relative", width: 40, height: 40, flexShrink: 0 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: `radial-gradient(circle at 35% 35%, ${color}ee, ${color}88 50%, ${color}44 100%)`,
            boxShadow: isRunning ? `0 0 14px ${color}50` : `0 0 6px ${color}20`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#000", opacity: 0.7 }}>
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div style={{
            position: "absolute", bottom: -1, right: -1,
            width: 10, height: 10, borderRadius: "50%",
            background: isRunning ? "#22c55e" : "var(--text-muted)",
            border: "2px solid var(--bg-raised)",
            boxShadow: isRunning ? "0 0 6px rgba(34, 197, 94, 0.5)" : "none",
            animation: isRunning ? "pulse-dot 2s ease-in-out infinite" : "none",
          }} />
          {pendingCount > 0 && (
            <div style={{
              position: "absolute", top: -4, right: -6,
              background: "var(--text-secondary)", color: "#000",
              fontSize: 10, fontWeight: 700, borderRadius: 10,
              padding: "1px 5px", minWidth: 16, textAlign: "center",
            }}>
              {pendingCount}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{name}</span>
            <span style={{
              padding: "1px 7px", borderRadius: 5, fontSize: 10, fontWeight: 500,
              color: "var(--text-muted)", background: "var(--bg)", border: "1px solid var(--border)",
            }}>{meta.label}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>#{agentId}</span>
            <span style={{ fontSize: 11, color: "var(--border)" }}>·</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{d.autoExecute ? "Auto" : "Manual"}</span>
            {isRunning && (
              <>
                <span style={{ fontSize: 11, color: "var(--border)" }}>·</span>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Running</span>
              </>
            )}
          </div>
        </div>

        {/* Start / Stop button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isRunning) {
              onStop();
            } else if (profileRef.current) {
              onStart(profileRef.current);
            }
          }}
          style={{
            padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600,
            cursor: "pointer", flexShrink: 0, transition: "all 200ms",
            background: "transparent",
            color: isRunning ? "var(--text-muted)" : "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          {isRunning ? "Stop" : "Start"}
        </button>
      </div>

      {/* Stats row */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12,
        padding: "10px 12px", borderRadius: 8, background: "var(--bg)",
      }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>Vault</div>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono), monospace", color: balance > 0 ? "var(--text-primary)" : "var(--text-muted)" }}>
            {balance.toFixed(1)} <span style={{ fontSize: 10, fontWeight: 500, color: "var(--text-muted)" }}>USDC</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>Max Bet</div>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono), monospace", color: "var(--text-primary)" }}>
            {maxBet.toFixed(0)} <span style={{ fontSize: 10, fontWeight: 500, color: "var(--text-muted)" }}>USDC</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>Confidence</div>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono), monospace", color: "var(--text-primary)" }}>
            {d.confidenceThreshold}%
          </div>
        </div>
      </div>

      {/* Exposure bar */}
      {d.autoExecute && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Exposure</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
              {exposure.toFixed(0)} / {maxExposure.toFixed(0)} USDC
            </span>
          </div>
          <div style={{ height: 3, borderRadius: 2, background: "var(--bg)", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2,
              width: `${maxExposure > 0 ? Math.min((exposure / maxExposure) * 100, 100) : 0}%`,
              background: "var(--text-secondary)",
              opacity: 0.4,
              transition: "width 300ms",
            }} />
          </div>
        </div>
      )}

      {/* Delegate wallet row */}
      {walletExists && shortDelegate && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 10px", borderRadius: 6, background: "var(--bg)",
          marginBottom: 0,
        }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
            </svg>
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono), monospace", color: "var(--text-secondary)" }}>
              {shortDelegate}
            </span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => copyToClipboard(delegateAddr!, "addr")}
              style={{
                padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                background: "transparent", border: "1px solid var(--border)",
                color: copied === "addr" ? "var(--text-secondary)" : "var(--text-muted)",
                cursor: "pointer", transition: "all 150ms",
              }}
            >
              {copied === "addr" ? "Copied" : "Copy"}
            </button>
            <button
              onClick={handleExportKey}
              style={{
                padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                background: "transparent", border: "1px solid var(--border)",
                color: copied === "key" ? "var(--text-secondary)" : "var(--text-muted)",
                cursor: "pointer", transition: "all 150ms",
              }}
              title="Copy private key to clipboard"
            >
              {copied === "key" ? "Copied" : "Export Key"}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Create Agent Modal
// ═══════════════════════════════════════════════════════════════════

function CreateAgentModal({
  existingCount,
  onClose,
  onCreated,
}: {
  existingCount: number;
  onClose: () => void;
  onCreated: (agentId: number) => void;
}) {
  const [name, setName] = useState(`Agent ${existingCount + 1}`);
  const [color, setColor] = useState(AGENT_COLORS[existingCount % AGENT_COLORS.length]);
  const [personality, setPersonality] = useState<AgentPersonality>("balanced");
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [maxBet, setMaxBet] = useState("50");
  const [maxExposure, setMaxExposure] = useState("200");
  const [allowedTypes, setAllowedTypes] = useState(7);
  const [confidenceThreshold, setConfidenceThreshold] = useState(60);
  const [step, setStep] = useState<1 | 2>(1);

  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const queryClient = useQueryClient();

  useEffect(() => {
    if (isSuccess) {
      // Wait a moment for blockchain state to update, then refetch
      setTimeout(() => {
        queryClient.invalidateQueries();
        // After the agent is created, we'll let the parent refresh
        // and discover the new agent ID from the chain
        // For now, estimate the ID (will be corrected on refresh)
        onCreated(existingCount + 1);
      }, 500);
    }
  }, [isSuccess, existingCount, onCreated, queryClient]);

  async function handleDeploy() {
    const isAuto = mode === "auto";

    // Always create a delegate wallet for every agent (needed for auto-execute,
    // and useful to have ready if the user later switches to auto mode)
    const wallet = await createAgentWallet(existingCount + 1);
    const delegateAddress = wallet.address;

    // Send a small amount of sFUEL to the delegate for gas
    const sfuelValue = BigInt("10000000000000000"); // 0.01 sFUEL

    writeContract({
      address: BELIEF_MARKET_ADDRESS,
      abi: BELIEF_MARKET_ABI,
      functionName: "createAgent",
      args: [
        name,
        systemPrompt,
        PERSONALITY_INDEX[personality],
        delegateAddress,
        parseUnits(maxBet, USDC_DECIMALS),
        parseUnits(maxExposure, USDC_DECIMALS),
        allowedTypes,
        confidenceThreshold,
        isAuto,
      ],
      value: sfuelValue,
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: 580, padding: 32, maxHeight: "90vh", overflow: "auto" }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: 24 }}>Create Agent</h2>

        {step === 1 && (
          <>
            {/* Name */}
            <div style={{ marginBottom: 20 }}>
              <label className="text-caption" style={{ display: "block", marginBottom: 6 }}>Agent Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" style={{ fontSize: 15 }} placeholder="e.g. Alpha Hunter" />
            </div>

            {/* Color picker */}
            <div style={{ marginBottom: 20 }}>
              <label className="text-caption" style={{ display: "block", marginBottom: 8 }}>Sphere Color</label>
              <div style={{ display: "flex", gap: 8 }}>
                {AGENT_COLORS.map((c) => (
                  <button key={c} onClick={() => setColor(c)} style={{
                    width: 32, height: 32, borderRadius: "50%", cursor: "pointer",
                    background: `radial-gradient(circle at 35% 35%, ${c}ee, ${c}88 50%, ${c}44 100%)`,
                    border: color === c ? "2px solid var(--text-secondary)" : "2px solid transparent",
                    boxShadow: "none",
                  }} />
                ))}
              </div>
            </div>

            {/* Preview sphere */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
              <div style={{ position: "relative", width: 72, height: 72 }}>
                <div style={{
                  position: "absolute", inset: -10, borderRadius: "50%",
                  background: `radial-gradient(circle, ${color}40 0%, transparent 70%)`,
                }} />
                <div style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: `radial-gradient(circle at 35% 35%, ${color}ee, ${color}88 50%, ${color}44 100%)`,
                  boxShadow: `0 0 24px ${color}50, 0 0 48px ${color}20, inset 0 -4px 12px ${color}40`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: "#000", opacity: 0.7 }}>{name.charAt(0).toUpperCase()}</span>
                </div>
              </div>
            </div>

            {/* Personality */}
            <div style={{ marginBottom: 20 }}>
              <label className="text-caption" style={{ display: "block", marginBottom: 8 }}>Personality</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {(["conservative", "balanced", "aggressive", "contrarian"] as AgentPersonality[]).map((p) => {
                  const meta = PERSONALITY_META[p];
                  const active = personality === p;
                  return (
                    <button key={p} onClick={() => setPersonality(p)} style={{
                      padding: "12px 14px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                      background: active ? "var(--bg)" : "transparent",
                      border: `1px solid ${active ? "var(--border-hover)" : "var(--border)"}`,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: active ? "var(--text-primary)" : "var(--text-secondary)", marginBottom: 2 }}>{meta.label}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>{meta.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Execution Mode */}
            <div style={{ marginBottom: 24 }}>
              <label className="text-caption" style={{ display: "block", marginBottom: 8 }}>Execution Mode</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setMode("manual")} style={{
                  flex: 1, padding: "12px 14px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                  background: mode === "manual" ? "var(--bg)" : "transparent",
                  border: `1px solid ${mode === "manual" ? "var(--border-hover)" : "var(--border)"}`,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: mode === "manual" ? "var(--text-primary)" : "var(--text-secondary)" }}>Manual Approval</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Review and sign each position</div>
                </button>
                <button onClick={() => setMode("auto")} style={{
                  flex: 1, padding: "12px 14px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                  background: mode === "auto" ? "var(--bg)" : "transparent",
                  border: `1px solid ${mode === "auto" ? "var(--border-hover)" : "var(--border)"}`,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: mode === "auto" ? "var(--text-primary)" : "var(--text-secondary)" }}>Auto-Execute</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Delegate key signs within guardrails</div>
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={onClose} className="btn-secondary" style={{ padding: "10px 20px" }}>Cancel</button>
              <button onClick={() => setStep(2)} className="btn-primary" style={{ padding: "10px 24px" }} disabled={!name.trim()}>
                Next: Guardrails
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {/* System Prompt */}
            <div style={{ marginBottom: 20 }}>
              <label className="text-caption" style={{ display: "block", marginBottom: 6 }}>System Prompt</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="input"
                rows={3}
                style={{ fontSize: 14, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
                placeholder="e.g. Focus on gold and forex markets. Be conservative with large positions. Avoid markets expiring in less than 1 hour."
              />
              <p className="text-caption" style={{ color: "var(--text-muted)", marginTop: 4 }}>
                Natural-language instructions stored on-chain. Guides the AI analysis engine.
              </p>
            </div>

            {/* Guardrails */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div>
                <label className="text-caption" style={{ display: "block", marginBottom: 6 }}>Max Bet / Market (USDC)</label>
                <input type="number" value={maxBet} onChange={(e) => setMaxBet(e.target.value)} className="input text-mono" step="any" />
              </div>
              <div>
                <label className="text-caption" style={{ display: "block", marginBottom: 6 }}>Max Total Exposure (USDC)</label>
                <input type="number" value={maxExposure} onChange={(e) => setMaxExposure(e.target.value)} className="input text-mono" step="any" />
              </div>
            </div>

            {/* Confidence Threshold */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <label className="text-caption">Confidence Threshold</label>
                <span className="text-mono" style={{ fontSize: 14, fontWeight: 600 }}>{confidenceThreshold}%</span>
              </div>
              <input
                type="range" min={20} max={95} value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--text-secondary)" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)" }}>
                <span>Conservative (80+)</span>
                <span>Aggressive (30+)</span>
              </div>
            </div>

            {/* Allowed Asset Types */}
            <div style={{ marginBottom: 24 }}>
              <label className="text-caption" style={{ display: "block", marginBottom: 6 }}>Allowed Asset Classes</label>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { value: ASSET_COMMODITY, label: "Commodity" },
                  { value: ASSET_ETF, label: "ETF" },
                  { value: ASSET_FX, label: "FX" },
                ].map((item) => {
                  const active = (allowedTypes & item.value) !== 0;
                  return (
                    <button key={item.value} onClick={() => setAllowedTypes((p) => p ^ item.value)} style={{
                      flex: 1, padding: "10px 0", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
                      background: active ? "var(--bg)" : "transparent",
                      color: active ? "var(--text-primary)" : "var(--text-muted)",
                      border: `1px solid ${active ? "var(--border-hover)" : "var(--border)"}`, transition: "all 200ms",
                    }}>{item.label}</button>
                  );
                })}
              </div>
            </div>

            {/* Summary */}
            <div className="card" style={{ padding: 16, marginBottom: 24, background: "var(--bg)" }}>
              <div className="text-caption" style={{ marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Summary</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 13 }}>
                <span style={{ color: "var(--text-muted)" }}>Name:</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{name}</span>
                <span style={{ color: "var(--text-muted)" }}>Personality:</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{PERSONALITY_META[personality].label}</span>
                <span style={{ color: "var(--text-muted)" }}>Mode:</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{mode === "auto" ? "Auto-Execute" : "Manual"}</span>
                <span style={{ color: "var(--text-muted)" }}>Confidence:</span>
                <span className="text-mono" style={{ fontWeight: 600 }}>{confidenceThreshold}%+</span>
                <span style={{ color: "var(--text-muted)" }}>Max Bet:</span>
                <span className="text-mono" style={{ fontWeight: 600 }}>{maxBet} USDC</span>
              </div>
              {mode === "auto" && (
                <p style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", padding: "6px 0", borderTop: "1px solid var(--border)" }}>
                  A delegate keypair will be generated and funded with 0.01 sFUEL for gas.
                </p>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setStep(1)} className="btn-secondary" style={{ padding: "10px 20px" }}>Back</button>
              <button onClick={handleDeploy} disabled={isPending || isConfirming} className="btn-primary" style={{ padding: "10px 24px" }}>
                {isPending ? "Confirm in Wallet..." : isConfirming ? "Deploying..." : "Deploy Agent On-Chain"}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Agent Detail View
// ═══════════════════════════════════════════════════════════════════

function AgentDetailView({
  agent,
  isRunning,
  onStart,
  onStop,
  recommendations,
  onApprove,
  onReject,
  logs,
  audit,
  onRefresh,
  initialDetailTab,
  onDetailTabConsumed,
}: {
  agent: AgentProfile;
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  recommendations: AgentRecommendation[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  logs: AgentLog[];
  audit: AuditEntry[];
  onRefresh: () => void;
  initialDetailTab?: string | null;
  onDetailTabConsumed?: () => void;
}) {
  const validTabs = ["signals", "positions", "audit", "config", "fund", "logs"] as const;
  type DetailTab = typeof validTabs[number];
  const startTab: DetailTab = (initialDetailTab && validTabs.includes(initialDetailTab as DetailTab))
    ? (initialDetailTab as DetailTab)
    : "signals";
  const [detailTab, setDetailTab] = useState<DetailTab>(startTab);

  // Consume the deep-link tab after mount so it doesn't re-apply
  useEffect(() => {
    if (initialDetailTab && onDetailTabConsumed) {
      onDetailTabConsumed();
    }
  }, []);
  const meta = PERSONALITY_META[agent.personality];
  const pending = recommendations.filter((r) => r.status === "pending");

  return (
    <div>
      {/* Agent Header — compact */}
      <div style={{
        background: "var(--bg-raised)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: "16px 20px", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{ position: "relative", width: 40, height: 40, flexShrink: 0 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: `radial-gradient(circle at 35% 35%, ${agent.color}ee, ${agent.color}88 50%, ${agent.color}44 100%)`,
            boxShadow: isRunning ? `0 0 14px ${agent.color}50` : `0 0 6px ${agent.color}20`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#000", opacity: 0.7 }}>{agent.name.charAt(0).toUpperCase()}</span>
          </div>
          <div style={{
            position: "absolute", bottom: -1, right: -1,
            width: 10, height: 10, borderRadius: "50%",
            background: isRunning ? "#22c55e" : "var(--text-muted)",
            border: "2px solid var(--bg-raised)",
            boxShadow: isRunning ? "0 0 6px rgba(34, 197, 94, 0.5)" : "none",
            animation: isRunning ? "pulse-dot 2s ease-in-out infinite" : "none",
          }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{agent.name}</span>
            <span style={{
              padding: "1px 7px", borderRadius: 5, fontSize: 10, fontWeight: 500,
              color: "var(--text-muted)", background: "var(--bg)", border: "1px solid var(--border)",
            }}>{meta.label}</span>
            <span style={{
              padding: "1px 7px", borderRadius: 5, fontSize: 10, fontWeight: 500,
              color: "var(--text-muted)", background: "var(--bg)", border: "1px solid var(--border)",
            }}>{agent.autoExecute ? "Auto" : "Manual"}</span>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-muted)" }}>
            <span>#{agent.onChainId}</span>
            <span style={{ color: "var(--border)" }}>·</span>
            <span>{formatUnits(agent.balance, USDC_DECIMALS)} USDC</span>
            <span style={{ color: "var(--border)" }}>·</span>
            <span>Max {formatUnits(agent.maxBetPerMarket, USDC_DECIMALS)}</span>
            <span style={{ color: "var(--border)" }}>·</span>
            <span>{agent.confidenceThreshold}%+ conf</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {isRunning ? (
            <button onClick={onStop} className="btn-secondary" style={{ fontSize: 13, padding: "7px 16px" }}>Stop</button>
          ) : (
            <button onClick={onStart} className="btn-primary" style={{ fontSize: 13, padding: "7px 16px" }}>Start Scan</button>
          )}
        </div>
      </div>

      {/* Pending Approval Banner */}
      {!agent.autoExecute && pending.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          style={{
            padding: "12px 20px", marginBottom: 16,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            background: "var(--bg-raised)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <motion.div
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "var(--text-secondary)",
                }}
              />
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {pending.length} {pending.length === 1 ? "transaction" : "transactions"} awaiting approval
                </span>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                  Agent is paused until you approve or reject.
                </p>
              </div>
            </div>
            <button
              onClick={() => setDetailTab("signals")}
              style={{
                padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                cursor: "pointer", background: "transparent",
                color: "var(--text-secondary)", border: "1px solid var(--border)",
                transition: "all 200ms",
              }}
            >
              Review
            </button>
          </div>
        </motion.div>
      )}

      {/* Vault Balance Card — only auto-execute agents need the on-chain vault */}
      {agent.autoExecute && agent.balance === BigInt(0) ? (
        <div style={{
          padding: "12px 20px", marginBottom: 16,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          background: "var(--bg-raised)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 2 }}>Vault empty</span>
            <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
              Fund the vault to enable autonomous trading.
            </p>
          </div>
          <button
            onClick={() => setDetailTab("fund")}
            style={{
              padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              cursor: "pointer", background: "transparent",
              color: "var(--text-secondary)", border: "1px solid var(--border)",
              transition: "all 200ms", whiteSpace: "nowrap",
            }}
          >
            Fund
          </button>
        </div>
      ) : null}

      {/* System Prompt */}
      {agent.systemPrompt && (
        <div style={{
          padding: "12px 16px", marginBottom: 16, borderRadius: "var(--radius-sm)",
          background: "var(--bg-raised)", border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>System Prompt</div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, fontStyle: "italic" }}>{agent.systemPrompt}</p>
        </div>
      )}

      {/* Detail Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, overflowX: "auto" }}>
        {(["signals", "positions", "audit", "fund", "config", "logs"] as const).map((tab) => {
          const labels: Record<string, string> = {
            signals: `Signals${pending.length > 0 ? ` (${pending.length})` : ""}`,
            positions: "Positions",
            audit: `Audit${audit.length > 0 ? ` (${audit.length})` : ""}`,
            fund: "Fund",
            config: "Config",
            logs: "Logs",
          };
          return (
            <button
              key={tab}
              onClick={() => setDetailTab(tab)}
              style={{
                padding: "6px 14px", fontSize: 12, fontWeight: 500,
                color: detailTab === tab ? "var(--text-primary)" : "var(--text-muted)",
                background: detailTab === tab ? "rgba(167, 111, 250, 0.06)" : "transparent",
                border: detailTab === tab ? "1px solid rgba(167, 111, 250, 0.15)" : "1px solid transparent",
                borderRadius: 8,
                cursor: "pointer", transition: "all 200ms", whiteSpace: "nowrap",
              }}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {detailTab === "signals" && (
          <motion.div key="sig" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <RecommendationFeed
              recommendations={recommendations}
              agentColor={agent.color}
              onApprove={onApprove}
              onReject={onReject}
            />
          </motion.div>
        )}
        {detailTab === "positions" && (
          <motion.div key="pos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AgentPositionsPanel agentId={agent.onChainId} agentColor={agent.color} autoExecute={agent.autoExecute} />
          </motion.div>
        )}
        {detailTab === "audit" && (
          <motion.div key="audit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AgentAuditTrail audit={audit} agentColor={agent.color} />
          </motion.div>
        )}
        {detailTab === "fund" && (
          <motion.div key="fund" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <FundWithdrawPanel agentId={agent.onChainId} currentBalance={agent.balance} onRefresh={onRefresh} />
          </motion.div>
        )}
        {detailTab === "config" && (
          <motion.div key="cfg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AgentGuardrailsPanel agent={agent} onRefresh={onRefresh} />
          </motion.div>
        )}
        {detailTab === "logs" && (
          <motion.div key="logs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AgentActivityLog logs={logs} agentColor={agent.color} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Fund / Withdraw Panel
// ═══════════════════════════════════════════════════════════════════

function FundWithdrawPanel({
  agentId,
  currentBalance,
  onRefresh,
}: {
  agentId: number;
  currentBalance: bigint;
  onRefresh: () => void;
}) {
  const [fundAmount, setFundAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  // Approve USDC
  const { data: approveHash, writeContract: approveWrite, isPending: isApprovePending } = useWriteContract();
  const { isSuccess: isApproveSuccess, isLoading: isApproveConfirming } = useWaitForTransactionReceipt({ hash: approveHash });

  // Fund
  const { data: fundHash, writeContract: fundWrite, isPending: isFundPending } = useWriteContract();
  const { isSuccess: isFundSuccess, isLoading: isFundConfirming } = useWaitForTransactionReceipt({ hash: fundHash });

  // Withdraw
  const { data: withdrawHash, writeContract: withdrawWrite, isPending: isWithdrawPending } = useWriteContract();
  const { isSuccess: isWithdrawSuccess, isLoading: isWithdrawConfirming } = useWaitForTransactionReceipt({ hash: withdrawHash });

  useEffect(() => {
    if (isApproveSuccess && fundAmount) {
      fundWrite({
        address: BELIEF_MARKET_ADDRESS,
        abi: BELIEF_MARKET_ABI,
        functionName: "fundAgent",
        args: [BigInt(agentId), parseUnits(fundAmount, USDC_DECIMALS)],
      });
    }
  }, [isApproveSuccess, agentId, fundAmount, fundWrite]);

  useEffect(() => {
    if (isFundSuccess || isWithdrawSuccess) {
      setFundAmount("");
      setWithdrawAmount("");
      onRefresh();
    }
  }, [isFundSuccess, isWithdrawSuccess, onRefresh]);

  function handleFund() {
    if (!fundAmount || Number(fundAmount) <= 0) return;
    approveWrite({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [BELIEF_MARKET_ADDRESS, parseUnits(fundAmount, USDC_DECIMALS)],
    });
  }

  function handleWithdraw() {
    if (!withdrawAmount || Number(withdrawAmount) <= 0) return;
    withdrawWrite({
      address: BELIEF_MARKET_ADDRESS,
      abi: BELIEF_MARKET_ABI,
      functionName: "withdrawFromAgent",
      args: [BigInt(agentId), parseUnits(withdrawAmount, USDC_DECIMALS)],
    });
  }

  const isFunding = isApprovePending || isApproveConfirming || isFundPending || isFundConfirming;
  const isWithdrawing = isWithdrawPending || isWithdrawConfirming;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      {/* Fund */}
      <div className="card" style={{ padding: 24 }}>
        <h4 className="text-heading" style={{ marginBottom: 4 }}>Fund Agent</h4>
        <p className="text-caption" style={{ color: "var(--text-muted)", marginBottom: 16 }}>
          Deposit USDC into this agent&apos;s on-chain vault.
        </p>
        <div style={{ marginBottom: 16 }}>
          <input
            type="number" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)}
            className="input text-mono" placeholder="Amount (USDC)" step="any"
          />
        </div>
        <button onClick={handleFund} disabled={isFunding || !fundAmount} className="btn-primary" style={{ width: "100%" }}>
          {isFunding ? "Processing..." : "Deposit USDC"}
        </button>
        {isFundSuccess && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 8, textAlign: "center" }}>
            Funded successfully.
          </motion.p>
        )}
      </div>

      {/* Withdraw */}
      <div className="card" style={{ padding: 24 }}>
        <h4 className="text-heading" style={{ marginBottom: 4 }}>Withdraw</h4>
        <p className="text-caption" style={{ color: "var(--text-muted)", marginBottom: 16 }}>
          Withdraw USDC from the agent vault back to your wallet. Available: {formatUnits(currentBalance, USDC_DECIMALS)} USDC
        </p>
        <div style={{ marginBottom: 16 }}>
          <input
            type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)}
            className="input text-mono" placeholder="Amount (USDC)" step="any"
          />
        </div>
        <button onClick={handleWithdraw} disabled={isWithdrawing || !withdrawAmount} className="btn-secondary" style={{ width: "100%" }}>
          {isWithdrawing ? "Processing..." : "Withdraw USDC"}
        </button>
        {isWithdrawSuccess && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 8, textAlign: "center" }}>
            Withdrawn successfully.
          </motion.p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Agent Guardrails Panel (per-agent on-chain config)
// ═══════════════════════════════════════════════════════════════════

function AgentGuardrailsPanel({
  agent,
  onRefresh,
}: {
  agent: AgentProfile;
  onRefresh: () => void;
}) {
  const [name, setName] = useState(agent.name);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);
  const [personality, setPersonality] = useState(agent.personality);
  const [maxBet, setMaxBet] = useState(formatUnits(agent.maxBetPerMarket, USDC_DECIMALS));
  const [maxExposure, setMaxExposure] = useState(formatUnits(agent.maxTotalExposure, USDC_DECIMALS));
  const [allowedTypes, setAllowedTypes] = useState(agent.allowedAssetTypes);
  const [confidenceThreshold, setConfidenceThreshold] = useState(agent.confidenceThreshold);
  const [autoExecute, setAutoExecute] = useState(agent.autoExecute);

  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      onRefresh();
      // Full page reload so the engine picks up fresh on-chain guardrails
      setTimeout(() => window.location.reload(), 1500);
    }
  }, [isSuccess, onRefresh]);

  function handleUpdate() {
    writeContract({
      address: BELIEF_MARKET_ADDRESS,
      abi: BELIEF_MARKET_ABI,
      functionName: "updateAgent",
      args: [
        BigInt(agent.onChainId),
        name,
        systemPrompt,
        PERSONALITY_INDEX[personality],
        agent.delegate as `0x${string}`,
        parseUnits(maxBet, USDC_DECIMALS),
        parseUnits(maxExposure, USDC_DECIMALS),
        allowedTypes,
        confidenceThreshold,
        autoExecute,
      ],
    });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div className="card" style={{ padding: 24 }}>
        <h4 className="text-heading" style={{ marginBottom: 16 }}>Identity</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="text-caption" style={{ display: "block", marginBottom: 6 }}>Agent Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </div>
          <div>
            <label className="text-caption" style={{ display: "block", marginBottom: 6 }}>System Prompt</label>
            <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="input" rows={3} style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
          </div>
          <div>
            <label className="text-caption" style={{ display: "block", marginBottom: 8 }}>Personality</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {(["conservative", "balanced", "aggressive", "contrarian"] as AgentPersonality[]).map((p) => {
                const meta = PERSONALITY_META[p];
                const active = personality === p;
                return (
                  <button key={p} onClick={() => setPersonality(p)} style={{
                    padding: "10px 12px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                    background: active ? "var(--bg)" : "transparent",
                    border: `1px solid ${active ? "var(--border-hover)" : "var(--border)"}`,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: active ? "var(--text-primary)" : "var(--text-secondary)" }}>{meta.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <h4 className="text-heading" style={{ marginBottom: 16 }}>Guardrails</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="text-caption" style={{ display: "block", marginBottom: 6 }}>Max Bet / Market (USDC)</label>
            <input type="number" value={maxBet} onChange={(e) => setMaxBet(e.target.value)} className="input text-mono" step="any" />
          </div>
          <div>
            <label className="text-caption" style={{ display: "block", marginBottom: 6 }}>Max Total Exposure (USDC)</label>
            <input type="number" value={maxExposure} onChange={(e) => setMaxExposure(e.target.value)} className="input text-mono" step="any" />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span className="text-caption">Confidence Threshold</span>
              <span className="text-mono" style={{ fontSize: 13, fontWeight: 600 }}>{confidenceThreshold}%</span>
            </div>
            <input type="range" min={20} max={95} value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--text-secondary)" }}
            />
          </div>
          <div>
            <label className="text-caption" style={{ display: "block", marginBottom: 6 }}>Allowed Assets</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { value: ASSET_COMMODITY, label: "Commodity" },
                { value: ASSET_ETF, label: "ETF" },
                { value: ASSET_FX, label: "FX" },
              ].map((item) => {
                const active = (allowedTypes & item.value) !== 0;
                return (
                  <button key={item.value} onClick={() => setAllowedTypes((p) => p ^ item.value)} style={{
                    flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    background: active ? "var(--bg)" : "transparent",
                    color: active ? "var(--text-primary)" : "var(--text-muted)",
                    border: `1px solid ${active ? "var(--border-hover)" : "var(--border)"}`,
                  }}>{item.label}</button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-caption" style={{ display: "block", marginBottom: 6 }}>Execution Mode</label>
            <div style={{ display: "flex", gap: 8 }}>
              {([false, true] as const).map((auto) => (
                <button key={String(auto)} onClick={() => setAutoExecute(auto)} style={{
                  flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: autoExecute === auto ? "var(--bg)" : "transparent",
                  color: autoExecute === auto ? "var(--text-primary)" : "var(--text-muted)",
                  border: `1px solid ${autoExecute === auto ? "var(--border-hover)" : "var(--border)"}`,
                }}>{auto ? "Auto-Execute" : "Manual"}</button>
              ))}
            </div>
          </div>
          <button onClick={handleUpdate} disabled={isPending || isConfirming} className="btn-primary" style={{ marginTop: 4 }}>
            {isPending ? "Confirm..." : isConfirming ? "Updating..." : isSuccess ? "Updated" : "Update On-Chain"}
          </button>
          {isSuccess && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-caption" style={{ color: "var(--text-secondary)", textAlign: "center" }}>
              Agent config updated on-chain.
            </motion.p>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Agent Comparison Panel
// ═══════════════════════════════════════════════════════════════════

function AgentComparisonPanel({
  profiles,
  recommendations,
  runningAgents,
}: {
  profiles: AgentProfile[];
  recommendations: AgentRecommendation[];
  runningAgents: Set<number>;
}) {
  if (profiles.length < 1) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 48 }}>
        <p className="text-body-lg" style={{ color: "var(--text-muted)" }}>Create agents to compare.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["Agent", "ID", "Status", "Personality", "Mode", "Vault", "Max Bet", "Confidence"].map((h) => (
              <th key={h} style={{
                padding: "12px 16px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
                textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {profiles.map((agent) => {
            const meta = PERSONALITY_META[agent.personality];
            const isRunning = runningAgents.has(agent.onChainId);
            return (
              <tr key={agent.onChainId} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: `radial-gradient(circle at 35% 35%, ${agent.color}ee, ${agent.color}88 50%, ${agent.color}44 100%)`,
                      boxShadow: `0 0 8px ${agent.color}30`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#000", opacity: 0.7 }}>{agent.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{agent.name}</span>
                  </div>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span className="text-mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>#{agent.onChainId}</span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: isRunning ? "var(--text-secondary)" : "var(--text-muted)" }}>
                    {isRunning ? "Running" : agent.isActive ? "Idle" : "Inactive"}
                  </span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{meta.label}</span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}>
                    {agent.autoExecute ? "Auto" : "Manual"}
                  </span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span className="text-mono" style={{ fontSize: 12 }}>{formatUnits(agent.balance, USDC_DECIMALS)}</span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span className="text-mono" style={{ fontSize: 12 }}>{formatUnits(agent.maxBetPerMarket, USDC_DECIMALS)}</span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span className="text-mono" style={{ fontSize: 12 }}>{agent.confidenceThreshold}%+</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Global Audit Trail
// ═══════════════════════════════════════════════════════════════════

function GlobalAuditTrail({ audit, profiles }: { audit: AuditEntry[]; profiles: AgentProfile[] }) {
  const getAgent = (id: number) => profiles.find((p) => p.onChainId === id);

  if (audit.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 48 }}>
        <p className="text-body-lg" style={{ color: "var(--text-muted)" }}>No audit entries yet.</p>
        <p className="text-caption" style={{ color: "var(--text-muted)" }}>Actions will be logged as agents operate.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, maxHeight: 600, overflow: "auto" }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--bg-raised)", zIndex: 1 }}>
        <h3 className="text-heading">Full Audit Trail</h3>
        <p className="text-caption" style={{ color: "var(--text-muted)" }}>{audit.length} entries</p>
      </div>
      {audit.map((entry) => {
        const agent = getAgent(entry.agentId);
        return (
          <AuditRow key={entry.id} entry={entry} agentName={agent?.name} agentColor={agent?.color || "var(--text-muted)"} />
        );
      })}
    </div>
  );
}

const AUDIT_ACTION_COLORS: Record<string, string> = {
  created: "var(--text-secondary)", funded: "var(--text-secondary)", withdrawn: "var(--text-muted)",
  started: "var(--text-secondary)", stopped: "var(--text-muted)", scan: "var(--text-muted)",
  recommendation: "var(--text-secondary)", approved: "var(--text-secondary)", rejected: "var(--text-muted)",
  executed: "var(--text-secondary)", config_updated: "var(--text-muted)", error: "var(--text-muted)",
};

function AuditRow({ entry, agentName, agentColor }: { entry: AuditEntry; agentName?: string; agentColor: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{ padding: "10px 24px", borderBottom: "1px solid rgba(255,255,255,0.03)", cursor: entry.details || entry.metadata ? "pointer" : "default" }}
      onClick={() => setExpanded((p) => !p)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="text-mono" style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 72 }}>
          {new Date(entry.timestamp).toLocaleTimeString()}
        </span>
        {agentName && <span style={{ width: 8, height: 8, borderRadius: "50%", background: agentColor }} />}
        {agentName && <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", minWidth: 80 }}>{agentName}</span>}
        <span style={{
          padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
          color: AUDIT_ACTION_COLORS[entry.action] || "var(--text-muted)",
          background: `${AUDIT_ACTION_COLORS[entry.action] || "var(--text-muted)"}10`,
          textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          {entry.action.replace("_", " ")}
        </span>
        {entry.metadata?.source === "llm" && (
          <span style={{
            padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700,
            background: "rgba(167, 111, 250, 0.1)", border: "1px solid rgba(167, 111, 250, 0.2)",
            color: "#A76FFA", letterSpacing: "0.04em",
          }}>LLM</span>
        )}
        <span style={{ fontSize: 13, color: "var(--text-secondary)", flex: 1 }}>{entry.summary}</span>
        {(entry.details || entry.metadata) && (
          <span style={{ fontSize: 10, color: "var(--text-muted)", transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 200ms" }}>&#9656;</span>
        )}
      </div>
      <AnimatePresence>
        {expanded && (entry.details || entry.metadata) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden", marginTop: 8, marginLeft: 92, padding: "8px 12px", borderRadius: 6, background: "var(--bg)", border: "1px solid var(--border)" }}
          >
            {entry.details && <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: entry.metadata ? 6 : 0, lineHeight: 1.5 }}>{entry.details}</p>}
            {entry.metadata && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {Object.entries(entry.metadata).map(([k, v]) => (
                  <span key={k} style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    <span style={{ fontWeight: 600 }}>{k}:</span> {String(v)}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Recommendation Feed
// ═══════════════════════════════════════════════════════════════════

function RecommendationFeed({
  recommendations,
  agentColor,
  onApprove,
  onReject,
}: {
  recommendations: AgentRecommendation[];
  agentColor: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const pending = recommendations.filter((r) => r.status === "pending");
  const executed = recommendations.filter((r) => r.status === "executed");
  const rejected = recommendations.filter((r) => r.status === "rejected");

  if (recommendations.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 48 }}>
        <p className="text-body-lg" style={{ color: "var(--text-muted)" }}>No signals yet</p>
        <p className="text-caption" style={{ color: "var(--text-muted)" }}>Start the agent to begin scanning.</p>
      </div>
    );
  }

  const sections = [
    { label: `Awaiting Approval (${pending.length})`, items: pending, showActions: true },
    { label: `Executed (${executed.length})`, items: executed.slice(0, 10) },
    { label: `Rejected (${rejected.length})`, items: rejected.slice(0, 5) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {sections.filter((s) => s.items.length > 0).map((section) => (
        <div key={section.label}>
          <h4 className="text-caption" style={{ marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>{section.label}</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {section.items.map((rec) => (
              <RecCard
                key={rec.id} rec={rec} agentColor={agentColor}
                onApprove={onApprove} onReject={onReject}
                showActions={section.showActions}
                queryClient={queryClient}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecCard({
  rec, agentColor, onApprove, onReject, showActions, queryClient,
}: {
  rec: AgentRecommendation; agentColor: string;
  onApprove: (id: string) => void; onReject: (id: string) => void;
  showActions?: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const isYes = rec.direction;

  // Step 1: Approve USDC spending
  const { data: approveHash, writeContract: approveWrite, isPending: isApproving } = useWriteContract();
  const { isSuccess: isApproveConfirmed, isLoading: isApproveConfirming } = useWaitForTransactionReceipt({ hash: approveHash });

  // Step 2: Submit position (uses user's wallet USDC via submitPosition)
  const { data: submitHash, writeContract: submitWrite, isPending: isSubmitting } = useWriteContract();
  const { isSuccess: isSubmitConfirmed, isLoading: isSubmitConfirming } = useWaitForTransactionReceipt({ hash: submitHash });

  // After USDC approval confirmed, encrypt and submit the position
  useEffect(() => {
    if (isApproveConfirmed) {
      (async () => {
        try {
          const encrypted = await encryptDirection(rec.direction);
          submitWrite({
            address: BELIEF_MARKET_ADDRESS,
            abi: BELIEF_MARKET_ABI,
            functionName: "submitPosition",
            args: [BigInt(rec.marketId), encrypted, rec.suggestedStake],
          });
        } catch (err) {
          console.error("[Agent] BITE encryption failed:", err);
        }
      })();
    }
  }, [isApproveConfirmed, rec.direction, rec.marketId, rec.suggestedStake, submitWrite]);

  // After position submission confirmed, mark as executed
  useEffect(() => {
    if (isSubmitConfirmed) {
      onApprove(rec.id);
      queryClient.invalidateQueries();
    }
  }, [isSubmitConfirmed, rec.id, onApprove, queryClient]);

  function handleApproveAndSign() {
    // First: approve the contract to spend the user's USDC
    approveWrite({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [BELIEF_MARKET_ADDRESS, rec.suggestedStake],
    });
  }

  const busy = isApproving || isApproveConfirming || isSubmitting || isSubmitConfirming;
  const statusLabel = isApproving
    ? "Approve USDC..."
    : isApproveConfirming
    ? "Confirming approval..."
    : isSubmitting
    ? "Submitting..."
    : isSubmitConfirming
    ? "Confirming tx..."
    : null;

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="card"
      style={{ padding: "16px 20px", borderLeft: "none", opacity: rec.status === "rejected" ? 0.5 : 1 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{
              padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
              background: "var(--bg)", border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}>{isYes ? "YES" : "NO"}</span>
            <span className="text-body" style={{ fontWeight: 600 }}>Market #{rec.marketId}</span>
            {/* LLM vs Rules badge */}
            {rec.reasoning.includes("[LLM]") || rec.reasoning.includes("Market Analysis:") ? (
              <span style={{
                padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                background: "rgba(167, 111, 250, 0.1)", border: "1px solid rgba(167, 111, 250, 0.2)",
                color: "#A76FFA", letterSpacing: "0.03em",
              }}>LLM</span>
            ) : (
              <span style={{
                padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
                color: "var(--text-muted)", letterSpacing: "0.03em",
              }}>Rules</span>
            )}
            {rec.txHash && <span className="text-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>tx: {rec.txHash.slice(0, 10)}...</span>}
          </div>
          {/* Split reasoning from market analysis */}
          {(() => {
            const parts = rec.reasoning.split("\n\nMarket Analysis:");
            return (
              <>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: parts[1] ? 4 : 8 }}>{parts[0]}</p>
                {parts[1] && (
                  <p style={{
                    fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 8,
                    padding: "6px 10px", borderRadius: 6,
                    background: "rgba(167, 111, 250, 0.03)", border: "1px solid rgba(167, 111, 250, 0.06)",
                    fontStyle: "italic",
                  }}>
                    {parts[1].trim()}
                  </p>
                )}
              </>
            );
          })()}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[
              { l: "Dist", v: `${rec.signals.priceDistance > 0 ? "+" : ""}${rec.signals.priceDistance}%` },
              { l: "Mom", v: `${rec.signals.momentum > 0 ? "+" : ""}${rec.signals.momentum}` },
              { l: "Urg", v: `${rec.signals.timeUrgency}%` },
              { l: "Skew", v: `${rec.signals.poolImbalance > 0 ? "+" : ""}${rec.signals.poolImbalance}%` },
            ].map((s) => (
              <span key={s.l} style={{
                fontSize: 11, padding: "2px 6px", borderRadius: 4,
                background: "var(--bg)", border: "1px solid var(--border)",
              }}>
                <span style={{ color: "var(--text-muted)" }}>{s.l} </span>
                <span className="text-mono" style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{s.v}</span>
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, minWidth: 100 }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            border: "2px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span className="text-mono" style={{ fontSize: 15, fontWeight: 700 }}>{rec.confidence}</span>
          </div>
          <span className="text-caption text-mono">{formatUnits(rec.suggestedStake, USDC_DECIMALS)} USDC</span>
          {showActions && (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={handleApproveAndSign} disabled={busy} style={{
                padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer",
                background: busy ? "rgba(34,197,94,0.08)" : "rgba(34,197,94,0.12)",
                color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)",
                opacity: busy ? 0.7 : 1,
                transition: "all 150ms",
              }}>{statusLabel || "Approve"}</button>
              <button onClick={() => onReject(rec.id)} disabled={busy} style={{
                padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)",
                transition: "all 150ms",
              }}>Reject</button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Agent Positions Panel (reads on-chain positions for this agent)
// ═══════════════════════════════════════════════════════════════════

function AgentPositionsPanel({ agentId, agentColor, autoExecute }: { agentId: number; agentColor: string; autoExecute: boolean }) {
  const { address } = useAccount();

  // For auto-execute agents, read agent-specific positions
  const { data: agentPosIds } = useReadContract({
    address: BELIEF_MARKET_ADDRESS,
    abi: BELIEF_MARKET_ABI,
    functionName: "getAgentPositionIds",
    args: [BigInt(agentId)],
  });

  // For manual agents, read user positions
  const { data: userPosIds } = useReadContract({
    address: BELIEF_MARKET_ADDRESS,
    abi: BELIEF_MARKET_ABI,
    functionName: "getUserPositionIds",
    args: [address as `0x${string}`],
    query: { enabled: !!address },
  });

  const posIds = autoExecute ? (agentPosIds as bigint[] | undefined) : (userPosIds as bigint[] | undefined);

  if (!posIds || posIds.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 48 }}>
        <p className="text-body-lg" style={{ color: "var(--text-muted)" }}>No positions yet</p>
        <p className="text-caption" style={{ color: "var(--text-muted)" }}>
          {autoExecute ? "Auto-execute agent positions will appear here." : "Approved positions will appear here."}
        </p>
      </div>
    );
  }

  // Group positions: show most recent first, limit to 20
  const ids = [...posIds].reverse().slice(0, 20);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span className="text-caption" style={{ textTransform: "uppercase", letterSpacing: 1 }}>
          {ids.length} Position{ids.length !== 1 ? "s" : ""}
        </span>
        <span className="text-caption" style={{ color: "var(--text-muted)" }}>
          {autoExecute ? "Agent vault positions" : "User wallet positions"}
        </span>
      </div>
      {ids.map((posId) => (
        <PositionRow key={posId.toString()} positionId={posId} agentColor={agentColor} />
      ))}
    </div>
  );
}

function PositionRow({ positionId, agentColor }: { positionId: bigint; agentColor: string }) {
  const { data: posData } = useReadContract({
    address: BELIEF_MARKET_ADDRESS,
    abi: BELIEF_MARKET_ABI,
    functionName: "getPosition",
    args: [positionId],
  });

  if (!posData) {
    return (
      <div className="card" style={{ padding: "12px 20px", opacity: 0.5 }}>
        <span className="text-mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading position #{positionId.toString()}...</span>
      </div>
    );
  }

  const pos = posData as any;
  const status = Number(pos.status);
  const deposit = Number(pos.deposit) / 10 ** USDC_DECIMALS;
  const payout = Number(pos.payout) / 10 ** USDC_DECIMALS;
  const marketId = Number(pos.marketId);
  const isActive = status === 0;
  const isSettled = status === 1;
  const direction = pos.direction;

  const STATUS_MAP: Record<number, { label: string; color: string }> = {
    0: { label: "Active", color: "#00e676" },
    1: { label: "Settled", color: "#00e5ff" },
    2: { label: "Cancelled", color: "var(--text-muted)" },
    3: { label: "Refunded", color: "var(--text-secondary)" },
  };

  const s = STATUS_MAP[status] || { label: "Unknown", color: "var(--text-muted)" };
  const pnl = isSettled ? payout - deposit : 0;

  return (
    <div className="card" style={{
      padding: "14px 20px",
      borderLeft: `3px solid ${isActive ? agentColor : s.color}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="text-mono" style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 36 }}>#{positionId.toString()}</span>
          <span style={{
            padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: direction ? "rgba(0,230,118,0.1)" : "rgba(255,82,82,0.1)",
            color: direction ? "#00e676" : "var(--no)",
          }}>{direction ? "YES" : "NO"}</span>
          <span className="text-body" style={{ fontWeight: 600 }}>Market #{marketId}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div className="text-mono" style={{ fontSize: 14, fontWeight: 700 }}>{deposit.toFixed(2)} USDC</div>
            {isSettled && (
              <div className="text-mono" style={{
                fontSize: 12, fontWeight: 600,
                color: pnl > 0 ? "#00e676" : pnl < 0 ? "var(--no)" : "var(--text-muted)",
              }}>
                {pnl > 0 ? "+" : ""}{pnl.toFixed(2)} PnL
              </div>
            )}
          </div>
          <span style={{
            padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
            color: s.color, background: `${s.color}15`, border: `1px solid ${s.color}30`,
          }}>
            {s.label}
          </span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Per-Agent Audit Trail
// ═══════════════════════════════════════════════════════════════════

function AgentAuditTrail({ audit, agentColor }: { audit: AuditEntry[]; agentColor: string }) {
  // Categorize entries
  const executions = audit.filter((a) => a.action === "executed");
  const recommendations = audit.filter((a) => a.action === "recommendation");
  const errors = audit.filter((a) => a.action === "error");
  const configChanges = audit.filter((a) => a.action === "config_updated" || a.action === "funded" || a.action === "withdrawn");
  const lifecycle = audit.filter((a) => a.action === "started" || a.action === "stopped" || a.action === "created");

  if (audit.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 48 }}>
        <p className="text-body-lg" style={{ color: "var(--text-muted)" }}>No audit entries yet</p>
        <p className="text-caption" style={{ color: "var(--text-muted)" }}>Actions will be logged as the agent operates.</p>
      </div>
    );
  }

  // Summary stats at top
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Executed", value: executions.length },
          { label: "Signals", value: recommendations.length },
          { label: "Errors", value: errors.length },
          { label: "Config / Fund", value: configChanges.length },
        ].map((stat) => (
          <div key={stat.label} className="card" style={{ padding: "12px 16px", textAlign: "center" }}>
            <div className="text-mono" style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>{stat.value}</div>
            <div className="text-caption" style={{ color: "var(--text-muted)", marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Executed Actions */}
      {executions.length > 0 && (
        <div>
          <h4 className="text-caption" style={{ marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
            Executed Actions ({executions.length})
          </h4>
          <div className="card" style={{ padding: 0, maxHeight: 300, overflow: "auto" }}>
            {executions.map((entry) => (
              <AuditDetailRow key={entry.id} entry={entry} accentColor="var(--text-secondary)" />
            ))}
          </div>
        </div>
      )}

      {/* Signals Generated */}
      {recommendations.length > 0 && (
        <div>
          <h4 className="text-caption" style={{ marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
            Signals Generated ({recommendations.length})
          </h4>
          <div className="card" style={{ padding: 0, maxHeight: 250, overflow: "auto" }}>
            {recommendations.map((entry) => (
              <AuditDetailRow key={entry.id} entry={entry} accentColor="var(--text-secondary)" />
            ))}
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div>
          <h4 className="text-caption" style={{ marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
            Errors ({errors.length})
          </h4>
          <div className="card" style={{ padding: 0, maxHeight: 200, overflow: "auto" }}>
            {errors.map((entry) => (
              <AuditDetailRow key={entry.id} entry={entry} accentColor="var(--text-muted)" />
            ))}
          </div>
        </div>
      )}

      {/* Full Timeline */}
      <div>
        <h4 className="text-caption" style={{ marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
          Full Timeline ({audit.length})
        </h4>
        <div className="card" style={{ padding: 0, maxHeight: 400, overflow: "auto" }}>
          {audit.map((entry) => (
            <AuditDetailRow key={entry.id} entry={entry} accentColor={AUDIT_ACTION_COLORS[entry.action] || "var(--text-muted)"} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AuditDetailRow({ entry, accentColor }: { entry: AuditEntry; accentColor: string }) {
  const [expanded, setExpanded] = useState(false);
  const hasExtra = !!(entry.details || entry.metadata);

  return (
    <div
      style={{
        padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.03)",
        cursor: hasExtra ? "pointer" : "default",
      }}
      onClick={() => hasExtra && setExpanded((p) => !p)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="text-mono" style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 80, flexShrink: 0 }}>
          {new Date(entry.timestamp).toLocaleTimeString()}
        </span>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor, flexShrink: 0 }} />
        <span style={{
          padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
          color: accentColor, background: `${accentColor}15`,
          textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0,
        }}>
          {entry.action.replace("_", " ")}
        </span>
        <span style={{ fontSize: 13, color: "var(--text-secondary)", flex: 1, lineHeight: 1.4 }}>{entry.summary}</span>
        {hasExtra && (
          <span style={{ fontSize: 10, color: "var(--text-muted)", transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 200ms", flexShrink: 0 }}>&#9656;</span>
        )}
      </div>
      <AnimatePresence>
        {expanded && hasExtra && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden", marginTop: 8, marginLeft: 100 }}
          >
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)" }}>
              {entry.details && (
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: entry.metadata ? 8 : 0, lineHeight: 1.6 }}>{entry.details}</p>
              )}
              {entry.metadata && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "6px 16px" }}>
                  {Object.entries(entry.metadata).map(([k, v]) => (
                    <div key={k} style={{ fontSize: 11 }}>
                      <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{k}</span>
                      <span style={{ color: "var(--text-secondary)", marginLeft: 6 }}>
                        {typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Activity Log
// ═══════════════════════════════════════════════════════════════════

function AgentActivityLog({ logs, agentColor }: { logs: AgentLog[]; agentColor: string }) {
  const typeColors: Record<string, string> = {
    info: "var(--text-muted)", scan: "var(--text-muted)", recommendation: "var(--text-secondary)",
    execution: "var(--text-secondary)", error: "var(--text-muted)", warning: "var(--text-muted)",
  };

  return (
    <div className="card" style={{ maxHeight: 480, overflow: "auto", padding: 24 }}>
      <h3 className="text-heading" style={{ marginBottom: 16 }}>Activity Log</h3>
      {logs.length === 0 ? (
        <p className="text-body" style={{ color: "var(--text-muted)" }}>No activity yet. Start the agent to begin scanning.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {logs.map((log, i) => (
            <div key={log.timestamp + "-" + i}
              style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <span className="text-mono" style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0, minWidth: 72 }}>
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: typeColors[log.type] || "var(--text-muted)", flexShrink: 0, marginTop: 5 }} />
              <span style={{ fontSize: 13, color: typeColors[log.type] || "var(--text-secondary)", lineHeight: 1.5 }}>{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
