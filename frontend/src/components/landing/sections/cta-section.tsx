import Link from "next/link"

export function CTASection() {
  return (
    <section id="contact" className="py-24 relative">
      <div className="container mx-auto px-6 text-center relative z-10">
        <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight">
          Your beliefs stay yours. <br />
          <span className="text-gradient">Until they matter.</span>
        </h2>
        <p className="text-base text-white/60 mb-10 max-w-2xl mx-auto">
          Deploy agents, submit encrypted positions, and trade on prediction markets
          where no one can see your hand.
        </p>
        <Link href="/" className="inline-block px-8 py-4 bg-white text-black rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]">
          Enter BeliefMarket
        </Link>
      </div>

      {/* Background Gradient for CTA */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-t from-purple-600/20 to-transparent pointer-events-none opacity-30" />
    </section>
  )
}
