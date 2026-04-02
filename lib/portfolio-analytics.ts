// Portfolio analytics and performance tracking
import { getRedisClient } from "./redis-db"

export interface PortfolioMetrics {
  total_value: number
  total_return: number
  total_return_percent: number
  daily_pnl: number
  weekly_pnl: number
  monthly_pnl: number
  sharpe_ratio: number
  max_drawdown: number
  win_rate: number
  profit_factor: number
  average_win: number
  average_loss: number
  total_trades: number
  winning_trades: number
  losing_trades: number
}

export class PortfolioAnalytics {
  private portfolioId: number

  constructor(portfolioId: number) {
    this.portfolioId = portfolioId
  }

  async calculateMetrics(): Promise<PortfolioMetrics> {
    const portfolio = await this.getPortfolioData()
    const positions = await this.getClosedPositions()

    const totalReturn = parseFloat(portfolio.total_value || "0") - parseFloat(portfolio.initial_value || "0")
    const totalReturnPercent = parseFloat(portfolio.initial_value || "0") > 0 ? (totalReturn / parseFloat(portfolio.initial_value)) * 100 : 0

    const dailyPnL = await this.calculatePeriodPnL(1)
    const weeklyPnL = await this.calculatePeriodPnL(7)
    const monthlyPnL = await this.calculatePeriodPnL(30)

    const winningPositions = positions.filter((p) => parseFloat(p.realized_pnl || "0") > 0)
    const losingPositions = positions.filter((p) => parseFloat(p.realized_pnl || "0") <= 0)

    const totalWins = winningPositions.reduce((sum, p) => sum + parseFloat(p.realized_pnl || "0"), 0)
    const totalLosses = Math.abs(losingPositions.reduce((sum, p) => sum + parseFloat(p.realized_pnl || "0"), 0))

    const winRate = positions.length > 0 ? (winningPositions.length / positions.length) * 100 : 0
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0
    const averageWin = winningPositions.length > 0 ? totalWins / winningPositions.length : 0
    const averageLoss = losingPositions.length > 0 ? totalLosses / losingPositions.length : 0

    const sharpeRatio = await this.calculateSharpeRatio()
    const maxDrawdown = await this.calculateMaxDrawdown()

    return {
      total_value: parseFloat(portfolio.total_value || "0"),
      total_return: totalReturn,
      total_return_percent: totalReturnPercent,
      daily_pnl: dailyPnL,
      weekly_pnl: weeklyPnL,
      monthly_pnl: monthlyPnL,
      sharpe_ratio: sharpeRatio,
      max_drawdown: maxDrawdown,
      win_rate: winRate,
      profit_factor: profitFactor,
      average_win: averageWin,
      average_loss: averageLoss,
      total_trades: positions.length,
      winning_trades: winningPositions.length,
      losing_trades: losingPositions.length,
    }
  }

  private async getPortfolioData() {
    const client = getRedisClient()
    const data = await client.hgetall(`portfolio:${this.portfolioId}`)
    return data && Object.keys(data).length > 0 ? data : { total_value: "0", initial_value: "0" }
  }

  private async getClosedPositions() {
    const client = getRedisClient()
    const positionIds = await client.smembers("positions") || []
    const positions = []
    for (const id of positionIds) {
      const pos = await client.hgetall(`position:${id}`)
      if (pos && pos.portfolio_id === String(this.portfolioId) && pos.status === "closed") {
        positions.push(pos as any)
      }
    }
    return positions
  }

  private async calculatePeriodPnL(days: number): Promise<number> {
    const client = getRedisClient()
    const positionIds = await client.smembers("positions") || []
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    let totalPnL = 0

    for (const id of positionIds) {
      const pos = await client.hgetall(`position:${id}`)
      if (pos &&
          pos.portfolio_id === String(this.portfolioId) &&
          pos.status === "closed" &&
          pos.closed_at &&
          pos.closed_at >= cutoffDate) {
        totalPnL += parseFloat(pos.realized_pnl || "0")
      }
    }

    return totalPnL
  }

  private async calculateSharpeRatio(): Promise<number> {
    const positions = await this.getClosedPositions()

    if (positions.length < 2) return 0

    const dailyReturns = positions.map((r) => parseFloat(r.realized_pnl || "0"))
    const avgReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length
    const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (dailyReturns.length - 1)
    const stdDev = Math.sqrt(variance)

    return stdDev > 0 ? avgReturn / stdDev : 0
  }

  private async calculateMaxDrawdown(): Promise<number> {
    const history = await this.getPerformanceHistory(999) // Get all history
    if (history.length < 2) return 0

    let maxValue = history[0].value
    let maxDrawdown = 0

    for (const record of history) {
      if (record.value > maxValue) {
        maxValue = record.value
      }

      const drawdown = ((maxValue - record.value) / maxValue) * 100
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown
      }
    }

    return maxDrawdown
  }

  async getPerformanceHistory(days = 30) {
    const client = getRedisClient()
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // Get portfolio history from a list/sorted set
    // Assuming portfolio_history is stored as a list with keys like "portfolio_history:{portfolioId}"
    const historyKey = `portfolio_history:${this.portfolioId}`
    const items = await client.lrange(historyKey, 0, -1) || []
    const parsed = items.map(item => {
      try { return JSON.parse(item) } catch { return null }
    }).filter(Boolean)

    // Filter by date and aggregate by day
    const filtered = parsed.filter((h: any) => h.updated_at >= cutoffDate)

    // Group by date
    const grouped = new Map<string, number[]>()
    for (const h of filtered) {
      const date = h.updated_at.split('T')[0]
      if (!grouped.has(date)) grouped.set(date, [])
      grouped.get(date)!.push(parseFloat(h.total_value || "0"))
    }

    const result = []
    for (const [date, values] of grouped) {
      const avgValue = values.reduce((a, b) => a + b, 0) / values.length
      result.push({
        date,
        value: avgValue,
        data_points: values.length
      })
    }

    return result.sort((a, b) => a.date.localeCompare(b.date))
  }
}
