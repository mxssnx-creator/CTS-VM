import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { AuthProvider } from "@/lib/auth-context"
import { ExchangeProvider } from "@/lib/exchange-context"
import { ConnectionStateProvider } from "@/lib/connection-state"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SystemInitializer } from "@/components/system-initializer"
import { Toaster } from "@/components/ui/sonner"
import { initializeConsoleLogger } from "@/lib/console-logger"

initializeConsoleLogger()

export const metadata: Metadata = {
  title: "CTS v3 - Crypto Trading System",
  description: "Advanced crypto trading system with real-time analytics and automated strategies",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans">
        <SystemInitializer />
        <AuthProvider>
          <ConnectionStateProvider>
            <ExchangeProvider>
              <SidebarProvider defaultOpen={true}>
                <AppSidebar />
                <main className="flex-1 w-full">{children}</main>
              </SidebarProvider>
              <Toaster richColors />
            </ExchangeProvider>
          </ConnectionStateProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
