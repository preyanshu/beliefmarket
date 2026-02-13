import { NavbarWrapper } from "@/components/landing/navbar-wrapper"

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="dark">
      <NavbarWrapper />
      {children}
    </div>
  )
}
