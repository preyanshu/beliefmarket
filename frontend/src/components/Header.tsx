"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-card-border bg-card/90 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-accent/20 flex items-center justify-center">
              <span className="text-accent font-bold text-sm">S</span>
            </div>
            <span className="text-base font-bold tracking-tight text-accent">
              SHADOWPOOL
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link
              href="/"
              className="text-muted hover:text-foreground transition-colors"
            >
              HOME
            </Link>
            <Link
              href="/trade"
              className="text-muted hover:text-foreground transition-colors"
            >
              TRADE
            </Link>
            <Link
              href="/history"
              className="text-muted hover:text-foreground transition-colors"
            >
              HISTORY
            </Link>
          </nav>

          <ConnectButton
            chainStatus="icon"
            showBalance={false}
            accountStatus="address"
          />
        </div>
      </div>
    </header>
  );
}
