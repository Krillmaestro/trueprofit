'use client'

import { SessionProvider } from 'next-auth/react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionProvider>
      <div className="flex h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50/30">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            <div className="max-w-[1600px] mx-auto page-transition">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SessionProvider>
  )
}
