import crypto from "crypto"
import { BaseExchangeConnector, type ExchangeConnectorResult } from "./base-connector"
import { safeParseResponse } from "@/lib/safe-response-parser"

/**
 * BingX Exchange Connector
 * 
 * Supported API Types:
 * - "spot": Spot trading, uses /openApi/spot/v1/account/balance
 * - "perpetual_futures": Perpetual futures, uses /openApi/swap/v3/user/balance
 * - "standard": Standard futures (deprecated, treated as perpetual)
 * 
 * Documentation: https://bingx-api.github.io/docs/#/en-us/
 * 
 * IMPORTANT: BingX uses different balance field names for different contract types:
 * - SPOT: free (available), locked (in orders), balance (total)
 * - PERPETUAL: availableMargin (available), frozenMargin (locked), balance (total)
 * 
 * Error Handling:
 * - Validates credentials before API calls
 * - Catches and logs all connection errors with descriptive messages
 * - Returns detailed logs for debugging failed connections
 * 
 * Features:
 * - Futures trading (up to 150x leverage)
 * - Perpetual swap contracts
 * - Cross-margin trading
 * - Hedge position mode
 */
export class BingXConnector extends BaseExchangeConnector {
  private getBaseUrl(): string {
    return this.credentials.isTestnet ? "https://testnet-open-api.bingx.com" : "https://open-api.bingx.com"
  }

  getCapabilities(): string[] {
    return ["futures", "perpetual_futures", "leverage", "hedge_mode", "cross_margin"]
  }

  async testConnection(): Promise<ExchangeConnectorResult> {
    this.log("Starting BingX connection test")
    this.log(`Using endpoint: ${this.getBaseUrl()}`)
    this.log(`Environment: ${this.credentials.isTestnet ? "testnet" : "mainnet"}`)

    try {
      return await this.getBalance()
    } catch (error) {
      this.logError(error instanceof Error ? error.message : "Unknown error")
      return {
        success: false,
        balance: 0,
        capabilities: this.getCapabilities(),
        error: error instanceof Error ? error.message : "Connection test failed",
        logs: this.logs,
      }
    }
  }

