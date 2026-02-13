export function GridBackground() {
  return (
    <div className="inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: "100px 100px",
          maskImage: "linear-gradient(to top, black 0%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to top, black 0%, transparent 100%)",
        }}
      />

      {/* Show only first shape on mobile, all three on larger screens */}
      <div className="absolute top-32 left-20 w-40 h-40 bg-white/10 rotate-45 rounded-lg opacity-22" />
      <div className="hidden md:block absolute top-43 right-32 w-48 h-48 bg-white/10 rounded-full opacity-16" />
      <div className="hidden md:block absolute top-68 left-1/2 -translate-x-1/2 w-32 h-32 bg-white/10 rotate-12 rounded-lg opacity-20" />
    </div>
  )
}
