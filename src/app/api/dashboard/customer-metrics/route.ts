import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/dashboard/customer-metrics
 * Returns customer acquisition and lifetime value metrics
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  // Default to current month
  const now = new Date()
  const defaultStartDate = new Date(now.getFullYear(), now.getMonth(), 1)
  const defaultEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const dateFilter = {
    gte: startDate ? new Date(startDate) : defaultStartDate,
    lte: endDate ? new Date(endDate) : defaultEndDate,
  }

  // Get stores for the team
  const stores = await prisma.store.findMany({
    where: { teamId: teamMember.teamId },
    select: { id: true },
  })
  const storeIds = stores.map(s => s.id)

  // Get all orders for customer analysis (all-time for LTV calculation)
  // IMPORTANT: We use subtotalPrice + totalShippingPrice - totalDiscounts for correct revenue
  // This matches Shopify's "Nettoförsäljning + Frakt" (ex VAT)
  const allOrders = await prisma.order.findMany({
    where: {
      storeId: { in: storeIds },
      financialStatus: { notIn: ['refunded', 'voided'] },
      cancelledAt: null,
      customerEmail: { not: null },
    },
    select: {
      id: true,
      customerEmail: true,
      subtotalPrice: true,
      totalShippingPrice: true,
      totalDiscounts: true,
      totalRefundAmount: true,
      processedAt: true,
    },
    orderBy: { processedAt: 'asc' },
  })

  // Get orders in current period
  const periodOrders = await prisma.order.findMany({
    where: {
      storeId: { in: storeIds },
      processedAt: dateFilter,
      financialStatus: { notIn: ['refunded', 'voided'] },
      cancelledAt: null,
      customerEmail: { not: null },
    },
    select: {
      customerEmail: true,
      subtotalPrice: true,
      totalShippingPrice: true,
      totalDiscounts: true,
      totalRefundAmount: true,
    },
  })

  // Get ad spend for CAC calculation
  const adSpendResult = await prisma.adSpend.aggregate({
    where: {
      adAccount: {
        teamId: teamMember.teamId,
      },
      date: dateFilter,
    },
    _sum: {
      spend: true,
      revenue: true,
    },
  })

  const totalAdSpend = Number(adSpendResult._sum.spend || 0)
  const adRevenue = Number(adSpendResult._sum.revenue || 0)

  // Calculate Break-Even ROAS for new customers
  // Get COGS, fees, and shipping costs to calculate variable cost ratio
  const ordersWithCosts = await prisma.order.findMany({
    where: {
      storeId: { in: storeIds },
      processedAt: dateFilter,
      financialStatus: { notIn: ['refunded', 'voided'] },
      cancelledAt: null,
    },
    select: {
      totalPrice: true,
      totalTax: true,
      lineItems: {
        select: {
          quantity: true,
          variant: {
            select: {
              cogsEntries: {
                where: { effectiveTo: null },
                take: 1,
                select: { costPrice: true },
              },
            },
          },
        },
      },
    },
  })

  let periodCOGS = 0
  let periodRevenueForBE = 0
  let periodTax = 0

  for (const order of ordersWithCosts) {
    periodRevenueForBE += Number(order.totalPrice)
    periodTax += Number(order.totalTax)
    for (const item of order.lineItems) {
      if (item.variant?.cogsEntries?.[0]) {
        periodCOGS += Number(item.variant.cogsEntries[0].costPrice) * item.quantity
      }
    }
  }

  // Estimate fees at 3% and shipping at 5% of revenue
  const estimatedFees = periodRevenueForBE * 0.03
  const estimatedShipping = periodRevenueForBE * 0.05
  const netRevenue = periodRevenueForBE - periodTax
  const variableCosts = periodCOGS + estimatedFees + estimatedShipping
  const variableCostRatio = netRevenue > 0 ? variableCosts / netRevenue : 0.5
  const contributionMarginRatio = 1 - variableCostRatio
  const breakEvenRoasNewCustomers = contributionMarginRatio > 0 ? 1 / contributionMarginRatio : 2.0

  // Helper function to calculate order revenue (matches Shopify's Nettoförsäljning + Frakt)
  // This is revenue EXCLUDING VAT - the correct basis for LTV calculation
  const calculateOrderRevenueExVat = (order: {
    subtotalPrice: unknown
    totalShippingPrice: unknown
    totalDiscounts: unknown
    totalRefundAmount?: unknown
  }) => {
    const subtotal = Number(order.subtotalPrice) || 0
    const shipping = Number(order.totalShippingPrice) || 0
    const discounts = Number(order.totalDiscounts) || 0
    const refunds = Number(order.totalRefundAmount) || 0
    // Nettoförsäljning = Bruttoförsäljning - Rabatter - Returer
    // Revenue ex VAT = Nettoförsäljning + Frakt
    return (subtotal - discounts - refunds) + shipping
  }

  // Build customer data
  const customerData = new Map<string, {
    firstOrderDate: Date
    orders: number
    totalRevenue: number // Revenue ex VAT
  }>()

  for (const order of allOrders) {
    if (!order.customerEmail) continue

    const email = order.customerEmail.toLowerCase()
    const orderRevenueExVat = calculateOrderRevenueExVat(order)
    const existing = customerData.get(email)

    if (existing) {
      existing.orders++
      existing.totalRevenue += orderRevenueExVat
    } else {
      customerData.set(email, {
        firstOrderDate: order.processedAt || new Date(),
        orders: 1,
        totalRevenue: orderRevenueExVat,
      })
    }
  }

  // Count customers in period
  const periodCustomers = new Set<string>()
  const newCustomersInPeriod = new Set<string>()
  const returningCustomersInPeriod = new Set<string>()

  for (const order of periodOrders) {
    if (!order.customerEmail) continue

    const email = order.customerEmail.toLowerCase()
    periodCustomers.add(email)

    const customerInfo = customerData.get(email)
    if (customerInfo) {
      // Check if first order was in current period
      if (customerInfo.firstOrderDate >= dateFilter.gte && customerInfo.firstOrderDate <= dateFilter.lte) {
        newCustomersInPeriod.add(email)
      } else {
        returningCustomersInPeriod.add(email)
      }
    }
  }

  // Calculate metrics
  const totalCustomersAllTime = customerData.size
  const customersInPeriod = periodCustomers.size
  const newCustomers = newCustomersInPeriod.size
  const returningCustomers = returningCustomersInPeriod.size

  // Repeat rate = customers with more than 1 order / total customers
  let customersWithMultipleOrders = 0
  let totalOrdersFromRepeaters = 0
  let totalRevenue = 0
  let totalOrders = 0

  for (const [, data] of customerData) {
    totalOrders += data.orders
    totalRevenue += data.totalRevenue
    if (data.orders > 1) {
      customersWithMultipleOrders++
      totalOrdersFromRepeaters += data.orders
    }
  }

  const repeatRate = totalCustomersAllTime > 0
    ? (customersWithMultipleOrders / totalCustomersAllTime) * 100
    : 0

  // Average orders per customer
  const avgOrdersPerCustomer = totalCustomersAllTime > 0
    ? totalOrders / totalCustomersAllTime
    : 0

  // LTV = Average Revenue per Customer (all-time)
  const ltv = totalCustomersAllTime > 0
    ? totalRevenue / totalCustomersAllTime
    : 0

  // CAC = Ad Spend / New Customers in period
  const cac = newCustomers > 0
    ? totalAdSpend / newCustomers
    : 0

  // LTV:CAC ratio
  const ltvCacRatio = cac > 0 ? ltv / cac : 0

  // Average Order Value
  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0

  // Period-specific revenue (ex VAT)
  const periodRevenue = periodOrders.reduce((sum, o) => sum + calculateOrderRevenueExVat(o), 0)

  return NextResponse.json({
    metrics: {
      // Customer counts
      totalCustomersAllTime,
      customersInPeriod,
      newCustomers,
      returningCustomers,
      customersWithMultipleOrders,

      // Rates
      repeatRate,
      newVsReturningRatio: customersInPeriod > 0
        ? (newCustomers / customersInPeriod) * 100
        : 0,

      // Averages
      avgOrdersPerCustomer,
      aov,

      // Acquisition
      cac,
      adSpend: totalAdSpend,

      // Lifetime Value
      ltv,
      ltvCacRatio,

      // Revenue (all ex VAT for correct LTV calculation)
      totalRevenueAllTime: totalRevenue,
      periodRevenueCalc: periodRevenue,

      // Break-Even ROAS for new customers
      breakEvenRoasNewCustomers,
      currentRoas: totalAdSpend > 0 ? adRevenue / totalAdSpend : 0,
      adRevenue,
    },
    period: {
      startDate: dateFilter.gte.toISOString(),
      endDate: dateFilter.lte.toISOString(),
    },
    insights: generateInsights({
      ltvCacRatio,
      repeatRate,
      cac,
      newCustomers,
      avgOrdersPerCustomer,
    }),
  })
}

