"use client"

import { GlassCard } from "@/components/landing/ui/glass-card"
import { motion } from "framer-motion"
import { MODULES, ANIMATION_VARIANTS, SECTION_CONFIG } from "@/lib/constants"
import {
  EncryptedPositionsMockup,
  AIAgentsMockup,
  PrivateMarketsMockup,
  ResolutionMockup,
  AuditTrailMockup,
} from "@/components/landing/mockups"

const MOCKUP_COMPONENTS = {
  "encrypted-positions": EncryptedPositionsMockup,
  "ai-agents": AIAgentsMockup,
  "private-markets": PrivateMarketsMockup,
  "resolution": ResolutionMockup,
  "audit-trail": AuditTrailMockup,
} as const

export function Services() {
  const isWideModule = (index: number) => index === 1

  return (
    <section id="how-it-works" className="py-24 relative overflow-hidden">
      <div className="container mx-auto px-6 relative z-10">
        <div className="flex flex-col items-center justify-center mb-20 gap-8 text-center">
          <motion.h2
            {...ANIMATION_VARIANTS.fadeInUp}
            whileInView="animate"
            viewport={{ once: true }}
            className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-white"
          >
            {SECTION_CONFIG.services.title}
          </motion.h2>
          <motion.p
            {...ANIMATION_VARIANTS.fadeInUp}
            whileInView="animate"
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-sm md:text-base text-white/50 max-w-lg mx-auto leading-relaxed"
          >
            {SECTION_CONFIG.services.subtitle}
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {MODULES.map((module, index) => {
            const MockupComponent = MOCKUP_COMPONENTS[module.id as keyof typeof MOCKUP_COMPONENTS]
            const isWide = isWideModule(index)

            return (
              <motion.div
                key={module.id}
                {...ANIMATION_VARIANTS.stagger}
                whileInView="animate"
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
                className={isWide ? "md:col-span-2" : ""}
              >
                <GlassCard
                  hoverEffect={false}
                  className="p-6 overflow-hidden group h-full flex flex-col relative [&]:border-[0.5px] [&]:border-white/10 [&:hover]:!border-[0.5px] [&:hover]:!border-purple-600 [&:hover]:!shadow-[0_0_40px_rgba(147,51,234,0.5)] transition-all duration-500"
                >
                  <div
                    className={`relative z-10 flex h-full ${
                      isWide ? "flex-row gap-6 items-start" : "flex-col"
                    }`}
                  >
                    <div
                      className={
                        isWide ? "flex-shrink-0 w-1/2 h-full" : "mb-6"
                      }
                    >
                      <MockupComponent />
                    </div>
                    <div
                      className={
                        isWide ? "flex-1 flex flex-col justify-start" : ""
                      }
                    >
                      <h3 className="text-xl font-bold mb-3 group-hover:translate-x-2 transition-transform duration-500">
                        {module.title}
                      </h3>
                      <p className="text-xs text-white/60 leading-relaxed">
                        {isWide && module.extendedDescription ? (
                          <>
                            <span className="block mb-3">
                              {module.extendedDescription[0]}
                            </span>
                            <span className="block">
                              {module.extendedDescription[1]}
                            </span>
                          </>
                        ) : (
                          module.description
                        )}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
