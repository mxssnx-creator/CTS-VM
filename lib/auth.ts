// Authentication utilities
import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import bcrypt from "bcryptjs"

function getJwtSecret(): Uint8Array {
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    throw new Error("FATAL: JWT_SECRET environment variable must be set in production!")
  }

  if (!process.env.JWT_SECRET) {
    console.warn("WARNING: JWT_SECRET not set, using auto-generated development secret for development only!")
  }

  const JWT_SECRET_VALUE = process.env.JWT_SECRET || "development-secret-do-not-use-in-production-12345"
  return new TextEncoder().encode(JWT_SECRET_VALUE)
}

export interface User {
  id: number
  username: string
  email: string
  role: string
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createToken(user: User): Promise<string> {
  return new SignJWT({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret())
}

export async function verifyToken(token: string): Promise<User | null> {
  try {
    const verified = await jwtVerify(token, getJwtSecret())
    return verified.payload as unknown as User
  } catch (error) {
    return null
  }
}

export async function getSession(): Promise<User | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth_token")

  if (!token) {
    // For development: return default admin user when no session exists
    if (process.env.NODE_ENV !== "production") {
      return {
        id: 1,
        username: "admin",
        email: "admin@localhost",
        role: "admin"
      }
    }
    return null
  }

  return verifyToken(token.value)
}

export async function setSession(token: string) {
  const cookieStore = await cookies()
  cookieStore.set("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  })
}

export async function clearSession() {
  const cookieStore = await cookies()
  cookieStore.delete("auth_token")
}

export async function verifyAuth(request: Request): Promise<{
  authenticated: boolean
  user: User | null
}> {
  try {
    const cookieHeader = request.headers.get("cookie")
    if (!cookieHeader) {
      return { authenticated: false, user: null }
    }

    // Parse the auth_token from cookies
    const cookies = cookieHeader.split(";").map((c) => c.trim())
    const authCookie = cookies.find((c) => c.startsWith("auth_token="))

    if (!authCookie) {
      return { authenticated: false, user: null }
    }

    const token = authCookie.split("=")[1]
    const user = await verifyToken(token)

    if (!user) {
      return { authenticated: false, user: null }
    }

    return { authenticated: true, user }
  } catch (error) {
    console.error("[v0] Auth verification error:", error)
    return { authenticated: false, user: null }
  }
}

export async function requireAdmin(request: Request): Promise<{ success: boolean; status: number; response?: any }> {
  // For development: allow all requests as authorized admin
  if (process.env.NODE_ENV !== "production") {
    return { 
      success: true, 
      status: 200 
    }
  }
  
  const auth = await verifyAuth(request)
  if (!auth.authenticated || !auth.user) {
    return { success: false, status: 401, response: { error: "Unauthorized" } }
  }
  if (auth.user.role !== "admin") {
    return { success: false, status: 403, response: { error: "Admin privileges required" } }
  }
  return { success: true, status: 200 }
}

