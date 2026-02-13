import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// ─── Types ───────────────────────────────────────────────────────────

interface MarketContext {
  marketId: number;
  symbol: string;
  name: string;
  category: string;
  currentPrice: number;
  targetPrice: number;
  conditionAbove: boolean;
  yesPool: number;
  noPool: number;
  resolutionTime: number;
  priceDistance: number;
  momentum: number;
  timeUrgency: number;
  poolImbalance: number;
  hasExistingPosition: boolean;
}

interface AgentContext {
  agentId: number;
  name: string;
  personality: string;
  systemPrompt: string;
  balance: number;
  maxBetPerMarket: number;
  maxTotalExposure: number;
  currentExposure: number;
  confidenceThreshold: number;
  autoExecute: boolean;
  allowedAssetTypes: number;
}

interface MemoryEntry {
  timestamp: number;
  marketId: number;
  symbol: string;
  action: "buy_yes" | "buy_no" | "hold" | "rejected";
  stake: number;
  reasoning: string;
  confidence: number;
  /** Only present when action === "rejected" — the original action before the user rejected */
  originalAction?: "buy_yes" | "buy_no";
}

interface DecisionRequest {
  agent: AgentContext;
  markets: MarketContext[];
  memory: MemoryEntry[];
}

export interface LLMDecision {
  action: "buy_yes" | "buy_no" | "hold";
  marketId: number | null;
  symbol: string;
  stake: number;
  confidence: number;
  reasoning: string;
  marketAnalysis: string;
  source: "llm" | "fallback";
}

// ─── Route Handler ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DecisionRequest;
    const { agent, markets, memory } = body;

    if (!markets || markets.length === 0) {
      return NextResponse.json({
        action: "hold",
        marketId: null,
        symbol: "",
        stake: 0,
        confidence: 0,
        reasoning: "No open markets available.",
        marketAnalysis: "",
        source: "fallback",
      } as LLMDecision);
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.includes("placeholder")) {
      // No API key — return a signal to use fallback
      return NextResponse.json({ useFallback: true });
    }

    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });

    // Build the system prompt
    const systemPrompt = buildSystemPrompt(agent);
    const userPrompt = buildUserPrompt(agent, markets, memory);

    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1024,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ useFallback: true });
    }

    const parsed = JSON.parse(content);

    // Validate and enforce guardrails
    const decision = enforceGuardrails(parsed, agent, markets);

    return NextResponse.json(decision);
  } catch (err) {
    console.error("[Agent Decision API] Error:", err);
    return NextResponse.json({ useFallback: true });
  }
}

// ─── Prompt Builders ─────────────────────────────────────────────────

function buildSystemPrompt(agent: AgentContext): string {
  return `You are an autonomous AI trading agent for an encrypted prediction market platform called BeliefMarket.

Your identity:
- Name: ${agent.name}
- Personality: ${agent.personality}
- Mode: ${agent.autoExecute ? "Auto-execute (trades from your vault)" : "Manual (recommends trades for user approval)"}

Your personality traits:
${getPersonalityDescription(agent.personality)}

Your guardrails (MUST be respected):
- Max bet per market: ${agent.maxBetPerMarket} USDC
- Max total exposure: ${agent.maxTotalExposure} USDC
- Current exposure: ${agent.currentExposure} USDC
- Available balance: ${agent.balance} USDC
- Confidence threshold: ${agent.confidenceThreshold}% (only act if your confidence >= this)
- Allowed asset types mask: ${agent.allowedAssetTypes}

${agent.systemPrompt ? `Custom instructions from your creator:\n${agent.systemPrompt}\n` : ""}

Rules:
1. You can ONLY pick ONE market per decision cycle. Choose the single best opportunity.
2. You can: buy_yes (bet price will meet condition), buy_no (bet it won't), or hold (do nothing).
3. You MUST respect your guardrails. Never exceed max bet or exposure limits.
4. If you are in Manual mode, balance does NOT matter — the user will pay from their own wallet. NEVER hold because of balance in manual mode.
5. If you are in Auto-execute mode and balance is 0, you MUST hold.
6. Consider your past actions — avoid over-concentrating on one market.
7. Provide clear, detailed reasoning for your decision.
8. Your confidence must genuinely reflect how sure you are (0-100).
9. IMPORTANT: You should ALWAYS take a position (buy_yes or buy_no) on a market. Do NOT hold unless you are in auto-execute mode with 0 balance, or all markets already have your existing positions. Every market has an opportunity — analyze the data and commit to a direction. Being conservative means smaller stakes, NOT refusing to trade.
10. REJECTED RECOMMENDATIONS: If the user previously rejected one of your recommendations, you will see it in the "USER-REJECTED RECOMMENDATIONS" section. You CAN still recommend the same market, but you MUST:
    - Provide NEW and STRONGER reasoning that is clearly different from the rejected attempt.
    - Consider whether a different direction (YES vs NO) or different stake size would be more appropriate.
    - Explicitly acknowledge the prior rejection in your reasoning (e.g., "Previously my BUY_YES was rejected, but now I see...").
    - If you have nothing new to say, pick a DIFFERENT market instead.

Respond in JSON with exactly these fields:
{
  "action": "buy_yes" | "buy_no" | "hold",
  "marketId": <number or null if hold>,
  "symbol": "<asset symbol or empty if hold>",
  "stake": <number in USDC, 0 if hold>,
  "confidence": <0-100>,
  "reasoning": "<2-4 sentence explanation of your decision>",
  "marketAnalysis": "<brief analysis of all markets you considered>"
}`;
}

