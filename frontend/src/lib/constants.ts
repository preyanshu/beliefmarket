export interface Module {
  id: string
  title: string
  description: string
  extendedDescription?: string[]
}

export const MODULES: Module[] = [
  {
    id: "encrypted-positions",
    title: "Encrypted Positions",
    description: "Submit YES or NO positions encrypted with BITE v2. No one — not even the contract — can see your direction until resolution.",
  },
  {
    id: "ai-agents",
    title: "AI-Powered Agents",
    description: "Deploy autonomous agents with custom personalities and guardrails to trade prediction markets on your behalf.",
    extendedDescription: [
      "Deploy autonomous agents with LLM-powered decision making. Choose conservative, balanced, aggressive, or contrarian strategies.",
      "Agents analyze live prices, momentum, pool skew, and time urgency — then submit encrypted positions automatically or await your manual approval.",
    ],
  },
  {
    id: "private-markets",
    title: "Priceless Markets",
    description: "No odds, no prices, no sentiment visible during the market. Only total deposits are public. Beliefs stay private.",
  },
  {
    id: "resolution",
    title: "Oracle Resolution",
    description: "When the oracle resolves, BITE v2 conditionally decrypts all positions. Payouts are computed and settled atomically.",
  },
  {
    id: "audit-trail",
    title: "Full Auditability",
    description: "After settlement, every position, payout, and agent decision is fully transparent and verifiable on-chain.",
  },
]

export const ANIMATION_VARIANTS = {
  fadeInUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
  },
  fadeInUpDelayed: {
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0 },
  },
  stagger: {
    initial: { opacity: 0, y: 40 },
    animate: { opacity: 1, y: 0 },
  },
} as const

export const SECTION_CONFIG = {
  services: {
    title: "How It Works",
    subtitle: "A new market primitive where beliefs stay private until they matter",
  },
} as const
