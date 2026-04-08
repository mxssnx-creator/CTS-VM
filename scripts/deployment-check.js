#!/usr/bin/env node

/**
 * Deployment Readiness Check
 * Validates that the application is ready for Vercel deployment
 */

const fs = require("fs")
const path = require("path")

console.log("🚀 CTS v3.2 - Deployment Readiness Check")
console.log("=".repeat(45))

let issues = []
let warnings = []

// Check 1: Build configuration
console.log("📦 Build Configuration:")
const nextConfig = path.join(__dirname, "..", "next.config.mjs")
if (fs.existsSync(nextConfig)) {
  console.log("   ✅ next.config.mjs exists")
} else {
  issues.push("next.config.mjs not found")
}

const vercelJson = path.join(__dirname, "..", "vercel.json")
if (fs.existsSync(vercelJson)) {
  console.log("   ✅ vercel.json exists")
} else {
  issues.push("vercel.json not found")
}

const vercelIgnore = path.join(__dirname, "..", ".vercelignore")
if (fs.existsSync(vercelIgnore)) {
  console.log("   ✅ .vercelignore exists")
} else {
  warnings.push(".vercelignore not found (recommended)")
}

// Check 2: Package.json scripts
console.log("\n📜 Package.json Scripts:")
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"))
const requiredScripts = ["build", "start", "vercel-build"]
requiredScripts.forEach(script => {
  if (packageJson.scripts[script]) {
    console.log(`   ✅ ${script}: ${packageJson.scripts[script]}`)
  } else {
    issues.push(`Missing script: ${script}`)
  }
})

// Check 3: Environment variables
console.log("\n🌍 Environment Variables:")
const envExample = path.join(__dirname, "..", ".env.example")
if (fs.existsSync(envExample)) {
  console.log("   ✅ .env.example exists")
} else {
  warnings.push(".env.example not found")
}

// Check 4: Redis configuration
console.log("\n💾 Redis Configuration:")
const redisUrl = process.env.REDIS_URL
const redisPassword = process.env.REDIS_PASSWORD
if (redisUrl && redisPassword) {
  console.log("   ✅ Upstash Redis configured")
} else {
  console.log("   ⚠️  Upstash Redis not configured (will use local fallback)")
}

// Check 5: Dependencies
console.log("\n📚 Dependencies:")
const deps = packageJson.dependencies || {}
const requiredDeps = ["next", "react", "react-dom", "redis"]
requiredDeps.forEach(dep => {
  if (deps[dep]) {
    console.log(`   ✅ ${dep}: ${deps[dep]}`)
  } else {
    issues.push(`Missing dependency: ${dep}`)
  }
})

// Check 6: Build test
console.log("\n🏗️  Build Test:")
try {
  const { execSync } = require("child_process")
  console.log("   Testing build...")
  execSync("npm run build", { stdio: "pipe", cwd: path.join(__dirname, "..") })
  console.log("   ✅ Build successful")
} catch (error) {
  issues.push(`Build failed: ${error.message}`)
  console.log("   ❌ Build failed")
}

// Summary
console.log("\n" + "=".repeat(45))
console.log("📊 Deployment Readiness Summary:")

if (issues.length === 0) {
  console.log("🎉 READY FOR DEPLOYMENT!")
  console.log("   All critical checks passed")
} else {
  console.log(`❌ ${issues.length} critical issue(s) found:`)
  issues.forEach(issue => console.log(`     - ${issue}`))
}

if (warnings.length > 0) {
  console.log(`⚠️  ${warnings.length} warning(s):`)
  warnings.forEach(warning => console.log(`     - ${warning}`))
}

console.log("\n🔧 Next Steps:")
if (issues.length === 0) {
  console.log("   1. Set environment variables in Vercel dashboard:")
  console.log("      - REDIS_URL")
  console.log("      - REDIS_PASSWORD")
  console.log("      - NEXTAUTH_SECRET")
  console.log("   2. Deploy to Vercel")
} else {
  console.log("   1. Fix the critical issues listed above")
  console.log("   2. Run this check again")
}

console.log()

process.exit(issues.length > 0 ? 1 : 0)