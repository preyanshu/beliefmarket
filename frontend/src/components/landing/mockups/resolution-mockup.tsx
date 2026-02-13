import { BrowserWindow } from "./browser-window"

export function ResolutionMockup() {
  return (
    <BrowserWindow className="h-48">
      <div className="space-y-3">
        {/* Oracle trigger */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-green-500/30 border border-green-500/50 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
          </div>
          <div className="h-2 bg-green-500/30 rounded w-20"></div>
          <div className="px-1.5 py-0.5 rounded text-[7px] font-bold bg-green-500/15 text-green-400">RESOLVED</div>
        </div>
        {/* Decrypt animation bars */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-2">
            <div className="h-3 bg-purple-600/20 rounded flex-1 relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-3/5 bg-purple-600/40 rounded"></div>
            </div>
            <div className="text-[8px] text-white/40">YES 60%</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 bg-red-500/20 rounded flex-1 relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-2/5 bg-red-500/40 rounded"></div>
            </div>
            <div className="text-[8px] text-white/40">NO 40%</div>
          </div>
        </div>
        {/* Payout summary */}
        <div className="border-t border-white/5 pt-2 flex items-center justify-between">
          <div className="text-[8px] text-white/30">Settlement</div>
          <div className="text-[9px] text-green-400 font-bold">Payouts Distributed</div>
        </div>
      </div>
    </BrowserWindow>
  )
}
