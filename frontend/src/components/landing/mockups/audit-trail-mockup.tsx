import { BrowserWindow } from "./browser-window"

export function AuditTrailMockup() {
  return (
    <BrowserWindow className="h-48">
      <div className="space-y-2">
        {/* Audit log entries */}
        {[
          { action: "Position decrypted", color: "bg-purple-600/30", time: "12:04:01" },
          { action: "Payout: 42.5 USDC", color: "bg-green-500/30", time: "12:04:02" },
          { action: "Agent decision logged", color: "bg-blue-500/30", time: "12:04:02" },
          { action: "Settlement complete", color: "bg-green-500/30", time: "12:04:03" },
        ].map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="text-[7px] text-white/20 font-mono w-12 shrink-0">{entry.time}</div>
            <div className={`w-1.5 h-1.5 rounded-full ${entry.color}`}></div>
            <div className="h-2 bg-white/10 rounded flex-1"></div>
            <div className="text-[7px] text-white/30 shrink-0">{entry.action}</div>
          </div>
        ))}
        {/* Verification badge */}
        <div className="border-t border-white/5 pt-2 mt-1 flex items-center justify-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
          </div>
          <div className="text-[8px] text-green-400/80 font-medium">On-chain verified</div>
        </div>
      </div>
    </BrowserWindow>
  )
}
