#!/usr/bin/env node

/**
 * CTS v3.2 - Setup Script
 * Configures Redis database and environment
 */

const { execSync, spawn } = require("child_process")
const fs = require("fs")
const path = require("path")
const readline = require("readline")
const crypto = require("crypto")

console.log("🚀 CTS v3.2 Setup Script")
console.log("=".repeat(50))
console.log("   Cryptocurrency Trading System - Redis Edition")
console.log("=".repeat(50))
console.log()

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

// Helper for questions
const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve))

// Helper to generate secure random strings
function generateSecureSecret(length = 32) {
  return crypto.randomBytes(length).toString("hex")
}

// Helper to run command
function runCommand(cmd, options = {}) {
  return new Promise((resolve, reject) => {
    const parts = cmd.split(" ")
    const proc = spawn(parts[0], parts.slice(1), {
      stdio: "inherit",
      shell: true,
      ...options,
    })

    proc.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Command failed with code ${code}`))
    })

    proc.on("error", reject)
  })
}

async function main() {
  console.log("📋 System Pre-flight Checks\n")

  // Check Node.js version
  const nodeVersion = process.version
  const majorVersion = Number.parseInt(nodeVersion.split(".")[0].slice(1))

  if (majorVersion < 18 || majorVersion > 26) {
    console.error(`❌ Node.js version ${nodeVersion} is not supported`)
    console.error("   Please use Node.js 18.x - 26.x")
    process.exit(1)
  }

  console.log(`✅ Node.js ${nodeVersion} (Compatible)`)
  console.log(`✅ Database: Redis (default)\n`)

  // Project configuration
  console.log("📝 Project Configuration")
  const projectName = process.env.PROJECT_NAME || (await askQuestion("   Project Name (default: CTS-v3): ")) || "CTS-v3"
  let projectPort = process.env.PORT || (await askQuestion("   Application Port (default: 3000): ")) || "3000"

  // Validate port
  const portNumber = Number.parseInt(projectPort)
  if (isNaN(portNumber) || portNumber < 1024 || portNumber > 65535) {
    console.error("   ❌ Invalid port number. Using default: 3000")
    projectPort = "3000"
  }

  console.log(`   ✅ Project: ${projectName}`)
  console.log(`   ✅ Port: ${projectPort}`)
  console.log()

  // Install dependencies
  console.log("📦 Installing Dependencies...")
  try {
    await runCommand("npm install")
    console.log("✅ Dependencies installed successfully\n")
  } catch (error) {
    console.error("❌ Failed to install dependencies")
    console.error("   Error:", error.message)
    process.exit(1)
  }

  // Create directories
  console.log("📁 Creating Project Directories...")
  const directories = ["data", "logs", "public/uploads"]
  directories.forEach((dir) => {
    const dirPath = path.join(process.cwd(), dir)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
      console.log(`   ✅ Created: ${dir}`)
    } else {
      console.log(`   ℹ️  Exists: ${dir}`)
    }
  })
  console.log()

  // Create .env.local
  console.log("🔐 Environment Configuration...")
  const envPath = path.join(process.cwd(), ".env.local")
  const envExists = fs.existsSync(envPath)

  if (!envExists) {
    console.log("   Creating new .env.local file...")

    const sessionSecret = generateSecureSecret(32)
    const jwtSecret = generateSecureSecret(32)
    const encryptionKey = generateSecureSecret(32)

    const envContent = `# CTS v3.2 Environment Configuration
# Generated on ${new Date().toISOString()}
# Project: ${projectName}
# DO NOT COMMIT THIS FILE TO VERSION CONTROL

# Application Environment
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:${projectPort}
PORT=${projectPort}
PROJECT_NAME=${projectName}

# Database Configuration (Redis)
# For production, set REDIS_URL to your Upstash Redis instance
REDIS_URL=""
REDIS_PASSWORD=""

# Security Keys (Auto-generated - DO NOT SHARE)
NEXTAUTH_SECRET=${sessionSecret}
NEXTAUTH_URL=http://localhost:${projectPort}

# Application Settings
NEXT_PUBLIC_APP_NAME=Trading Engine
NEXT_PUBLIC_APP_VERSION=3.2

# Feature Flags
ENABLE_LIVE_TRADING=false
ENABLE_BACKTESTING=true
ENABLE_PAPER_TRADING=true

# System Settings
MAX_CONNECTIONS=10
MAX_POSITIONS_PER_CONNECTION=100
MAX_CONCURRENT_TRADES=50
LOG_LEVEL=info
`

    fs.writeFileSync(envPath, envContent)
    console.log("   ✅ Created .env.local with secure auto-generated secrets")
    console.log(`   ✅ Project Name: ${projectName}`)
    console.log(`   ✅ Port: ${projectPort}`)
    console.log(`   ✅ Database: Redis (fallback in-memory store for development)`)
    console.log("   ✅ Secrets: Generated (32 bytes each)")
  } else {
    console.log("   ℹ️  .env.local already exists")
  }
  console.log()

  // Build
  console.log("🏗️  Production Build")
  const buildAnswer = process.env.BUILD_PRODUCTION || (await askQuestion("   Run production build? [Y/n]: ")) || "n"
  const shouldBuild = buildAnswer.toLowerCase() === "y"

  if (shouldBuild) {
    console.log("   Building application...\n")
    try {
      await runCommand("npm run build")
      console.log("   ✅ Build completed successfully\n")
    } catch (error) {
      console.log("   ⚠️  Build encountered errors")
      console.log("   You can still run in development mode with: npm run dev\n")
    }
  }

  // Finish
  console.log("=".repeat(50))
  console.log("✅ Setup Complete!")
  console.log("=".repeat(50))
  console.log("\nNext steps:")
  console.log(`  1. Start development server:  npm run dev`)
  console.log(`  2. Open http://localhost:${projectPort}`)
  console.log(`  3. Login with default admin account`)
  console.log("\nDocumentation: https://github.com/your-repo")
  console.log()

  rl.close()
  process.exit(0)
}

main().catch((error) => {
  console.error("Setup failed:", error.message)
  rl.close()
  process.exit(1)
})