  async getBalance(): Promise<ExchangeConnectorResult> {
    const timestamp = Date.now()
    const baseUrl = this.getBaseUrl()

    this.log("Generating signature...")

    try {
      // Validate credentials first
      if (!this.credentials.apiKey || !this.credentials.apiSecret) {
        throw new Error("API key and secret are required")
      }

      // Build query parameters - only timestamp for balance query
      const params: Record<string, string> = {
        timestamp: String(timestamp),
      }

      // Sort parameters alphabetically and build query string (BingX requirement)
      const sortedKeys = Object.keys(params).sort()
      const queryString = sortedKeys.map(key => `${key}=${params[key]}`).join('&')

      // Generate HMAC-SHA256 signature from the query string
      const signature = crypto
        .createHmac("sha256", this.credentials.apiSecret)
        .update(queryString)
        .digest("hex")

      this.log(`Query string: ${queryString}`)
      this.log(`API Key prefix: ${this.credentials.apiKey.substring(0, 10)}...`)
      this.log(`Signature (first 16 chars): ${signature.substring(0, 16)}...`)

      this.log("Fetching account balance...")

      // Determine endpoint based on api_type from credentials OR passed configuration
      // api_type can be: 'spot', 'perpetual_futures', 'standard', or not specified (default perpetual)
      const apiType = this.credentials.apiType || "perpetual_futures"
      let endpoint = "/openApi/swap/v3/user/balance" // Default: perpetual futures
      
      this.log(`[BingX] API Type from credentials: ${apiType}`)
      
      if (apiType === "spot") {
        endpoint = "/openApi/spot/v1/account/balance"
        this.log("Contract Type: SPOT → Using /openApi/spot/v1/account/balance")
        console.log("[v0] [BingX] Contract Type: SPOT → Endpoint: /openApi/spot/v1/account/balance")
      } else if (apiType === "perpetual_futures" || apiType === "futures") {
        endpoint = "/openApi/swap/v3/user/balance"
        this.log("Contract Type: PERPETUAL FUTURES → Using /openApi/swap/v3/user/balance")
        console.log("[v0] [BingX] Contract Type: PERPETUAL → Endpoint: /openApi/swap/v3/user/balance")
      }

      const url = `${baseUrl}${endpoint}?${queryString}&signature=${signature}`
      this.log(`Full URL: ${baseUrl}${endpoint}`)

      const response = await this.rateLimitedFetch(url, {
        method: "GET",
        headers: {
          "X-BX-APIKEY": this.credentials.apiKey,
          "Content-Type": "application/json",
        },
      })

      const data = await safeParseResponse(response)

      this.log(`Response status: ${response.status}`)
      this.log(`Response code: ${data.code}`)

      // Check for error responses
      if (!response.ok || data.code !== 0) {
        const errorMsg = data.msg || data.error || `HTTP ${response.status}: ${response.statusText}`
        this.logError(`API Error (code ${data.code}): ${errorMsg}`)
        throw new Error(errorMsg)
      }

      this.log("Successfully retrieved account data")

      // Parse balance data - BingX returns data.data as the array directly
      this.log(`[Debug] Full response data: ${JSON.stringify(data).substring(0, 500)}`)
      
      // data.data IS the balance array, not data.data.balance
      const balanceData = Array.isArray(data.data) ? data.data : []
      
      if (!Array.isArray(balanceData)) {
        this.logError(`Invalid balance data format: ${JSON.stringify(balanceData).substring(0, 200)}`)
        throw new Error("Invalid balance data format from API")
      }

      this.log(`[Debug] Received ${balanceData.length} balance entries`)
      if (balanceData.length > 0) {
        this.log(`[Debug] First balance entry: ${JSON.stringify(balanceData[0]).substring(0, 300)}`)
      }

      // Extract USDT balance - BingX returns balance as a string number
      // For SPOT: use 'balance' field (total = free + locked, already calculated)
      // For PERPETUAL: use 'balance' field (this is the total balance in wallet)
      const usdtEntry = balanceData.find((b: any) => b.asset === "USDT")
      const usdtBalance = usdtEntry ? Number.parseFloat(usdtEntry.balance || "0") : 0
      
      this.log(`[Debug] USDT entry found: ${!!usdtEntry}`)
      this.log(`[Debug] USDT balance value: ${usdtBalance}`)

      // Get BTC price from market data or estimate
      let btcPrice = 0
      try {
        // Try to fetch current BTC/USDT price - use correct endpoint based on api type
        const apiType = this.credentials.apiType || "perpetual_futures"
        let priceUrl: string
        if (apiType === "spot") {
          priceUrl = `${this.getBaseUrl()}/openApi/spot/v1/ticker/price?symbol=BTC-USDT`
        } else {
          priceUrl = `${this.getBaseUrl()}/openApi/swap/v2/quote/price?symbol=BTC-USDT`
        }
        
        const priceResponse = await fetch(priceUrl)
        if (priceResponse.ok) {
          const priceData = await priceResponse.json()
          btcPrice = Number.parseFloat(priceData.data?.price || "0")
          this.log(`[Debug] BTC/USDT price fetched: $${btcPrice.toFixed(2)}`)
        }
      } catch (e) {
        this.log(`[Debug] Could not fetch BTC price: ${e}`)
      }

      // Map all balances with proper field extraction
      // IMPORTANT: BingX uses different field names for SPOT vs PERPETUAL
      const isFutures = apiType === "perpetual_futures" || apiType === "futures"
      
      console.log(`[v0] [BingX] Balance parsing - API Type: ${apiType}, isFutures: ${isFutures}`)
      console.log(`[v0] [BingX] Sample balance entry fields:`, balanceData.length > 0 ? Object.keys(balanceData[0]) : "no data")
      
      const balances = balanceData.map((b: any) => {
        // For SPOT: availableMargin/frozenMargin are futures-only fields
        // Use free/locked for spot, availableMargin/frozenMargin for perpetual
        
        if (isFutures) {
          // Perpetual Futures: availableMargin = available, frozenMargin = locked
          return {
            asset: b.asset || "UNKNOWN",
            free: Number.parseFloat(b.availableMargin || "0"),
            locked: Number.parseFloat(b.frozenMargin || "0"),
            total: Number.parseFloat(b.balance || "0"),
          }
        } else {
          // SPOT: free/locked are the correct fields
          return {
            asset: b.asset || "UNKNOWN",
            free: Number.parseFloat(b.free || "0"),
            locked: Number.parseFloat(b.locked || "0"),
            total: Number.parseFloat(b.balance || "0"),
          }
        }
      })
      
      console.log(`[v0] [BingX] Parsed ${balances.length} balances, USDT balance: ${usdtBalance}`)

      this.log(`✓ Account balance: ${usdtBalance.toFixed(4)} USDT`)
      this.log(`✓ Total assets: ${balances.length}`)
      this.log(`✓ BTC price: $${btcPrice.toFixed(2)}`)

      return {
        success: true,
        balance: usdtBalance,
        btcPrice: btcPrice,
        balances,
        capabilities: this.getCapabilities(),
        logs: this.logs,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logError(`✗ Connection error: ${errorMsg}`)
      throw error
    }
  }

  async placeOrder(
    symbol: string,
    side: "buy" | "sell",
    quantity: number,
    price?: number,
    orderType: "limit" | "market" = "limit"
  ): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      this.log(`Placing ${orderType} ${side} order: ${quantity} ${symbol}`)

      const endpoint = this.credentials.apiType === "spot" ? "/openApi/spot/v1/trade/order" : "/openApi/swap/v3/trade/order"

      const params: Record<string, any> = {
        symbol,
        side: side.toUpperCase(),
        type: orderType === "market" ? "MARKET" : "LIMIT",
        quantity: String(quantity),
        timestamp: Date.now(),
      }

      if (price && orderType === "limit") {
        params.price = String(price)
      }

      const signature = this.getSignature(params)
      const queryString = `${new URLSearchParams(params as any).toString()}&signature=${signature}`
      const url = `${this.getBaseUrl()}${endpoint}?${queryString}`

      const response = await this.rateLimitedFetch(url, {
        method: "POST",
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.code !== "0") {
        throw new Error(`BingX API error: ${data.msg || "Unknown error"}`)
      }

      const orderId = data.data?.orderId || data.data?.id
      this.log(`✓ Order placed successfully: ${orderId}`)

      return { success: true, orderId }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logError(`✗ Failed to place order: ${errorMsg}`)
      return { success: false, error: errorMsg }
    }
  }

