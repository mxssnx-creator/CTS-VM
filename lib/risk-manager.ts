// Risk management system for trading bot
import { getRedisClient } from "./redis-db"

export interface RiskLimits {
  max_position_size: number
  max_daily_loss: number
  max_drawdown_percent: number
  max_leverage: number
  max_open_positions: number
}

export interface RiskCheck {
  allowed: boolean
  reason?: string
  current_exposure?: number
  available_capital?: number
}

export class RiskManager {
  private portfolioId: number
  private limits: RiskLimits

  constructor(portfolioId: number, limits: RiskLimits) {
    this.portfolioId = portfolioId
    this.limits = limits
  }

   async checkPositionRisk(quantity: number, price: number, leverage = 1.0): Promise<RiskCheck> {
    // Check leverage limit
    if (leverage > this.limits.max_leverage) {
      return {
        allowed: false,
        reason: `Leverage ${leverage}x exceeds maximum ${this.limits.max_leverage}x`,
      }
    }

    // Calculate position size
    const positionSize = quantity * price * leverage

    // Check position size limit
    if (positionSize > this.limits.max_position_size) {
      return {
        allowed: false,
        reason: `Position size $${positionSize} exceeds maximum $${this.limits.max_position_size}`,
      }
    }

    // Check open positions count
    const client = getRedisClient()
    const positionKeys = await client.keys(`positions:*`)
    let currentOpenCount = 0
    
    if (positionKeys.length > 0) {
      const positionPromises = positionKeys.map(key => client.hgetall(key))
      const positions: (Record<string, string> | null)[] = await Promise.all(positionPromises)
      const validPositions = positions.filter((pos): pos is Record<string, string> => pos !== null)
      currentOpenCount = validPositions.filter(pos => 
        Number(pos.portfolio_id) === this.portfolioId && pos.status === 'open'
      ).length
    }

    if (currentOpenCount >= this.limits.max_open_positions) {
      return {
        allowed: false,
        reason: `Maximum open positions (${this.limits.max_open_positions}) reached`,
      }
    }

    // Check daily loss limit
    const dailyPnL = await this.getDailyPnL()

    if (dailyPnL < -this.limits.max_daily_loss) {
      return {
        allowed: false,
        reason: `Daily loss limit reached: $${Math.abs(dailyPnL)} / $${this.limits.max_daily_loss}`,
      }
    }

    // Check drawdown
    const drawdown = await this.getCurrentDrawdown()

    if (drawdown > this.limits.max_drawdown_percent) {
      return {
        allowed: false,
        reason: `Drawdown ${drawdown}% exceeds maximum ${this.limits.max_drawdown_percent}%`,
      }
    }

    // Get portfolio value for exposure calculation
    const portfolioKey = `portfolios:${this.portfolioId}`
    const portfolioData = await client.hgetall(portfolioKey) || {}
    const portfolioValue = Number(portfolioData.total_value) || 0
    const currentExposure = await this.getTotalExposure()

    return {
      allowed: true,
      current_exposure: currentExposure,
      available_capital: portfolioValue - currentExposure,
    }
  }

  private async getDailyPnL(): Promise<number> {
    const client = getRedisClient()
    const positionKeys = await client.keys(`positions:*`)
    let totalPnL = 0
    
    if (positionKeys.length > 0) {
      const positionPromises = positionKeys.map(key => client.hgetall(key))
      const positions: (Record<string, string> | null)[] = await Promise.all(positionPromises)
      const validPositions = positions.filter((pos): pos is Record<string, string> => pos !== null)
      const today = new Date().toISOString().split('T')[0]
      
      for (const pos of validPositions) {
        if (Number(pos.portfolio_id) === this.portfolioId && pos.closed_at) {
          const closedDate = pos.closed_at.split('T')[0]
          if (closedDate === today) {
            totalPnL += Number(pos.realized_pnl) || 0
          }
        }
      }
    }

    return totalPnL
  }

  private async getCurrentDrawdown(): Promise<number> {
    const client = getRedisClient()
    const portfolioKey = `portfolios:${this.portfolioId}`
    const portfolioData = await client.hgetall(portfolioKey) || {}

    if (!portfolioData.total_value || !portfolioData.initial_value) return 0

    const totalValue = Number(portfolioData.total_value)
    const initialValue = Number(portfolioData.initial_value)

    if (initialValue === 0) return 0

    const drawdown = ((initialValue - totalValue) / initialValue) * 100

    return Math.max(0, drawdown)
  }

  private async getTotalExposure(): Promise<number> {
    const client = getRedisClient()
    const positionKeys = await client.keys(`positions:*`)
    let totalExposure = 0
    
    if (positionKeys.length > 0) {
      const positionPromises = positionKeys.map(key => client.hgetall(key))
      const positions: (Record<string, string> | null)[] = await Promise.all(positionPromises)
      const validPositions = positions.filter((pos): pos is Record<string, string> => pos !== null)
      
      for (const pos of validPositions) {
        if (Number(pos.portfolio_id) === this.portfolioId && pos.status === 'open') {
          const quantity = Number(pos.quantity) || 0
          const currentPrice = Number(pos.current_price) || 0
          const leverage = Number(pos.leverage) || 0
          totalExposure += quantity * currentPrice * leverage
        }
      }
    }

    return totalExposure
  }

  async updateRiskLimits(newLimits: Partial<RiskLimits>): Promise<void> {
    this.limits = { ...this.limits, ...newLimits }
    
    const client = getRedisClient()
    const riskLimitsKey = `risk_limits:${this.portfolioId}`
    await client.hset(riskLimitsKey, {
      max_position_size: this.limits.max_position_size.toString(),
      max_daily_loss: this.limits.max_daily_loss.toString(),
      max_drawdown_percent: this.limits.max_drawdown_percent.toString(),
      max_leverage: this.limits.max_leverage.toString(),
      max_open_positions: this.limits.max_open_positions.toString(),
    })
  }
}
