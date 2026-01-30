// Facebook Marketing API Client
// Documentation: https://developers.facebook.com/docs/marketing-api

const FACEBOOK_API_VERSION = 'v21.0'
const FACEBOOK_GRAPH_URL = `https://graph.facebook.com/${FACEBOOK_API_VERSION}`

export interface FacebookAdAccount {
  id: string
  name: string
  account_id: string
  currency: string
  timezone_name: string
}

export interface FacebookCampaign {
  id: string
  name: string
  status: string
  objective: string
}

export interface FacebookInsight {
  date_start: string
  date_stop: string
  campaign_id?: string
  campaign_name?: string
  adset_id?: string
  adset_name?: string
  spend: string
  impressions: string
  clicks: string
  conversions?: string
  purchase_roas?: Array<{ value: string }>
  actions?: Array<{ action_type: string; value: string }>
}

export class FacebookAdsClient {
  private accessToken: string

  constructor(accessToken: string) {
    this.accessToken = accessToken
  }

  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${FACEBOOK_GRAPH_URL}${endpoint}`)
    url.searchParams.set('access_token', this.accessToken)

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }

    const response = await fetch(url.toString())

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'Facebook API error')
    }

    return response.json()
  }

  async getAdAccounts(): Promise<FacebookAdAccount[]> {
    const response = await this.request<{ data: FacebookAdAccount[] }>('/me/adaccounts', {
      fields: 'id,name,account_id,currency,timezone_name',
    })
    return response.data
  }

  async getCampaigns(adAccountId: string): Promise<FacebookCampaign[]> {
    const response = await this.request<{ data: FacebookCampaign[] }>(`/act_${adAccountId}/campaigns`, {
      fields: 'id,name,status,objective',
      limit: '500',
    })
    return response.data
  }

  async getInsights(
    adAccountId: string,
    dateFrom: string,
    dateTo: string,
    level: 'account' | 'campaign' | 'adset' = 'campaign'
  ): Promise<FacebookInsight[]> {
    const fields = [
      'date_start',
      'date_stop',
      'spend',
      'impressions',
      'clicks',
      'actions',
      'purchase_roas',
    ]

    if (level === 'campaign') {
      fields.push('campaign_id', 'campaign_name')
    } else if (level === 'adset') {
      fields.push('campaign_id', 'campaign_name', 'adset_id', 'adset_name')
    }

    const response = await this.request<{ data: FacebookInsight[] }>(`/act_${adAccountId}/insights`, {
      fields: fields.join(','),
      time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
      level,
      time_increment: '1', // Daily breakdown
      limit: '500',
    })

    return response.data
  }

  async refreshLongLivedToken(appId: string, appSecret: string): Promise<{ access_token: string; expires_in: number }> {
    const url = new URL(`${FACEBOOK_GRAPH_URL}/oauth/access_token`)
    url.searchParams.set('grant_type', 'fb_exchange_token')
    url.searchParams.set('client_id', appId)
    url.searchParams.set('client_secret', appSecret)
    url.searchParams.set('fb_exchange_token', this.accessToken)

    const response = await fetch(url.toString())

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'Failed to refresh token')
    }

    return response.json()
  }
}

// Helper to extract conversions from Facebook actions array
export function extractConversions(actions?: Array<{ action_type: string; value: string }>): number {
  if (!actions) return 0

  const purchaseAction = actions.find(a =>
    a.action_type === 'purchase' ||
    a.action_type === 'omni_purchase'
  )

  return purchaseAction ? parseInt(purchaseAction.value, 10) : 0
}

// Helper to extract ROAS
export function extractRoas(purchaseRoas?: Array<{ value: string }>): number {
  if (!purchaseRoas || purchaseRoas.length === 0) return 0
  return parseFloat(purchaseRoas[0].value)
}
