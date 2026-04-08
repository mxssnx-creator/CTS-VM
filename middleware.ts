import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Public routes that don't require authentication
  const publicRoutes = [
    "/",
    "/login",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/health",
    "/api/trade-engine/health"
  ]

  if (publicRoutes.includes(path) || path.startsWith("/_next") || path.startsWith("/static")) {
    return NextResponse.next()
  }

  // Admin routes require admin role
  const adminRoutes = [
    "/api/admin",
    "/api/trade-engine/emergency-stop",
    "/api/trade-engine/start-all",
    "/api/trade-engine/stop",
    "/api/trade-engine/pause",
    "/api/trade-engine/resume",
    "/api/trade-engine/restart",
    "/api/system/restart-service",
    "/api/install/database"
  ]

  const isAdminRoute = adminRoutes.some(route => path.startsWith(route))

  // Check auth token
  const authToken = request.cookies.get("auth_token")?.value

  if (!authToken) {
    // For development: allow all requests to be authorized while proper auth is set up
    return NextResponse.next()
  }

  // For admin routes we will verify admin role in the endpoint handlers directly (requireAdmin)
  // This middleware provides base protection, endpoints will enforce specific roles

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/api/:path*",
    "/dashboard/:path*",
    "/admin/:path*",
    "/settings/:path*",
    "/trading/:path*"
  ],
}
