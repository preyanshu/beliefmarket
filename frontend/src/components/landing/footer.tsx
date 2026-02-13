import Link from "next/link"

export function Footer() {
  return (
    <footer className="relative pt-24 pb-10 overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 mb-20">
          <div>
            <Link href="/" className="text-2xl font-bold tracking-tighter mb-6 block">
              BeliefMarket<span className="text-purple-500">.</span>
            </Link>
            <p className="text-sm text-white/50 leading-relaxed">
              Illiquid, priceless private prediction markets using BITE v2 threshold encryption on SKALE.
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-6 text-sm">Platform</h4>
            <ul className="space-y-4 text-white/60 text-sm">
              <li><Link href="/markets" className="hover:text-white transition-colors">Markets</Link></li>
              <li><Link href="/agent" className="hover:text-white transition-colors">Agents</Link></li>
              <li><Link href="/create" className="hover:text-white transition-colors">Create Market</Link></li>
              <li><Link href="/history" className="hover:text-white transition-colors">History</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-6 text-sm">Built With</h4>
            <ul className="space-y-4 text-white/60 text-sm">
              <li><span className="hover:text-white transition-colors">SKALE Network</span></li>
              <li><span className="hover:text-white transition-colors">BITE v2 SDK</span></li>
              <li><span className="hover:text-white transition-colors">Next.js + React</span></li>
              <li><span className="hover:text-white transition-colors">Solidity Smart Contracts</span></li>
            </ul>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-white/5 text-sm text-white/40">
          <p>&copy; 2026 BeliefMarket. Encrypted Agents — SKALE Hackathon.</p>
          <div className="flex items-center gap-6 mt-4 md:mt-0">
            <span>Zero Belief Leakage</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>Full Post-Resolution Auditability</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
