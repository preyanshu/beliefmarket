import { BrowserWindow } from "./browser-window"

export function PrivateMarketsMockup() {
  return (
    <BrowserWindow className="h-48">
      <div className="space-y-3">
        {/* Market question */}
        <div className="h-2 bg-white/20 rounded w-3/4"></div>
        <div className="h-2 bg-white/10 rounded w-1/2"></div>
        {/* Hidden data indicators */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="h-14 bg-white/5 rounded border border-white/10 flex flex-col items-center justify-center gap-1">
            <div className="text-[8px] text-white/30 font-medium">YES POOL</div>
            <div className="text-[9px] text-white/20 font-bold">? ? ?</div>
          </div>
          <div className="h-14 bg-white/5 rounded border border-white/10 flex flex-col items-center justify-center gap-1">
            <div className="text-[8px] text-white/30 font-medium">NO POOL</div>
            <div className="text-[9px] text-white/20 font-bold">? ? ?</div>
          </div>
        </div>
        {/* Only visible: total deposits */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-[8px] text-white/40">Total Deposited</div>
          <div className="text-[9px] text-purple-400 font-bold">1,240 USDC</div>
        </div>
      </div>
    </BrowserWindow>
  )
}
