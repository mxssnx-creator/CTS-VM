import { NextResponse } from "next/server"
import { initRedis, getSettings } from "@/lib/redis-db"
import * as fs from "fs"
import * as path from "path"

export async function GET() {
  try {
    await initRedis()

    const backups = await getSettings("backups") || []
    const fileBackups: { id: string; name: string; size: string; created_at: string; type: string }[] = []

    const backupPath = process.env.BACKUP_PATH || "/tmp/backups"
    try {
      if (fs.existsSync(backupPath)) {
        const files = fs.readdirSync(backupPath)
        for (const file of files) {
          if (file.endsWith(".json") || file.endsWith(".db")) {
            const stats = fs.statSync(path.join(backupPath, file))
            fileBackups.push({
              id: `file-${file}`,
              name: file,
              size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
              created_at: stats.birthtime.toISOString(),
              type: stats.birthtime > new Date(Date.now() - 3600000) ? "auto" : "manual",
            })
          }
        }
      }
    } catch {
    }

    const allBackups = [...backups, ...fileBackups]

    if (allBackups.length === 0) {
      allBackups.push({
        id: "none",
        name: "No backups found",
        size: "0 MB",
        created_at: new Date().toISOString(),
        type: "info",
      })
    }

    return NextResponse.json({ success: true, backups: allBackups })
  } catch (error) {
    console.error("[v0] Failed to load backups:", error)
    return NextResponse.json(
      {
        error: "Failed to load backups",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
