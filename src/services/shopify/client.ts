const SHOPIFY_API_VERSION = '2024-01'

export interface ShopifyClientConfig {
  shopDomain: string
  accessToken: string
}

export interface PaginatedResponse<T> {
  data: T
  nextPageInfo?: string
  hasNextPage: boolean
}

export class ShopifyClient {
  private shopDomain: string
  private accessToken: string
  private baseUrl: string

  constructor(config: ShopifyClientConfig) {
    this.shopDomain = config.shopDomain
    this.accessToken = config.accessToken
    this.baseUrl = `https://${config.shopDomain}/admin/api/${SHOPIFY_API_VERSION}`
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.accessToken,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Shopify API error: ${response.status} - ${error}`)
    }

    return response.json()
  }

  // Parse Shopify Link header for pagination
  private parseLinkHeader(linkHeader: string | null): { next?: string; previous?: string } {
    if (!linkHeader) return {}

    const links: { next?: string; previous?: string } = {}
    const parts = linkHeader.split(',')

    for (const part of parts) {
      const match = part.match(/<[^>]*page_info=([^>&]*).*>;\s*rel="(\w+)"/)
      if (match) {
        const [, pageInfo, rel] = match
        if (rel === 'next') links.next = pageInfo
        if (rel === 'previous') links.previous = pageInfo
      }
    }

    return links
  }

  private async paginatedRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<PaginatedResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.accessToken,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Shopify API error: ${response.status} - ${error}`)
    }

    const linkHeader = response.headers.get('Link')
    const links = this.parseLinkHeader(linkHeader)
    const data = await response.json()

    return {
      data,
      nextPageInfo: links.next,
      hasNextPage: !!links.next,
    }
  }

  // Shop Info
  async getShop() {
    return this.request<{ shop: ShopifyShop }>('/shop.json')
  }

  // Products with pagination support
  async getProducts(params?: { limit?: number; page_info?: string }): Promise<PaginatedResponse<{ products: ShopifyProduct[] }>> {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.page_info) searchParams.set('page_info', params.page_info)

    const query = searchParams.toString() ? `?${searchParams}` : ''
    return this.paginatedRequest<{ products: ShopifyProduct[] }>(`/products.json${query}`)
  }

  async getProduct(productId: string) {
    return this.request<{ product: ShopifyProduct }>(`/products/${productId}.json`)
  }

  // Orders with pagination support
  // Note: When page_info is present, Shopify ignores all other params except limit
  // So we only send page_info OR the filter params, never both
  async getOrders(params?: {
    limit?: number
    page_info?: string
    status?: string
    created_at_min?: string
    created_at_max?: string
    financial_status?: string
  }): Promise<PaginatedResponse<{ orders: ShopifyOrder[] }>> {
    const searchParams = new URLSearchParams()

    if (params?.page_info) {
      // When using cursor pagination, only page_info and limit are allowed
      searchParams.set('page_info', params.page_info)
      if (params?.limit) searchParams.set('limit', params.limit.toString())
    } else {
      // First page - use all filter params
      if (params?.limit) searchParams.set('limit', params.limit.toString())
      if (params?.status) searchParams.set('status', params.status)
      if (params?.created_at_min) searchParams.set('created_at_min', params.created_at_min)
      if (params?.created_at_max) searchParams.set('created_at_max', params.created_at_max)
      if (params?.financial_status) searchParams.set('financial_status', params.financial_status)
    }

    const query = searchParams.toString() ? `?${searchParams}` : ''
    return this.paginatedRequest<{ orders: ShopifyOrder[] }>(`/orders.json${query}`)
  }

  async getOrder(orderId: string) {
    return this.request<{ order: ShopifyOrder }>(`/orders/${orderId}.json`)
  }

  // Transactions
  async getTransactions(orderId: string) {
    return this.request<{ transactions: ShopifyTransaction[] }>(
      `/orders/${orderId}/transactions.json`
    )
  }

  // Inventory
  async getInventoryLevels(params?: { inventory_item_ids?: string; location_ids?: string }) {
    const searchParams = new URLSearchParams()
    if (params?.inventory_item_ids) searchParams.set('inventory_item_ids', params.inventory_item_ids)
    if (params?.location_ids) searchParams.set('location_ids', params.location_ids)

    const query = searchParams.toString() ? `?${searchParams}` : ''
    return this.request<{ inventory_levels: ShopifyInventoryLevel[] }>(
      `/inventory_levels.json${query}`
    )
  }

  // Get inventory items (contains cost/COGS data)
  async getInventoryItems(ids: string[]): Promise<{ inventory_items: ShopifyInventoryItem[] }> {
    // Shopify allows max 100 IDs per request
    const idsParam = ids.slice(0, 100).join(',')
    return this.request<{ inventory_items: ShopifyInventoryItem[] }>(
      `/inventory_items.json?ids=${idsParam}`
    )
  }

  // Get single inventory item
  async getInventoryItem(id: string): Promise<{ inventory_item: ShopifyInventoryItem }> {
    return this.request<{ inventory_item: ShopifyInventoryItem }>(
      `/inventory_items/${id}.json`
    )
  }

  // Webhooks
  async createWebhook(topic: string, address: string) {
    return this.request<{ webhook: ShopifyWebhook }>('/webhooks.json', {
      method: 'POST',
      body: JSON.stringify({
        webhook: {
          topic,
          address,
          format: 'json',
        },
      }),
    })
  }

  async deleteWebhook(webhookId: string) {
    return this.request(`/webhooks/${webhookId}.json`, { method: 'DELETE' })
  }
}

