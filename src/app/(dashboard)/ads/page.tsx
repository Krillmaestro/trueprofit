'use client'

import { useState } from 'react'
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
import { Plus, DollarSign, TrendingUp, Target, BarChart3, Facebook, Chrome } from 'lucide-react'

// Demo data
const demoAdAccounts = [
  {
    id: '1',
    platform: 'facebook',
    name: 'Main Facebook Ads',
    status: 'connected',
    lastSync: '2025-01-28 14:32',
  },
  {
    id: '2',
    platform: 'google',
    name: 'Google Ads Primary',
    status: 'connected',
    lastSync: '2025-01-28 14:30',
  },
]

const demoAdSpend = [
  {
    id: '1',
    platform: 'facebook',
    campaign: 'Winter Sale 2025',
    spend: 12500,
    impressions: 245000,
    clicks: 4890,
    conversions: 156,
    revenue: 45600,
    roas: 3.65,
    cpc: 2.56,
    cpa: 80.13,
  },
  {
    id: '2',
    platform: 'facebook',
    campaign: 'Retargeting - Cart Abandoners',
    spend: 8200,
    impressions: 89000,
    clicks: 2340,
    conversions: 98,
    revenue: 32400,
    roas: 3.95,
    cpc: 3.50,
    cpa: 83.67,
  },
  {
    id: '3',
    platform: 'google',
    campaign: 'Brand Keywords',
    spend: 5400,
    impressions: 32000,
    clicks: 1850,
    conversions: 124,
    revenue: 38900,
    roas: 7.20,
    cpc: 2.92,
    cpa: 43.55,
  },
  {
    id: '4',
    platform: 'google',
    campaign: 'Shopping Ads',
    spend: 15800,
    impressions: 520000,
    clicks: 8920,
    conversions: 245,
    revenue: 72400,
    roas: 4.58,
    cpc: 1.77,
    cpa: 64.49,
  },
  {
    id: '5',
    platform: 'tiktok',
    campaign: 'Gen Z Awareness',
    spend: 6500,
    impressions: 890000,
    clicks: 12400,
    conversions: 67,
    revenue: 18900,
    roas: 2.91,
    cpc: 0.52,
    cpa: 97.01,
  },
]

const platformIcons: Record<string, React.ReactNode> = {
  facebook: <Facebook className="w-4 h-4" />,
  google: <Chrome className="w-4 h-4" />,
  tiktok: <span className="text-xs font-bold">TT</span>,
}

const platformColors: Record<string, string> = {
  facebook: 'bg-blue-100 text-blue-700',
  google: 'bg-red-100 text-red-700',
  tiktok: 'bg-gray-100 text-gray-700',
}

export default function AdsPage() {
  const [dialogOpen, setDialogOpen] = useState(false)

  const totalSpend = demoAdSpend.reduce((sum, a) => sum + a.spend, 0)
  const totalRevenue = demoAdSpend.reduce((sum, a) => sum + a.revenue, 0)
  const totalConversions = demoAdSpend.reduce((sum, a) => sum + a.conversions, 0)
  const overallRoas = totalRevenue / totalSpend

  const spendByPlatform = demoAdSpend.reduce((acc, a) => {
    acc[a.platform] = (acc[a.platform] || 0) + a.spend
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Ad Spend</h1>
          <p className="text-slate-600">Track advertising spend and ROAS</p>
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
              <Button variant="outline" className="justify-start h-16">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Facebook className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Facebook Ads</p>
                    <p className="text-sm text-slate-500">Connect via Meta Business Suite</p>
                  </div>
                </div>
              </Button>
              <Button variant="outline" className="justify-start h-16">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <Chrome className="w-6 h-6 text-red-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Google Ads</p>
                    <p className="text-sm text-slate-500">Connect via Google Ads API</p>
                  </div>
                </div>
              </Button>
              <Button variant="outline" className="justify-start h-16">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <span className="text-lg font-bold text-gray-600">TT</span>
                  </div>
                  <div className="text-left">
                    <p className="font-medium">TikTok Ads</p>
                    <p className="text-sm text-slate-500">Connect via TikTok Business Center</p>
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
                  {totalSpend.toLocaleString('sv-SE')} kr
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
                  {totalRevenue.toLocaleString('sv-SE')} kr
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
                <p className="text-2xl font-bold text-slate-800">{overallRoas.toFixed(2)}x</p>
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
                <p className="text-2xl font-bold text-slate-800">{totalConversions}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Spend by Platform */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Facebook className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Facebook Ads</p>
                <p className="text-xl font-bold text-slate-800">
                  {(spendByPlatform['facebook'] || 0).toLocaleString('sv-SE')} kr
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Chrome className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Google Ads</p>
                <p className="text-xl font-bold text-slate-800">
                  {(spendByPlatform['google'] || 0).toLocaleString('sv-SE')} kr
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <span className="text-sm font-bold text-gray-600">TT</span>
              </div>
              <div>
                <p className="text-sm text-slate-600">TikTok Ads</p>
                <p className="text-xl font-bold text-slate-800">
                  {(spendByPlatform['tiktok'] || 0).toLocaleString('sv-SE')} kr
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Connected Accounts */}
      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
          <CardDescription>Your connected advertising accounts</CardDescription>
        </CardHeader>
        <CardContent>
          {demoAdAccounts.length === 0 ? (
            <div className="text-center py-8">
              <Target className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600">No ad accounts connected yet</p>
              <Button className="mt-4" onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Connect Your First Account
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {demoAdAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${platformColors[account.platform]}`}>
                      {platformIcons[account.platform]}
                    </div>
                    <div>
                      <p className="font-medium">{account.name}</p>
                      <p className="text-sm text-slate-500">Last sync: {account.lastSync}</p>
                    </div>
                  </div>
                  <Badge variant={account.status === 'connected' ? 'default' : 'secondary'}>
                    {account.status === 'connected' ? 'Connected' : 'Disconnected'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaign Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Performance</CardTitle>
          <CardDescription>Performance metrics by campaign</CardDescription>
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
                <TableHead className="text-right">CPA</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {demoAdSpend.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${platformColors[campaign.platform]}`}>
                        {platformIcons[campaign.platform]}
                      </div>
                      <span className="font-medium">{campaign.campaign}</span>
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
                  <TableCell className="text-right">{campaign.cpa.toFixed(2)} kr</TableCell>
                  <TableCell className="text-right font-medium text-green-600">
                    {campaign.revenue.toLocaleString('sv-SE')} kr
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={campaign.roas >= 3 ? 'default' : campaign.roas >= 2 ? 'outline' : 'secondary'}>
                      {campaign.roas.toFixed(2)}x
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
