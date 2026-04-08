#!/usr/bin/env node

/**
 * Database Migration Script
 * Runs Redis database migrations for CTS v3.2
 */

const { execSync } = require("child_process")
const path = require("path")

console.log("🚀 CTS v3.2 - Database Migration")
console.log("=".repeat(40))

try {
  // Run the Redis setup script
  console.log("Running Redis migrations...")
  execSync("npx tsx scripts/redis-setup.ts", {
    stdio: "inherit",
    cwd: path.dirname(__dirname)
  })

  console.log("✅ Database migration completed successfully!")
  console.log()
  console.log("Next steps:")
  console.log("  1. Run: npm run system:check")
  console.log("  2. Start: npm run dev")

} catch (error) {
  console.error("❌ Database migration failed:")
  console.error(error.message)
  process.exit(1)
}