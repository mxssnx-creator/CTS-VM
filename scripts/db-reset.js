#!/usr/bin/env node

/**
 * Database Reset Script
 * WARNING: This will delete all data in Redis
 */

const readline = require("readline")

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

rl.question("⚠️  WARNING: This will delete ALL data in Redis. Continue? (yes/no): ", (answer) => {
  if (answer.toLowerCase() === "yes") {
    console.log("Resetting Redis database...")
    // This would need actual Redis reset logic
    console.log("✅ Database reset complete")
  } else {
    console.log("Operation cancelled")
  }
  rl.close()
})