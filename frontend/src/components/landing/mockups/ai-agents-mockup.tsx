import { BrowserWindow } from "./browser-window"

export function AIAgentsMockup() {
  return (
    <BrowserWindow className="h-48">
      <div className="space-y-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-purple-600/30 border border-purple-500/50 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-purple-500 animate-pulse"></div>
          </div>
          <div className="flex-1 space-y-2">
            <div className="h-2 bg-purple-600/30 rounded w-3/4"></div>
            <div className="h-2 bg-white/10 rounded w-1/2"></div>
          </div>
          <div className="px-2 py-0.5 rounded text-[8px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">LLM</div>
        </div>
        <div className="flex justify-end mb-4">
          <div className="bg-purple-600/10 rounded-lg px-3 py-2 max-w-[75%] border border-purple-500/20">
            <div className="h-2 bg-purple-400/40 rounded w-24 mb-1"></div>
            <div className="h-2 bg-white/10 rounded w-16"></div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-auto">
          <div className="flex-1 h-8 bg-white/5 rounded border border-white/10 flex items-center px-2">
            <div className="h-2 bg-white/20 rounded w-16"></div>
          </div>
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
            <div className="w-3 h-3 border-2 border-white/80 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    </BrowserWindow>
  )
}
