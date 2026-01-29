'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Store, Users, CreditCard, Bell, User, Shield } from 'lucide-react'

const settingsLinks = [
  {
    title: 'Store Connections',
    description: 'Connect and manage your Shopify stores',
    href: '/settings/stores',
    icon: Store,
  },
  {
    title: 'Team Members',
    description: 'Invite and manage team access',
    href: '/settings/team',
    icon: Users,
  },
  {
    title: 'Payment Fees',
    description: 'Configure payment provider fees',
    href: '/settings/fees',
    icon: CreditCard,
  },
  {
    title: 'Profile',
    description: 'Update your personal information',
    href: '/settings/profile',
    icon: User,
  },
  {
    title: 'Notifications',
    description: 'Configure email and push notifications',
    href: '/settings/notifications',
    icon: Bell,
  },
  {
    title: 'Security',
    description: 'Password and two-factor authentication',
    href: '/settings/security',
    icon: Shield,
  },
]

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-600">Manage your account and preferences</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {settingsLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <link.icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{link.title}</CardTitle>
                    <CardDescription>{link.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
