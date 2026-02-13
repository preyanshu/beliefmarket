import { BrowserWindow } from "./browser-window"

export function EncryptedPositionsMockup() {
  return (
    <BrowserWindow className="h-48">
      <div className="space-y-3">
        {/* Position entries */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-purple-600/30 border border-purple-500/40 flex items-center justify-center">
              <div className="w-3 h-3 rounded-sm bg-purple-500/50"></div>
            </div>
            <div className="flex-1 h-5 bg-white/5 rounded border border-white/10 flex items-center px-2 gap-1 overflow-hidden">
              <div className="h-2 bg-purple-600/40 rounded w-4"></div>
              <div className="h-2 bg-white/10 rounded w-6"></div>
              <div className="h-2 bg-white/10 rounded w-8"></div>
              <div className="h-2 bg-white/5 rounded w-12"></div>
            </div>
            <div className="px-1.5 py-0.5 rounded text-[7px] font-bold bg-white/5 text-white/30 border border-white/10">
              0x...
            </div>
          </div>
        ))}
        {/* Total bar */}
        <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
          <div className="h-2 bg-white/20 rounded w-16"></div>
          <div className="text-[9px] text-purple-400 font-bold">ENCRYPTED</div>
        </div>
      </div>
    </BrowserWindow>
  )
}
