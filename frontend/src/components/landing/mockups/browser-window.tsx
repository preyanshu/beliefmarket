interface BrowserWindowProps {
  children: React.ReactNode
  className?: string
}

export function BrowserWindow({ children, className = "" }: BrowserWindowProps) {
  return (
    <div className={`bg-black/40 rounded-lg p-4 border border-white/10 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
        <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
        <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
      </div>
      {children}
    </div>
  )
}
