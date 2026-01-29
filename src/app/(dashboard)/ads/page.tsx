'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Plus,
  DollarSign,
  TrendingUp,
  Target,
  BarChart3,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react'

// Platform icons
const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
)

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
)

interface AdAccount {
  id: string
  platform: 'FACEBOOK' | 'GOOGLE' | 'TIKTOK'
  accountName: string | null
  platformAccountId: string
  isActive: boolean
  lastSyncAt: string | null
  lastSyncStatus: string | null
  currency: string
}

interface AdSpend {
  id: string
  date: string
  campaignName: string | null
  campaignId: string | null
  spend: number
  impressions: number
  clicks: number
  conversions: number
  revenue: number
  roas: number
  cpc: number
  cpm: number
  currency: string
  platform: string
}

const platformConfig = {
  FACEBOOK: {
    icon: FacebookIcon,
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-600',
    name: 'Facebook Ads',
  },
  GOOGLE: {
    icon: GoogleIcon,
    bgColor: 'bg-white border',
    textColor: 'text-gray-700',
    name: 'Google Ads',
  },
  TIKTOK: {
    icon: TikTokIcon,
    bgColor: 'bg-gray-900',
    textColor: 'text-white',
    name: 'TikTok Ads',
  },
}

function AdsPageContent() {
  const searchParams = useSearchParams()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([])
  const [adSpends, setAdSpends] = useState<AdSpend[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Check for OAuth callback messages
  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (success === 'facebook_connected') {
      setNotification({ type: 'success', message: 'Facebook Ads account connected successfully!' })
    } else if (success === 'google_connected') {
      setNotification({ type: 'success', message: 'Google Ads account connected successfully!' })
    } else if (error) {
      const errorMessages: Record<string, string> = {
        facebook_oauth_denied: 'Facebook authorization was denied',
        google_oauth_denied: 'Google authorization was denied',
        no_ad_accounts: 'No ad accounts found. Make sure you have access to ad accounts.',
        no_google_accounts: 'No Google Ads accounts found.',
        token_failed: 'Failed to get access token. Please try again.',
        no_team: 'No team found. Please set up your account first.',
        facebook_failed: 'Failed to connect Facebook Ads. Please try again.',
        google_failed: 'Failed to connect Google Ads. Please try again.',
      }
      setNotification({ type: 'error', message: errorMessages[error] || 'Connection failed. Please try again.' })
    }

    // Clear notification after 5 seconds
    if (success || error) {
      setTimeout(() => setNotification(null), 5000)
    }
  }, [searchParams])

  // Fetch ad accounts and spend data
  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [accountsRes, spendsRes] = await Promise.all([
        fetch('/api/ads/accounts'),
        fetch('/api/ads/spend'),
      ])

      if (accountsRes.ok) {
        const data = await accountsRes.json()
        setAdAccounts(data.accounts || [])
      }

      if (spendsRes.ok) {
        const data = await spendsRes.json()
        setAdSpends(data.spends || [])
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async (accountId: string) => {
    setSyncing(accountId)
    try {
      const today = new Date()
      const thirtyDaysAgo = new Date(today)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const response = await fetch('/api/ads/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adAccountId: accountId,
          dateFrom: thirtyDaysAgo.toISOString().split('T')[0],
          dateTo: today.toISOString().split('T')[0],
        }),
      })

      if (response.ok) {
        setNotification({ type: 'success', message: 'Sync completed successfully!' })
        fetchData() // Refresh data
      } else {
        const error = await response.json()
        setNotification({ type: 'error', message: error.details || 'Sync failed' })
      }
    } catch (error) {
      setNotification({ type: 'error', message: 'Failed to sync. Please try again.' })
    } finally {
      setSyncing(null)
      setTimeout(() => setNotification(null), 5000)
    }
  }

  const connectPlatform = (platform: 'facebook' | 'google' | 'tiktok') => {
    setDialogOpen(false)
    if (platform === 'facebook') {
      window.location.href = '/api/ads/facebook/oauth'
    } else if (platform === 'google') {
      window.location.href = '/api/ads/google/oauth'
    } else {
      setNotification({ type: 'error', message: 'TikTok integration coming soon!' })
      setTimeout(() => setNotification(null), 3000)
    }
  }

  // Calculate totals
  const totalSpend = adSpends.reduce((sum, a) => sum + a.spend, 0)
  const totalRevenue = adSpends.reduce((sum, a) => sum + a.revenue, 0)
  const totalConversions = adSpends.reduce((sum, a) => sum + a.conversions, 0)
  const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0

  // Group spend by platform
  const spendByPlatform = adSpends.reduce((acc, a) => {
    acc[a.platform] = (acc[a.platform] || 0) + a.spend
    return acc
  }, {} as Record<string, number>)

  // Use demo data if no real data
  const displaySpends = adSpends.length > 0 ? adSpends : [
    { id: '1', platform: 'FACEBOOK', campaignName: 'Demo Campaign', campaignId: '1', spend: 12500, impressions: 245000, clicks: 4890, conversions: 156, revenue: 45600, roas: 3.65, cpc: 2.56, cpm: 51.02, currency: 'SEK', date: new Date().toISOString() },
    { id: '2', platform: 'GOOGLE', campaignName: 'Brand Keywords', campaignId: '2', spend: 5400, impressions: 32000, clicks: 1850, conversions: 124, revenue: 38900, roas: 7.20, cpc: 2.92, cpm: 168.75, currency: 'SEK', date: new Date().toISOString() },
  ]

  const displayTotalSpend = adSpends.length > 0 ? totalSpend : 48400
  const displayTotalRevenue = adSpends.length > 0 ? totalRevenue : 208200
  const displayTotalConversions = adSpends.length > 0 ? totalConversions : 690
  const displayOverallRoas = adSpends.length > 0 ? overallRoas : 4.30

  return (
    <div className="space-y-6">
      {/* Notification */}
      {notification && (
        <div className={`flex items-center gap-2 p-4 rounded-lg ${
          notification.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Ad Spend</h1>
          <p className="text-slate-600">Track advertising spend and ROAS across platforms</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Connect Ad Account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect Ad Account</DialogTitle>
              <DialogDescription>
                Choose a platform to connect your advertising account.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Button
                variant="outline"
                className="justify-start h-16"
                onClick={() => connectPlatform('facebook')}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                    <FacebookIcon />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Facebook Ads</p>
                    <p className="text-sm text-slate-500">Connect via Meta Business Suite</p>
                  </div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="justify-start h-16"
                onClick={() => connectPlatform('google')}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-white border rounded-lg">
                    <GoogleIcon />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Google Ads</p>
                    <p className="text-sm text-slate-500">Connect via Google Ads API</p>
                  </div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="justify-start h-16"
                onClick={() => connectPlatform('tiktok')}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-gray-900 rounded-lg text-white">
                    <TikTokIcon />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">TikTok Ads</p>
                    <p className="text-sm text-slate-500">Coming soon</p>
                  </div>
                </div>
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Ad Spend</p>
                <p className="text-2xl font-bold text-slate-800">
                  {displayTotalSpend.toLocaleString('sv-SE')} kr
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Ad Revenue</p>
                <p className="text-2xl font-bold text-green-600">
                  {displayTotalRevenue.toLocaleString('sv-SE')} kr
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Overall ROAS</p>
                <p className="text-2xl font-bold text-slate-800">{displayOverallRoas.toFixed(2)}x</p>
              </div>
              <Target className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Conversions</p>
                <p className="text-2xl font-bold text-slate-800">{displayTotalConversions}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Spend by Platform */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['FACEBOOK', 'GOOGLE', 'TIKTOK'] as const).map((platform) => {
          const config = platformConfig[platform]
          const Icon = config.icon
          const spend = spendByPlatform[platform] || 0

          return (
            <Card key={platform}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${config.bgColor} ${config.textColor}`}>
                    <Icon />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">{config.name}</p>
                    <p className="text-xl font-bold text-slate-800">
                      {spend > 0 ? `${spend.toLocaleString('sv-SE')} kr` : '-'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Connected Accounts */}
      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
          <CardDescription>Your connected advertising accounts</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : adAccounts.length === 0 ? (
            <div className="text-center py-8">
              <Target className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600">No ad accounts connected yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Connect your Facebook or Google Ads account to start tracking performance
              </p>
              <Button className="mt-4" onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Connect Your First Account
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {adAccounts.map((account) => {
                const config = platformConfig[account.platform]
                const Icon = config.icon

                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${config.bgColor} ${config.textColor}`}>
                        <Icon />
                      </div>
                      <div>
                        <p className="font-medium">{account.accountName || `Account ${account.platformAccountId}`}</p>
                        <p className="text-sm text-slate-500">
                          {account.lastSyncAt
                            ? `Last sync: ${new Date(account.lastSyncAt).toLocaleString('sv-SE')}`
                            : 'Never synced'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={account.isActive ? 'default' : 'secondary'}>
                        {account.isActive ? 'Connected' : 'Disconnected'}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSync(account.id)}
                        disabled={syncing === account.id}
                      >
                        {syncing === account.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaign Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Performance</CardTitle>
          <CardDescription>
            {adSpends.length > 0 ? 'Performance metrics by campaign' : 'Demo data - connect an account to see real data'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">CPC</TableHead>
                <TableHead className="text-right">Conversions</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displaySpends.map((campaign) => {
                const config = platformConfig[campaign.platform as keyof typeof platformConfig] || platformConfig.FACEBOOK
                const Icon = config.icon

                return (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded ${config.bgColor} ${config.textColor}`}>
                          <Icon />
                        </div>
                        <span className="font-medium">{campaign.campaignName || 'Unknown Campaign'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      -{campaign.spend.toLocaleString('sv-SE')} kr
                    </TableCell>
                    <TableCell className="text-right">
                      {campaign.impressions.toLocaleString('sv-SE')}
                    </TableCell>
                    <TableCell className="text-right">
                      {campaign.clicks.toLocaleString('sv-SE')}
                    </TableCell>
                    <TableCell className="text-right">{campaign.cpc.toFixed(2)} kr</TableCell>
                    <TableCell className="text-right">{campaign.conversions}</TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      {campaign.revenue.toLocaleString('sv-SE')} kr
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={campaign.roas >= 3 ? 'default' : campaign.roas >= 2 ? 'outline' : 'secondary'}>
                        {campaign.roas.toFixed(2)}x
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AdsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    }>
      <AdsPageContent />
    </Suspense>
  )
}
