"use client"

import { useState, useEffect } from "react"
import { motion, useScroll, useMotionValueEvent } from "framer-motion"
import { Menu, X } from 'lucide-react'
import { cn } from "@/lib/utils"
import Link from "next/link"

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const { scrollY } = useScroll()

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 50)
  })

  // Lock body scroll when mobile menu is open and handle escape key
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsMobileMenuOpen(false)
        }
      }
      document.addEventListener('keydown', handleEscape)
      return () => {
        document.body.style.overflow = ''
        document.removeEventListener('keydown', handleEscape)
      }
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobileMenuOpen])

  const navLinks = [
    { name: "How It Works", href: "#how-it-works" },
    { name: "Markets", href: "/" },
    { name: "Agents", href: "/agent" },
  ]

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-4 sm:px-6 py-4",
          isScrolled ? "py-4" : "py-6"
        )}
      >
        <div
          className={cn(
            "max-w-7xl mx-auto rounded-full transition-all duration-300 flex items-center justify-between px-4 sm:px-6 py-3",
            "glass bg-black/40 overflow-hidden"
          )}
        >
          <Link href="/landing" className={cn("text-lg sm:text-xl font-bold tracking-tighter relative z-50 text-white flex-shrink-0", isMobileMenuOpen && "hidden md:block")}>
            BeliefMarket<span className="text-purple-500">.</span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="text-sm font-medium text-white/70 hover:text-white transition-colors"
              >
                {link.name}
              </Link>
            ))}
            <Link href="/" className="bg-white text-black px-5 py-2 rounded-full text-sm font-semibold hover:bg-white/90 transition-colors">
              Launch App
            </Link>
          </div>

          {/* Mobile Menu Toggle - Hide when menu is open */}
          <button
            className={cn("md:hidden relative z-[60] text-white p-2 -mr-2 flex-shrink-0", isMobileMenuOpen && "hidden")}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <Menu size={24} />
          </button>
        </div>
      </motion.nav>

      {/* Mobile Menu Overlay - Outside nav to avoid z-index conflicts */}
      {isMobileMenuOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-[100] md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-0 z-[110] flex flex-col md:hidden pointer-events-none"
          >
            {/* Top bar with close button only */}
            <div className="flex items-center justify-end px-6 py-4 pointer-events-auto">
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-white hover:text-white/80 p-2 transition-colors"
                aria-label="Close menu"
              >
                <X size={24} />
              </button>
            </div>

            {/* Menu content */}
            <div 
              className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-8 pointer-events-auto overflow-y-auto scrollbar-hide"
              onClick={(e) => e.stopPropagation()}
            >
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-2xl font-light text-white hover:text-blue-400 transition-colors w-full text-center py-2"
                >
                  {link.name}
                </Link>
              ))}
              
              <div className="flex flex-col gap-3 w-full max-w-[280px] mt-4">
                <Link
                  href="/"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="bg-white text-black px-6 py-3 rounded-full text-base font-semibold hover:bg-white/90 transition-colors w-full text-center"
                >
                  Launch App
                </Link>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </>
  )
}
