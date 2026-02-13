"use client"

import { motion } from "framer-motion"
import { ArrowRight, ShieldCheck } from "lucide-react"
import Link from "next/link"

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Single center blur for mobile only */}
      <div className="md:hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-purple-600/20 rounded-full blur-[80px] opacity-60 pointer-events-none" />

      {/* Background Liquid Elements - Desktop only */}
      <div className="hidden md:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-[#C3FF32]/10 rounded-full blur-[150px] opacity-60 pointer-events-none" />

      {/* Gradient glow behind text - Desktop only */}
      <div className="hidden md:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-[45%] -translate-y-1/2 w-[600px] h-[300px] bg-indigo-600/20 rounded-full blur-[150px] opacity-80" />
        <div className="absolute top-1/2 left-1/2 -translate-x-[45%] -translate-y-1/2 w-[600px] h-[300px] bg-indigo-600/20 rounded-full blur-[150px] opacity-80" />
      </div>

      <div className="container mx-auto px-6 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-600 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-600"></span>
            </span>
            <span className="text-sm font-medium text-white/90 tracking-wider">Built on SKALE with BITE v2</span>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="text-2xl md:text-3xl lg:text-[3rem] xl:text-[3.8rem] font-bold tracking-tighter leading-[1.1] mb-6 text-balance"
        >
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-white">
            Private prediction markets
          </span>
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/40">
            powered by encrypted agents
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          className="text-base md:text-lg text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          No visible prices. No belief leakage. No copy trading.
          <br />
          Submit encrypted positions that stay private until resolution.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link href="/" className="group relative px-6 py-3 bg-white text-black rounded-full font-semibold text-sm overflow-hidden transition-all hover:scale-105">
            <span className="relative z-10 flex items-center gap-2">
              Launch App <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-gray-100 to-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
          <Link href="#how-it-works" className="px-6 py-3 glass rounded-full font-semibold text-sm text-white hover:bg-white/10 transition-all hover:scale-105">
            How It Works
          </Link>
        </motion.div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1, ease: "easeOut" }}
          className="flex items-center justify-center gap-6 mt-14 text-xs text-white/30"
        >
          <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Threshold Encrypted</span>
          <span className="w-1 h-1 rounded-full bg-white/20" />
          <span>Zero Belief Leakage</span>
          <span className="w-1 h-1 rounded-full bg-white/20" />
          <span>Agent-Native</span>
        </motion.div>
      </div>
    </section>
  )
}