// Shopify Types
export interface ShopifyShop {
  id: number
  name: string
  email: string
  domain: string
  myshopify_domain: string
  currency: string
  timezone: string
  money_format: string
  plan_name: string
}

export interface ShopifyProduct {
  id: number
  title: string
  handle: string
  vendor: string
  product_type: string
  status: string
  created_at: string
  updated_at: string
  image?: { src: string }
  variants: ShopifyVariant[]
}

export interface ShopifyVariant {
  id: number
  product_id: number
  title: string
  sku: string
  barcode: string
  price: string
  compare_at_price: string | null
  inventory_quantity: number
  inventory_item_id: number
  weight: number
  weight_unit: string
  image_id: number | null
}

export interface ShopifyOrder {
  id: number
  name: string
  order_number: number
  email: string
  created_at: string
  updated_at: string
  processed_at: string
  cancelled_at: string | null
  financial_status: string
  fulfillment_status: string | null
  currency: string
  presentment_currency: string
  subtotal_price: string
  total_discounts: string
  total_shipping_price_set: { shop_money: { amount: string } }
  total_tax: string
  total_price: string
  customer: {
    email: string
    first_name: string
    last_name: string
  }
  shipping_address?: {
    country: string
    city: string
    country_code: string
  }
  line_items: ShopifyLineItem[]
  refunds: ShopifyRefund[]
  tags: string
  note: string | null
  landing_site: string | null
  referring_site: string | null
}

export interface ShopifyLineItem {
  id: number
  product_id: number
  variant_id: number
  title: string
  variant_title: string
  sku: string
  quantity: number
  price: string
  total_discount: string
  tax_lines: Array<{ price: string }>
}

export interface ShopifyTransaction {
  id: number
  order_id: number
  kind: string
  gateway: string
  status: string
  amount: string
  currency: string
  processed_at: string
  receipt?: {
    fee_amount?: string
  }
}

export interface ShopifyRefund {
  id: number
  order_id: number
  created_at: string
  note: string
  restock: boolean
  transactions: Array<{
    amount: string
    currency: string
  }>
}

export interface ShopifyInventoryLevel {
  inventory_item_id: number
  location_id: number
  available: number
  updated_at: string
}

export interface ShopifyInventoryItem {
  id: number
  sku: string
  cost: string | null  // This is the COGS from Shopify
  tracked: boolean
  created_at: string
  updated_at: string
}

export interface ShopifyWebhook {
  id: number
  address: string
  topic: string
  created_at: string
  format: string
}