function buildUserPrompt(
  agent: AgentContext,
  markets: MarketContext[],
  memory: MemoryEntry[]
): string {
  let prompt = `Current timestamp: ${new Date().toISOString()}\n\n`;

  // Markets
  prompt += `=== OPEN MARKETS (${markets.length}) ===\n\n`;
  for (const m of markets) {
    const timeLeft = Math.max(0, m.resolutionTime - Date.now() / 1000);
    const hoursLeft = (timeLeft / 3600).toFixed(1);
    const totalPool = m.yesPool + m.noPool;

    prompt += `Market #${m.marketId} — ${m.name} (${m.symbol})\n`;
    prompt += `  Category: ${m.category}\n`;
    prompt += `  Condition: Price ${m.conditionAbove ? "ABOVE" : "BELOW"} $${m.targetPrice.toFixed(2)}\n`;
    prompt += `  Current Price: $${m.currentPrice.toFixed(4)}\n`;
    prompt += `  Price Distance: ${m.priceDistance > 0 ? "+" : ""}${m.priceDistance.toFixed(2)}% from target\n`;
    prompt += `  Momentum: ${m.momentum > 0 ? "+" : ""}${m.momentum} (recent price trend)\n`;
    prompt += `  Time Left: ${hoursLeft}h (urgency: ${m.timeUrgency}%)\n`;
    prompt += `  Pool: YES=${m.yesPool.toFixed(2)} / NO=${m.noPool.toFixed(2)} USDC (total: ${totalPool.toFixed(2)})\n`;
    prompt += `  Pool Imbalance: ${m.poolImbalance > 0 ? "+" : ""}${m.poolImbalance}% (positive = more YES)\n`;
    prompt += `  You have existing position: ${m.hasExistingPosition ? "YES — consider carefully before adding" : "NO"}\n\n`;
  }

  // Memory — split into rejections and other actions for clarity
  const rejections = memory.filter((m) => m.action === "rejected");
  const otherActions = memory.filter((m) => m.action !== "rejected");

  if (rejections.length > 0) {
    prompt += `=== USER-REJECTED RECOMMENDATIONS (${rejections.length}) ===\n`;
    prompt += `The user REJECTED the following recommendations you made. If you want to recommend the same market again, you MUST provide NEW and STRONGER reasoning explaining why this time is different.\n\n`;
    for (const m of rejections.slice(0, 10)) {
      const date = new Date(m.timestamp).toLocaleString();
      const origAction = m.originalAction ? m.originalAction.toUpperCase() : "UNKNOWN";
      prompt += `  [${date}] Market #${m.marketId} (${m.symbol}): Your ${origAction} was REJECTED by user — ${m.stake} USDC @ ${m.confidence}% confidence\n`;
      prompt += `    Context: ${m.reasoning}\n\n`;
    }
  }

  if (otherActions.length > 0) {
    prompt += `=== YOUR PAST ACTIONS (last ${otherActions.length}) ===\n\n`;
    for (const m of otherActions.slice(0, 15)) {
      const date = new Date(m.timestamp).toLocaleString();
      prompt += `  [${date}] Market #${m.marketId} (${m.symbol}): ${m.action.toUpperCase()} — ${m.stake} USDC @ ${m.confidence}% confidence\n`;
      prompt += `    Reasoning: ${m.reasoning}\n\n`;
    }
  } else if (rejections.length === 0) {
    prompt += `=== YOUR PAST ACTIONS ===\nNone yet. This is your first decision cycle.\n\n`;
  }

  // Remaining capacity
  const remainingExposure = agent.maxTotalExposure - agent.currentExposure;
  prompt += `=== YOUR STATUS ===\n`;
  if (agent.autoExecute) {
    prompt += `Mode: Auto-execute (trades from vault)\n`;
    prompt += `Vault Balance: ${agent.balance} USDC\n`;
  } else {
    prompt += `Mode: Manual (user pays from their own wallet — balance is NOT a constraint for you)\n`;
  }
  prompt += `Remaining exposure capacity: ${remainingExposure} USDC\n`;
  prompt += `Max bet per market: ${agent.maxBetPerMarket} USDC\n\n`;
  prompt += `Make your decision now. You MUST pick a market and take a position (buy_yes or buy_no). Do NOT hold.`;

  return prompt;
}

