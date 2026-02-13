import { Hero } from "@/components/landing/hero"
import { Services } from "@/components/landing/services"
import { Footer } from "@/components/landing/footer"
import { GridBackground } from "@/components/landing/grid-background"
import { CTASection } from "@/components/landing/sections/cta-section"

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-white selection:bg-blue-500/30">
      <GridBackground />
      <Hero />
      <Services />
      <CTASection />
      <Footer />
    </main>
  )
}