  async cancelOrder(symbol: string, orderId: string): Promise<{ success: boolean; error?: string }> {
    try {
      this.log(`Cancelling order ${orderId} for ${symbol}`)

      const endpoint = this.credentials.apiType === "spot" ? "/openApi/spot/v1/trade/cancel_order" : "/openApi/swap/v3/trade/cancel_order"

      const params = {
        symbol,
        orderId,
        timestamp: Date.now(),
      }

      const signature = this.getSignature(params)
      const queryString = `${new URLSearchParams(params as any).toString()}&signature=${signature}`
      const url = `${this.getBaseUrl()}${endpoint}?${queryString}`

      const response = await this.rateLimitedFetch(url, {
        method: "POST",
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.code !== "0") {
        throw new Error(`BingX API error: ${data.msg || "Unknown error"}`)
      }

      this.log(`✓ Order cancelled successfully`)
      return { success: true }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logError(`✗ Failed to cancel order: ${errorMsg}`)
      return { success: false, error: errorMsg }
    }
  }

  async getOrder(symbol: string, orderId: string): Promise<any> {
    try {
      this.log(`Fetching order ${orderId} for ${symbol}`)

      const endpoint = this.credentials.apiType === "spot" ? "/openApi/spot/v1/trade/query_order" : "/openApi/swap/v3/trade/query_order"

      const params = {
        symbol,
        orderId,
        timestamp: Date.now(),
      }

      const signature = this.getSignature(params)
      const queryString = `${new URLSearchParams(params as any).toString()}&signature=${signature}`
      const url = `${this.getBaseUrl()}${endpoint}?${queryString}`

      const response = await this.rateLimitedFetch(url, {
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      const data = await response.json()

      if (data.code !== "0") {
        return null
      }

      return data.data
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logError(`✗ Failed to fetch order: ${errorMsg}`)
      return null
    }
  }

  async getOpenOrders(symbol?: string): Promise<any[]> {
    try {
      this.log(`Fetching open orders${symbol ? ` for ${symbol}` : ""}`)

      const endpoint = this.credentials.apiType === "spot" ? "/openApi/spot/v1/trade/openOrders" : "/openApi/swap/v3/trade/openOrders"

      const params: Record<string, any> = {
        timestamp: Date.now(),
      }

      if (symbol) {
        params.symbol = symbol
      }

      const signature = this.getSignature(params)
      const queryString = `${new URLSearchParams(params as any).toString()}&signature=${signature}`
      const url = `${this.getBaseUrl()}${endpoint}?${queryString}`

      const response = await this.rateLimitedFetch(url, {
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      const data = await response.json()

      if (data.code !== "0") {
        return []
      }

      return data.data || []
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logError(`✗ Failed to fetch open orders: ${errorMsg}`)
      return []
    }
  }

  async getOrderHistory(symbol?: string, limit: number = 50): Promise<any[]> {
    try {
      this.log(`Fetching order history${symbol ? ` for ${symbol}` : ""} (limit: ${limit})`)

      const endpoint = this.credentials.apiType === "spot" ? "/openApi/spot/v1/trade/allOrders" : "/openApi/swap/v3/trade/allOrders"

      const params: Record<string, any> = {
        limit,
        timestamp: Date.now(),
      }

      if (symbol) {
        params.symbol = symbol
      }

      const signature = this.getSignature(params)
      const queryString = `${new URLSearchParams(params as any).toString()}&signature=${signature}`
      const url = `${this.getBaseUrl()}${endpoint}?${queryString}`

      const response = await this.rateLimitedFetch(url, {
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      const data = await response.json()

      if (data.code !== "0") {
        return []
      }

      return data.data || []
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logError(`✗ Failed to fetch order history: ${errorMsg}`)
      return []
    }
  }

  async getPositions(symbol?: string): Promise<any[]> {
    if (this.credentials.apiType === "spot") {
      this.log("Positions not available for spot trading")
      return []
    }

    try {
      this.log(`Fetching positions${symbol ? ` for ${symbol}` : ""}`)

      const params: Record<string, any> = {
        timestamp: Date.now(),
      }

      if (symbol) {
        params.symbol = symbol
      }

      const signature = this.getSignature(params)
      const queryString = `${new URLSearchParams(params as any).toString()}&signature=${signature}`
      const url = `${this.getBaseUrl()}/openApi/swap/v3/user/positions?${queryString}`

      const response = await this.rateLimitedFetch(url, {
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      const data = await response.json()

      if (data.code !== "0") {
        return []
      }

      return data.data || []
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logError(`✗ Failed to fetch positions: ${errorMsg}`)
      return []
    }
  }

  async getPosition(symbol: string): Promise<any> {
    const positions = await this.getPositions(symbol)
    return positions.length > 0 ? positions[0] : null
  }

  async modifyPosition(
    symbol: string,
    leverage?: number,
    marginType?: "cross" | "isolated"
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.log(`Modifying position ${symbol}${leverage ? ` leverage=${leverage}` : ""}${marginType ? ` marginType=${marginType}` : ""}`)

      const params: Record<string, any> = {
        symbol,
        timestamp: Date.now(),
      }

      if (leverage) {
        params.leverage = String(leverage)
      }

      if (marginType) {
        params.marginType = marginType === "cross" ? "CROSSED" : "ISOLATED"
      }

      const signature = this.getSignature(params)
      const queryString = `${new URLSearchParams(params as any).toString()}&signature=${signature}`
      const url = `${this.getBaseUrl()}/openApi/swap/v3/trade/positionSide/set?${queryString}`

      const response = await this.rateLimitedFetch(url, {
        method: "POST",
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      const data = await response.json()

      if (data.code !== "0") {
        throw new Error(`BingX API error: ${data.msg || "Unknown error"}`)
      }

      this.log(`✓ Position modified successfully`)
      return { success: true }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logError(`✗ Failed to modify position: ${errorMsg}`)
      return { success: false, error: errorMsg }
    }
  }

  async closePosition(symbol: string, positionSide?: "long" | "short"): Promise<{ success: boolean; error?: string }> {
    try {
      this.log(`Closing position ${symbol}${positionSide ? ` (${positionSide})` : ""}`)

      const position = await this.getPosition(symbol)
      if (!position) {
        return { success: false, error: "Position not found" }
      }

      // Place opposite order to close
      const side = position.side === "LONG" ? "sell" : "buy"
      const result = await this.placeOrder(symbol, side as "buy" | "sell", position.contracts, position.currentPrice, "market")

      if (!result.success) {
        return result
      }

      this.log(`✓ Position closed successfully`)
      return { success: true }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logError(`✗ Failed to close position: ${errorMsg}`)
      return { success: false, error: errorMsg }
    }
  }

  async getDepositAddress(coin: string): Promise<{ address?: string; error?: string }> {
    try {
      this.log(`Fetching deposit address for ${coin}`)

      const params = {
        coin,
        timestamp: Date.now(),
      }

      const signature = this.getSignature(params)
      const queryString = `${new URLSearchParams(params as any).toString()}&signature=${signature}`
      const url = `${this.getBaseUrl()}/openApi/wallet/v1/query_address?${queryString}`

      const response = await this.rateLimitedFetch(url, {
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      const data = await response.json()

      if (data.code !== "0") {
        throw new Error(`BingX API error: ${data.msg || "Unknown error"}`)
      }

      const address = data.data?.address
      this.log(`✓ Deposit address retrieved: ${address?.slice(0, 10)}...`)

      return { address }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logError(`✗ Failed to fetch deposit address: ${errorMsg}`)
      return { error: errorMsg }
    }
  }

  async withdraw(coin: string, address: string, amount: number): Promise<{ success: boolean; txId?: string; error?: string }> {
    try {
      this.log(`Withdrawing ${amount} ${coin} to ${address.slice(0, 10)}...`)

      const params = {
        coin,
        address,
        amount: String(amount),
        timestamp: Date.now(),
      }

      const signature = this.getSignature(params)
      const queryString = `${new URLSearchParams(params as any).toString()}&signature=${signature}`
      const url = `${this.getBaseUrl()}/openApi/wallet/v1/withdraw?${queryString}`

      const response = await this.rateLimitedFetch(url, {
        method: "POST",
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      const data = await response.json()

      if (data.code !== "0") {
        throw new Error(`BingX API error: ${data.msg || "Unknown error"}`)
      }

      const txId = data.data?.txId
      this.log(`✓ Withdrawal initiated: ${txId}`)

      return { success: true, txId }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logError(`✗ Failed to withdraw: ${errorMsg}`)
      return { success: false, error: errorMsg }
    }
  }

  async getTransferHistory(limit: number = 50): Promise<any[]> {
    try {
      this.log(`Fetching transfer history (limit: ${limit})`)

      const params = {
        limit,
        timestamp: Date.now(),
      }

      const signature = this.getSignature(params)
      const queryString = `${new URLSearchParams(params as any).toString()}&signature=${signature}`
      const url = `${this.getBaseUrl()}/openApi/wallet/v1/query_withdraw_list?${queryString}`

      const response = await this.rateLimitedFetch(url, {
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      const data = await response.json()

      if (data.code !== "0") {
        return []
      }

      return data.data || []
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logError(`✗ Failed to fetch transfer history: ${errorMsg}`)
      return []
    }
  }

  async setLeverage(symbol: string, leverage: number): Promise<{ success: boolean; error?: string }> {
    try {
      this.log(`Setting leverage to ${leverage}x for ${symbol}`)

      const params = {
        symbol,
        leverage: String(leverage),
        timestamp: Date.now(),
      }

      const signature = this.getSignature(params)
      const queryString = `${new URLSearchParams(params as any).toString()}&signature=${signature}`
      const url = `${this.getBaseUrl()}/openApi/swap/v3/trade/leverage?${queryString}`

      const response = await this.rateLimitedFetch(url, {
        method: "POST",
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      const data = await response.json()

      if (data.code !== "0") {
        throw new Error(`BingX API error: ${data.msg || "Unknown error"}`)
      }

      this.log(`✓ Leverage set to ${leverage}x`)
      return { success: true }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logError(`✗ Failed to set leverage: ${errorMsg}`)
      return { success: false, error: errorMsg }
    }
  }

  async setMarginType(symbol: string, marginType: "cross" | "isolated"): Promise<{ success: boolean; error?: string }> {
    try {
      this.log(`Setting margin type to ${marginType} for ${symbol}`)

      const params = {
        symbol,
        marginType: marginType === "cross" ? "CROSSED" : "ISOLATED",
        timestamp: Date.now(),
      }

      const signature = this.getSignature(params)
      const queryString = `${new URLSearchParams(params as any).toString()}&signature=${signature}`
      const url = `${this.getBaseUrl()}/openApi/swap/v3/trade/marginType?${queryString}`

      const response = await this.rateLimitedFetch(url, {
        method: "POST",
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      const data = await response.json()

      if (data.code !== "0") {
        throw new Error(`BingX API error: ${data.msg || "Unknown error"}`)
      }

      this.log(`✓ Margin type set to ${marginType}`)
      return { success: true }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logError(`✗ Failed to set margin type: ${errorMsg}`)
      return { success: false, error: errorMsg }
    }
  }

  async setPositionMode(hedgeMode: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      this.log(`Setting position mode to ${hedgeMode ? "hedge" : "one-way"}`)

      const params = {
        dualSidePosition: hedgeMode,
        timestamp: Date.now(),
      }

      const signature = this.getSignature(params)
      const queryString = `${new URLSearchParams(params as any).toString()}&signature=${signature}`
      const url = `${this.getBaseUrl()}/openApi/swap/v3/trade/positionSide/set?${queryString}`

      const response = await this.rateLimitedFetch(url, {
        method: "POST",
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      const data = await response.json()

      if (data.code !== "0") {
        throw new Error(`BingX API error: ${data.msg || "Unknown error"}`)
      }

      this.log(`✓ Position mode set to ${hedgeMode ? "hedge" : "one-way"}`)
      return { success: true }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logError(`✗ Failed to set position mode: ${errorMsg}`)
      return { success: false, error: errorMsg }
    }
  }

  // ==================== MARKET DATA METHODS ====================

  async getKlines(
    symbol: string,
    interval: string = "1m",
    limit: number = 500,
    startTime?: number,
    endTime?: number
  ): Promise<any[]> {
    try {
      const apiType = this.credentials.apiType || "perpetual_futures"
      let url: string

      if (apiType === "spot") {
        const params = new URLSearchParams({ symbol, interval, limit: String(limit) })
        if (startTime) params.append("startTime", String(startTime))
        if (endTime) params.append("endTime", String(endTime))
        url = `${this.getBaseUrl()}/openApi/spot/v2/market/kline?${params.toString()}`
      } else {
        const params = new URLSearchParams({ symbol, interval, limit: String(limit) })
        if (startTime) params.append("startTime", String(startTime))
        if (endTime) params.append("endTime", String(endTime))
        url = `${this.getBaseUrl()}/openApi/swap/v2/quote/klines?${params.toString()}`
      }

      const response = await this.rateLimitedFetch(url, {
        method: "GET",
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      const data = await response.json()

      if (data.code !== 0) {
        this.logError(`Klines API error: ${data.msg || "Unknown error"}`)
        return []
      }

      const klines = data.data || []
      return klines.map((k: any) => ({
        timestamp: Number(k[0]),
        open: Number.parseFloat(k[1]),
        high: Number.parseFloat(k[2]),
        low: Number.parseFloat(k[3]),
        close: Number.parseFloat(k[4]),
        volume: Number.parseFloat(k[5]),
      }))
    } catch (error) {
      this.logError(`Failed to fetch klines: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }

  async getTicker24hr(symbol?: string): Promise<any> {
    try {
      const apiType = this.credentials.apiType || "perpetual_futures"
      let url: string

      if (apiType === "spot") {
        url = symbol
          ? `${this.getBaseUrl()}/openApi/spot/v1/ticker/24hr?symbol=${symbol}`
          : `${this.getBaseUrl()}/openApi/spot/v1/ticker/24hr`
      } else {
        url = symbol
          ? `${this.getBaseUrl()}/openApi/swap/v2/quote/ticker?symbol=${symbol}`
          : `${this.getBaseUrl()}/openApi/swap/v2/quote/ticker`
      }

      const response = await this.rateLimitedFetch(url, {
        method: "GET",
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      const data = await response.json()

      if (data.code !== 0) {
        this.logError(`Ticker API error: ${data.msg || "Unknown error"}`)
        return null
      }

      return data.data || null
    } catch (error) {
      this.logError(`Failed to fetch ticker: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  async getTickerPrice(symbol: string): Promise<number> {
    try {
      const apiType = this.credentials.apiType || "perpetual_futures"
      let url: string

      if (apiType === "spot") {
        url = `${this.getBaseUrl()}/openApi/spot/v1/ticker/price?symbol=${symbol}`
      } else {
        url = `${this.getBaseUrl()}/openApi/swap/v2/quote/price?symbol=${symbol}`
      }

      const response = await this.rateLimitedFetch(url, {
        method: "GET",
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      const data = await response.json()

      if (data.code !== 0) {
        return 0
      }

      const priceData = data.data
      return Number.parseFloat(priceData?.price || priceData?.[0]?.price || "0")
    } catch (error) {
      return 0
    }
  }

  async getDepth(symbol: string, limit: number = 20): Promise<{ bids: [number, number][]; asks: [number, number][] }> {
    try {
      const apiType = this.credentials.apiType || "perpetual_futures"
      let url: string

      if (apiType === "spot") {
        url = `${this.getBaseUrl()}/openApi/spot/v1/market/depth?symbol=${symbol}&limit=${limit}`
      } else {
        url = `${this.getBaseUrl()}/openApi/swap/v2/quote/depth?symbol=${symbol}&limit=${limit}`
      }

      const response = await this.rateLimitedFetch(url, {
        method: "GET",
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
      })

      const data = await response.json()

      if (data.code !== 0) {
        this.logError(`Depth API error: ${data.msg || "Unknown error"}`)
        return { bids: [], asks: [] }
      }

      const depthData = data.data || {}
      return {
        bids: (depthData.bids || []).map((b: any) => [Number.parseFloat(b[0]), Number.parseFloat(b[1])]),
        asks: (depthData.asks || []).map((a: any) => [Number.parseFloat(a[0]), Number.parseFloat(a[1])]),
      }
    } catch (error) {
      this.logError(`Failed to fetch depth: ${error instanceof Error ? error.message : String(error)}`)
      return { bids: [], asks: [] }
    }
  }

  async getHistoricalKlines(
    symbol: string,
    interval: string = "1m",
    startTime: number,
    endTime: number,
    limit: number = 500
  ): Promise<any[]> {
    try {
      const allKlines: any[] = []
      let currentStart = startTime

      while (currentStart < endTime) {
        const klines = await this.getKlines(symbol, interval, limit, currentStart, endTime)
        if (klines.length === 0) break

        allKlines.push(...klines)

        const lastTimestamp = klines[klines.length - 1].timestamp
        if (lastTimestamp <= currentStart) break
        currentStart = lastTimestamp + 1
      }

      return allKlines
    } catch (error) {
      this.logError(`Failed to fetch historical klines: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }

  private getSignature(params: Record<string, any>): string {
    const sortedKeys = Object.keys(params).sort()
    const queryString = sortedKeys.map(key => `${key}=${params[key]}`).join('&')
    return crypto
      .createHmac("sha256", this.credentials.apiSecret)
      .update(queryString)
      .digest("hex")
  }
}