function getPersonalityDescription(personality: string): string {
  switch (personality) {
    case "conservative":
      return "- Risk-averse: prefer smaller bets, higher confidence required\n- Favor stable assets with clear price signals\n- Avoid markets with high uncertainty or low time remaining\n- Weight momentum signals heavily before committing";
    case "aggressive":
      return "- Risk-seeking: comfortable with larger bets on strong signals\n- Willing to act on moderate confidence levels\n- Weight price distance heavily — big gaps = big opportunity\n- Time pressure increases willingness to act";
    case "contrarian":
      return "- Contrarian: look for opportunities where the crowd is wrong\n- Favor markets with large pool imbalances (bet against the majority)\n- Higher confidence when going against consensus\n- Value information asymmetry over momentum";
    case "balanced":
    default:
      return "- Balanced approach: moderate risk tolerance\n- Equal weight to all signal types (price, momentum, time, pool)\n- Act when confidence is solid but don't require extremes\n- Diversify across different markets when possible";
  }
}

// ─── Guardrail Enforcement ───────────────────────────────────────────

function enforceGuardrails(
  parsed: any,
  agent: AgentContext,
  markets: MarketContext[]
): LLMDecision {
  const action = parsed.action;

  // If hold, just return
  if (action === "hold" || !parsed.marketId) {
    return {
      action: "hold",
      marketId: null,
      symbol: parsed.symbol || "",
      stake: 0,
      confidence: Math.min(100, Math.max(0, parsed.confidence || 0)),
      reasoning: parsed.reasoning || "Decided to hold — no clear opportunity.",
      marketAnalysis: parsed.marketAnalysis || "",
      source: "llm",
    };
  }

  // Validate market exists in our list
  const market = markets.find((m) => m.marketId === parsed.marketId);
  if (!market) {
    return {
      action: "hold",
      marketId: null,
      symbol: "",
      stake: 0,
      confidence: 0,
      reasoning: `LLM selected invalid market #${parsed.marketId}. Holding.`,
      marketAnalysis: parsed.marketAnalysis || "",
      source: "llm",
    };
  }

  // Enforce confidence threshold
  const confidence = Math.min(100, Math.max(0, parsed.confidence || 0));
  if (confidence < agent.confidenceThreshold) {
    return {
      action: "hold",
      marketId: null,
      symbol: market.symbol,
      stake: 0,
      confidence,
      reasoning: `LLM confidence (${confidence}%) below threshold (${agent.confidenceThreshold}%). Original reasoning: ${parsed.reasoning}`,
      marketAnalysis: parsed.marketAnalysis || "",
      source: "llm",
    };
  }

  // Enforce stake limits
  let stake = Math.max(0, parsed.stake || 0);
  stake = Math.min(stake, agent.maxBetPerMarket); // Max bet per market
  const remainingExposure = agent.maxTotalExposure - agent.currentExposure;
  stake = Math.min(stake, remainingExposure); // Max exposure
  if (agent.autoExecute) {
    stake = Math.min(stake, agent.balance); // Vault balance
  }
  stake = Math.round(stake * 100) / 100; // Round to 2 decimals

  if (stake <= 0) {
    return {
      action: "hold",
      marketId: null,
      symbol: market.symbol,
      stake: 0,
      confidence,
      reasoning: `Wanted to ${action} on ${market.symbol} but insufficient funds/exposure. ${parsed.reasoning}`,
      marketAnalysis: parsed.marketAnalysis || "",
      source: "llm",
    };
  }

  return {
    action: action === "buy_yes" ? "buy_yes" : "buy_no",
    marketId: parsed.marketId,
    symbol: market.symbol,
    stake,
    confidence,
    reasoning: parsed.reasoning || "",
    marketAnalysis: parsed.marketAnalysis || "",
    source: "llm",
  };
}
