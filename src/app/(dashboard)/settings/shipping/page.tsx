'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { Plus, Trash2, Save, Package, ArrowLeft, Info } from 'lucide-react'
import Link from 'next/link'

interface ShippingTier {
  id?: string
  name: string
  minItems: number
  maxItems: number | null
  cost: number
  costPerAdditionalItem: number
  shippingZone?: string | null
}

interface StoreShipping {
  storeId: string
  storeName: string
  tiers: ShippingTier[]
}

export default function ShippingSettingsPage() {
  const [stores, setStores] = useState<StoreShipping[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()

  useEffect(() => {
    fetchShippingCosts()
  }, [])

  const fetchShippingCosts = async () => {
    try {
      const res = await fetch('/api/shipping-costs')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()

      // If no tiers exist, create default structure
      if (data.length === 0 || data.every((s: StoreShipping) => s.tiers.length === 0)) {
        // Fetch stores to show empty state
        const storesRes = await fetch('/api/stores')
        if (storesRes.ok) {
          const storesData = await storesRes.json()
          setStores(storesData.map((s: { id: string; name: string }) => ({
            storeId: s.id,
            storeName: s.name,
            tiers: getDefaultTiers(),
          })))
        }
      } else {
        setStores(data)
      }
    } catch (error) {
      console.error('Error fetching shipping costs:', error)
      addToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to load shipping costs',
      })
    } finally {
      setLoading(false)
    }
  }

  const getDefaultTiers = (): ShippingTier[] => [
    { name: '1 item', minItems: 1, maxItems: 1, cost: 32, costPerAdditionalItem: 0 },
    { name: '2 items', minItems: 2, maxItems: 2, cost: 42, costPerAdditionalItem: 0 },
    { name: '3+ items', minItems: 3, maxItems: null, cost: 52, costPerAdditionalItem: 5 },
  ]

  const addTier = (storeIndex: number) => {
    const newStores = [...stores]
    const store = newStores[storeIndex]
    const lastTier = store.tiers[store.tiers.length - 1]
    const newMinItems = lastTier ? (lastTier.maxItems ? lastTier.maxItems + 1 : lastTier.minItems + 1) : 1

    store.tiers.push({
      name: `${newMinItems}+ items`,
      minItems: newMinItems,
      maxItems: null,
      cost: lastTier ? lastTier.cost + 10 : 32,
      costPerAdditionalItem: 0,
    })
    setStores(newStores)
  }

  const removeTier = async (storeIndex: number, tierIndex: number) => {
    const tier = stores[storeIndex].tiers[tierIndex]

    if (tier.id) {
      // Delete from server
      try {
        const res = await fetch(`/api/shipping-costs?id=${tier.id}`, {
          method: 'DELETE',
        })
        if (!res.ok) throw new Error('Failed to delete')
      } catch (error) {
        console.error('Error deleting tier:', error)
        addToast({
          type: 'error',
          title: 'Error',
          message: 'Failed to delete tier',
        })
        return
      }
    }

    const newStores = [...stores]
    newStores[storeIndex].tiers.splice(tierIndex, 1)
    setStores(newStores)
  }

  const updateTier = (storeIndex: number, tierIndex: number, field: keyof ShippingTier, value: string | number | null) => {
    const newStores = [...stores]
    const tier = newStores[storeIndex].tiers[tierIndex]

    if (field === 'cost' || field === 'costPerAdditionalItem') {
      tier[field] = parseFloat(value as string) || 0
    } else if (field === 'minItems') {
      tier[field] = parseInt(value as string) || 1
    } else if (field === 'maxItems') {
      tier[field] = value === '' || value === null ? null : parseInt(value as string)
    } else if (field === 'name') {
      tier[field] = value as string
    }

    setStores(newStores)
  }

  const saveTiers = async (storeIndex: number) => {
    setSaving(true)
    const store = stores[storeIndex]

    try {
      for (const tier of store.tiers) {
        if (tier.id) {
          // Update existing
          await fetch('/api/shipping-costs', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: tier.id, ...tier }),
          })
        } else {
          // Create new
          const res = await fetch('/api/shipping-costs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storeId: store.storeId, ...tier }),
          })
          if (res.ok) {
            const created = await res.json()
            tier.id = created.id
          }
        }
      }

      addToast({
        type: 'success',
        title: 'Saved',
        message: 'Shipping tiers updated successfully',
      })
    } catch (error) {
      console.error('Error saving tiers:', error)
      addToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to save shipping tiers',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Settings
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-800">Shipping Cost Tiers</h1>
        <p className="text-slate-600">Configure bundled shipping costs based on order quantity</p>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">How shipping tiers work:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>Set different shipping costs based on item quantity in an order</li>
                <li>Example: 1 item = 32 kr, 2 items = 42 kr, 3+ items = 52 kr + 5 kr per extra</li>
                <li>Leave "Max Items" empty for unlimited (e.g., "3 or more items")</li>
                <li>Use "Cost per Additional" for incremental pricing above the minimum</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {stores.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-slate-400 mb-4" />
            <h3 className="text-lg font-medium text-slate-700 mb-2">No stores connected</h3>
            <p className="text-slate-500 mb-4">Connect a Shopify store to configure shipping costs</p>
            <Link href="/settings/stores">
              <Button>Connect Store</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        stores.map((store, storeIndex) => (
          <Card key={store.storeId}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {store.storeName}
              </CardTitle>
              <CardDescription>
                Configure shipping cost tiers for this store
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Header row */}
              <div className="grid grid-cols-12 gap-2 text-sm font-medium text-slate-600 pb-2 border-b">
                <div className="col-span-3">Tier Name</div>
                <div className="col-span-2">Min Items</div>
                <div className="col-span-2">Max Items</div>
                <div className="col-span-2">Base Cost (kr)</div>
                <div className="col-span-2">Per Extra (kr)</div>
                <div className="col-span-1"></div>
              </div>

              {/* Tier rows */}
              {store.tiers.map((tier, tierIndex) => (
                <div key={tierIndex} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3">
                    <Input
                      value={tier.name}
                      onChange={(e) => updateTier(storeIndex, tierIndex, 'name', e.target.value)}
                      placeholder="e.g., 1 item"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      min="1"
                      value={tier.minItems}
                      onChange={(e) => updateTier(storeIndex, tierIndex, 'minItems', e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      min="1"
                      value={tier.maxItems ?? ''}
                      onChange={(e) => updateTier(storeIndex, tierIndex, 'maxItems', e.target.value)}
                      placeholder="∞"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tier.cost}
                      onChange={(e) => updateTier(storeIndex, tierIndex, 'cost', e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tier.costPerAdditionalItem}
                      onChange={(e) => updateTier(storeIndex, tierIndex, 'costPerAdditionalItem', e.target.value)}
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTier(storeIndex, tierIndex)}
                      disabled={store.tiers.length <= 1}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Example calculation */}
              <div className="bg-slate-50 rounded-lg p-4 mt-4">
                <p className="text-sm font-medium text-slate-700 mb-2">Example calculations:</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {[1, 2, 3, 5].map((items) => {
                    const cost = calculateShippingCost(items, store.tiers)
                    return (
                      <div key={items} className="text-slate-600">
                        <span className="font-medium">{items} {items === 1 ? 'item' : 'items'}:</span>{' '}
                        <span className="text-green-600 font-medium">{cost.toFixed(0)} kr</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addTier(storeIndex)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Tier
                </Button>
                <Button
                  size="sm"
                  onClick={() => saveTiers(storeIndex)}
                  disabled={saving}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

// Calculate shipping cost based on item count and tiers
function calculateShippingCost(
  itemCount: number,
  tiers: ShippingTier[]
): number {
  if (itemCount <= 0 || tiers.length === 0) return 0

  // Sort by minItems ascending
  const sortedTiers = [...tiers].sort((a, b) => a.minItems - b.minItems)

  // Find matching tier
  let matchingTier: ShippingTier | null = null
  for (const tier of sortedTiers) {
    if (itemCount >= tier.minItems) {
      if (tier.maxItems === null || itemCount <= tier.maxItems) {
        matchingTier = tier
        break
      }
    }
  }

  // Use highest tier if no match
  if (!matchingTier) {
    matchingTier = sortedTiers[sortedTiers.length - 1]
  }

  if (!matchingTier) return 0

  // Calculate cost with per-additional-item
  let cost = matchingTier.cost
  if (matchingTier.costPerAdditionalItem > 0 && itemCount > matchingTier.minItems) {
    const extraItems = itemCount - matchingTier.minItems
    cost += extraItems * matchingTier.costPerAdditionalItem
  }

  return cost
}
