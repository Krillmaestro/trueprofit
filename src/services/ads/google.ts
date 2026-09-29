// Google Ads API Client
// Documentation: https://developers.google.com/google-ads/api/docs

import { fetchIntegration } from '@/lib/integration-http'

const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v25'
const GOOGLE_ADS_API_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`

export interface GoogleAdAccount {
  customerId: string
  descriptiveName: string
  currencyCode: string
  timeZone: string
  manager: boolean
}

export interface GoogleCampaign {
  id: string
  name: string
  status: string
  advertisingChannelType: string
}

export interface GoogleAdsMetrics {
  date: string
  customerId: string
  campaignId?: string
  campaignName?: string
  adGroupId?: string
  adGroupName?: string
  cost: number // Account currency, already converted from micros
  impressions: number
  clicks: number
  conversions: number
  conversionValue: number
}

export class GoogleAdsClient {
  private accessToken: string
  private developerToken: string
  private customerId?: string

  constructor(accessToken: string, developerToken: string, customerId?: string) {
    this.accessToken = accessToken
    this.developerToken = developerToken
    this.customerId = customerId?.replace(/-/g, '')
    if (this.customerId && !/^\d+$/.test(this.customerId)) throw new Error('Invalid Google Ads manager ID')
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: object
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.accessToken}`,
      'developer-token': this.developerToken,
      'Content-Type': 'application/json',
    }

    if (this.customerId) {
      headers['login-customer-id'] = this.customerId
    }

    const response = await fetchIntegration(`${GOOGLE_ADS_API_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'Google Ads API error')
    }

    const data = await response.json()
    if (endpoint.endsWith('/googleAds:searchStream')) {
      if (!Array.isArray(data)) throw new Error('Invalid Google Ads streaming response')
      return { results: data.flatMap(chunk => chunk.results || []) } as T
    }
    return data
  }

  async getAccessibleCustomers(): Promise<string[]> {
    if (this.customerId) {
      const clients = await this.request<{ results: Array<{ customerClient: { id: string } }> }>(
        `/customers/${this.customerId}/googleAds:searchStream`, 'POST',
        { query: "SELECT customer_client.id FROM customer_client WHERE customer_client.manager = FALSE AND customer_client.status = 'ENABLED'" }
      )
      return [...new Set(clients.results.map(row => String(row.customerClient.id)))]
    }
    const response = await this.request<{ resourceNames: string[] }>('/customers:listAccessibleCustomers')
    return (response.resourceNames || []).map(name => name.split('/')[1])
  }

  async getCustomerInfo(customerId: string): Promise<GoogleAdAccount> {
    const query = `
      SELECT
        customer.id,
        customer.descriptive_name,
        customer.currency_code,
        customer.time_zone,
        customer.manager
      FROM customer
    `

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await this.request<{ results: Array<{ customer: any }> }>(
      `/customers/${customerId}/googleAds:searchStream`,
      'POST',
      { query }
    )

    const customer = response.results[0]?.customer
    if (!customer) throw new Error('Google Ads customer is not accessible')
    return {
      customerId: customer?.id || customerId,
      descriptiveName: customer?.descriptive_name || customer?.descriptiveName || 'Unknown',
      currencyCode: customer?.currency_code || customer?.currencyCode || 'USD',
      timeZone: customer?.time_zone || customer?.timeZone || 'UTC',
      manager: customer.manager === true,
    }
  }

  async getCampaigns(customerId: string): Promise<GoogleCampaign[]> {
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type
      FROM campaign
      WHERE campaign.status != 'REMOVED'
    `

    const response = await this.request<{ results: Array<{ campaign: GoogleCampaign }> }>(
      `/customers/${customerId}/googleAds:searchStream`,
      'POST',
      { query }
    )

    return response.results.map(r => ({
      id: r.campaign.id,
      name: r.campaign.name,
      status: r.campaign.status,
      advertisingChannelType: r.campaign.advertisingChannelType,
    }))
  }

  async getMetrics(
    customerId: string,
    dateFrom: string,
    dateTo: string,
    level: 'account' | 'campaign' | 'adgroup' = 'campaign'
  ): Promise<GoogleAdsMetrics[]> {
    let selectFields = `
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value
    `

    let fromTable = 'customer'

    if (level === 'campaign') {
      selectFields += `,
        campaign.id,
        campaign.name
      `
      fromTable = 'campaign'
    } else if (level === 'adgroup') {
      selectFields += `,
        campaign.id,
        campaign.name,
        ad_group.id,
        ad_group.name
      `
      fromTable = 'ad_group'
    }

    const query = `
      SELECT ${selectFields}
      FROM ${fromTable}
      WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    `

    const response = await this.request<{
      results: Array<{
        segments: { date: string }
        metrics: {
          costMicros: string
          impressions: string
          clicks: string
          conversions: string
          conversionsValue: string
        }
        campaign?: { id: string; name: string }
        adGroup?: { id: string; name: string }
      }>
    }>(`/customers/${customerId}/googleAds:searchStream`, 'POST', { query })

    return response.results.map(r => ({
      date: r.segments.date,
      customerId,
      campaignId: r.campaign?.id,
      campaignName: r.campaign?.name,
      adGroupId: r.adGroup?.id,
      adGroupName: r.adGroup?.name,
      cost: parseInt(r.metrics.costMicros || '0', 10) / 1_000_000,
      impressions: parseInt(r.metrics.impressions || '0', 10),
      clicks: parseInt(r.metrics.clicks || '0', 10),
      conversions: parseFloat(r.metrics.conversions || '0'),
      conversionValue: parseFloat(r.metrics.conversionsValue || '0'),
    }))
  }
}

// OAuth helpers for Google Ads
export async function exchangeGoogleAuthCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error_description || 'Failed to exchange code')
  }

  return response.json()
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error_description || 'Failed to refresh token')
  }

  return response.json()
}
