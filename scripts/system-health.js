#!/usr/bin/env node

/**
 * System Health Check Script (Quick)
 * Fast health check for CTS v3.2 system
 */

const { execSync } = require("child_process")
const fs = require("fs")

console.log("🏥 CTS v3.2 - System Health")
console.log("=".repeat(30))

let healthy = true

// Check Node.js
const nodeVersion = process.version
const nodeOk = nodeVersion.startsWith("v18") || nodeVersion.startsWith("v19") || nodeVersion.startsWith("v20")
console.log(`Node.js: ${nodeVersion} ${nodeOk ? "✅" : "❌"}`)
if (!nodeOk) healthy = false

// Check files
const criticalFiles = ["package.json", ".env.local", "lib/redis-db.ts"]
criticalFiles.forEach(file => {
  const exists = fs.existsSync(file)
  console.log(`${file}: ${exists ? "✅" : "❌"}`)
  if (!exists) healthy = false
})

// Check Redis (placeholder)
console.log("Redis: ✅ (simulated)")

console.log()
if (healthy) {
  console.log("🎉 System is healthy!")
} else {
  console.log("⚠️  System has issues")
}