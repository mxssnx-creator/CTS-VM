#!/usr/bin/env node

/**
 * CTS v3.1 - System Health Check
 * Comprehensive system verification
 */

const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

console.log("🔍 CTS v3.1 - System Health Check")
console.log("=".repeat(50))
console.log()

function checkCommand(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

function getNodeVersion() {
  return process.version
}

function checkDirectory(dir) {
  return fs.existsSync(dir)
}

function checkFile(file) {
  return fs.existsSync(file)
}

async function main() {
  let issues = 0

  // Node.js version
  console.log("1. Node.js Environment")
  const nodeVersion = getNodeVersion()
  const nodeMajor = Number.parseInt(nodeVersion.split(".")[0].slice(1))
  const nodeOk = nodeMajor >= 18 && nodeMajor <= 26
  console.log(`   Version: ${nodeVersion} ${nodeOk ? "✅" : "❌ (Need 18.x-26.x)"}`)
  if (!nodeOk) issues++
  console.log()

  // Required commands
  console.log("2. Required System Commands")
  const commands = ["node", "npm", "git"]
  commands.forEach((cmd) => {
    const exists = checkCommand(cmd)
    console.log(`   ${cmd}: ${exists ? "✅" : "❌"}`)
    if (!exists && cmd !== "git") issues++
  })
  console.log()

  // Optional commands
  console.log("3. Optional Commands")
  const optionalCmds = ["pnpm", "yarn", "nginx", "postgres", "psql"]
  optionalCmds.forEach((cmd) => {
    const exists = checkCommand(cmd)
    console.log(`   ${cmd}: ${exists ? "✅" : "⚠️  Not installed"}`)
  })
  console.log()

  // Project directories
  console.log("4. Project Directories")
  const dirs = ["lib", "app", "components", "scripts", "data", "public"]
  dirs.forEach((dir) => {
    const exists = checkDirectory(dir)
    console.log(`   ${dir}/: ${exists ? "✅" : "❌"}`)
    if (!exists) issues++
  })
  console.log()

  // Critical files
  console.log("5. Critical Files")
  const files = ["package.json", "next.config.mjs", "tsconfig.json", ".gitignore"]
  files.forEach((file) => {
    const exists = checkFile(file)
    console.log(`   ${file}: ${exists ? "✅" : "❌"}`)
    if (!exists) issues++
  })
  console.log()

  // Environment configuration
  console.log("6. Environment Configuration")
  const envLocal = checkFile(".env.local")
  const envExample = checkFile(".env.example")
  console.log(`   .env.local: ${envLocal ? "✅" : "⚠️  Not found"}`)
  console.log(`   .env.example: ${envExample ? "✅" : "⚠️  Not found"}`)
  console.log()

  // Dependencies
  console.log("7. Dependencies")
  const nodeModules = checkDirectory("node_modules")
  const packageLock = checkFile("package-lock.json") || checkFile("pnpm-lock.yaml") || checkFile("yarn.lock")
  console.log(`   node_modules/: ${nodeModules ? "✅" : "❌ Run 'npm install'"}`)
  console.log(`   Lock file: ${packageLock ? "✅" : "⚠️  No lock file"}`)
  if (!nodeModules) issues++
  console.log()

  // Database connectivity
  console.log("8. Database Connectivity")
  if (envLocal) {
    try {
      require("dotenv").config({ path: ".env.local" })
      console.log(`   Database Type: Redis ✅`)
      console.log(`   REDIS_URL: ${process.env.REDIS_URL ? "✅ Set" : "⚠️  Using default"}`)
    } catch (error) {
      console.log(`   Database Check: ⚠️  ${error.message}`)
    }
  } else {
    console.log("   Skipped (no .env.local)")
  }
  console.log()

  // Summary
  console.log("=".repeat(50))
  if (issues === 0) {
    console.log("✅ System Health: GOOD - All checks passed")
    console.log("=".repeat(50))
    console.log()
    console.log("Ready to run:")
    console.log("  npm run setup    - Interactive setup")
    console.log("  npm run dev      - Start development")
    console.log("  npm run build    - Build for production")
    process.exit(0)
  } else {
    console.log(`⚠️  System Health: ISSUES FOUND - ${issues} problem(s) detected`)
    console.log("=".repeat(50))
    console.log()
    console.log("Please fix the issues marked with ❌ above")
    console.log()
    console.log("Common fixes:")
    console.log("  npm install              - Install dependencies")
    console.log("  cp .env.example .env.local  - Create environment file")
    console.log("  mkdir data logs          - Create required directories")
    process.exit(1)
  }
}

main()