interface InsightParams {
  ltvCacRatio: number
  repeatRate: number
  cac: number
  newCustomers: number
  avgOrdersPerCustomer: number
}

function generateInsights(params: InsightParams): Array<{
  type: 'success' | 'warning' | 'info'
  message: string
}> {
  const insights: Array<{ type: 'success' | 'warning' | 'info'; message: string }> = []

  // LTV:CAC insights
  if (params.ltvCacRatio >= 3) {
    insights.push({
      type: 'success',
      message: `Utmärkt LTV:CAC ratio (${params.ltvCacRatio.toFixed(1)}:1). Dina kunder är värda ${params.ltvCacRatio.toFixed(1)}x vad det kostar att skaffa dem.`,
    })
  } else if (params.ltvCacRatio >= 1 && params.ltvCacRatio < 3) {
    insights.push({
      type: 'warning',
      message: `LTV:CAC ratio är ${params.ltvCacRatio.toFixed(1)}:1. Sikta på minst 3:1 för hållbar tillväxt.`,
    })
  } else if (params.ltvCacRatio > 0 && params.ltvCacRatio < 1) {
    insights.push({
      type: 'warning',
      message: `Varning: LTV:CAC ratio under 1 (${params.ltvCacRatio.toFixed(2)}:1). Du förlorar pengar på varje ny kund.`,
    })
  }

  // Repeat rate insights
  if (params.repeatRate >= 30) {
    insights.push({
      type: 'success',
      message: `Stark återköpsfrekvens (${params.repeatRate.toFixed(0)}%). Dina kunder kommer tillbaka.`,
    })
  } else if (params.repeatRate < 15 && params.avgOrdersPerCustomer < 1.5) {
    insights.push({
      type: 'info',
      message: `Låg återköpsfrekvens (${params.repeatRate.toFixed(0)}%). Överväg email-marketing eller lojalitetsprogram.`,
    })
  }

  // New customers
  if (params.newCustomers === 0 && params.cac === 0) {
    insights.push({
      type: 'info',
      message: 'Inga nya kunder denna period. Överväg att öka annonsbudgeten.',
    })
  }

  return insights
}
