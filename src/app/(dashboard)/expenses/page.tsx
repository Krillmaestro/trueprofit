'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Receipt, Users, Building, Megaphone, FileText, Trash2, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

interface Expense {
  id: string
  name: string
  costType: 'FIXED' | 'VARIABLE' | 'SALARY' | 'ONE_TIME'
  amount: number
  recurrenceType: string | null
  description: string | null
  isActive: boolean
  category: { id: string; name: string } | null
  entries: Array<{ id: string; date: string; amount: number }>
}

interface ExpensesData {
  expenses: Expense[]
  totals: {
    FIXED: number
    VARIABLE: number
    SALARY: number
    ONE_TIME: number
    total: number
  }
}

const categoryIcons: Record<string, React.ReactNode> = {
  Office: <Building className="h-4 w-4" />,
  Labor: <Users className="h-4 w-4" />,
  Software: <FileText className="h-4 w-4" />,
  Agency: <Megaphone className="h-4 w-4" />,
  Insurance: <Receipt className="h-4 w-4" />,
}

const categoryColors: Record<string, string> = {
  Office: 'bg-blue-100 text-blue-800',
  Labor: 'bg-green-100 text-green-800',
  Software: 'bg-purple-100 text-purple-800',
  Agency: 'bg-orange-100 text-orange-800',
  Insurance: 'bg-slate-100 text-slate-800',
}

const typeLabels: Record<string, string> = {
  FIXED: 'Fixed',
  VARIABLE: 'Variable',
  SALARY: 'Salary',
  ONE_TIME: 'One-time',
}

export default function ExpensesPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [data, setData] = useState<ExpensesData | null>(null)
  const { addToast } = useToast()

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    type: '',
    amount: '',
    recurrenceType: 'MONTHLY',
  })

  // Fetch expenses
  const fetchExpenses = async () => {
    try {
      const response = await fetch('/api/expenses')
      if (!response.ok) throw new Error('Failed to fetch expenses')
      const result = await response.json()
      setData(result)
    } catch (error) {
      console.error('Error fetching expenses:', error)
      addToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to load expenses',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExpenses()
  }, [])

  // Handle form submission
  const handleAddExpense = async () => {
    if (!formData.name || !formData.type || !formData.amount) {
      addToast({
        type: 'error',
        title: 'Validation Error',
        message: 'Please fill in all required fields',
      })
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          amount: formData.amount,
          recurrenceType: formData.recurrenceType,
          isRecurring: formData.recurrenceType !== 'ONE_TIME',
        }),
      })

      if (!response.ok) throw new Error('Failed to create expense')

      addToast({
        type: 'success',
        title: 'Success',
        message: 'Expense added successfully',
      })

      // Reset form and close dialog
      setFormData({
        name: '',
        category: '',
        type: '',
        amount: '',
        recurrenceType: 'MONTHLY',
      })
      setDialogOpen(false)

      // Refresh data
      fetchExpenses()
    } catch (error) {
      console.error('Error creating expense:', error)
      addToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to create expense',
      })
    } finally {
      setSaving(false)
    }
  }

  // Handle delete
  const handleDeleteExpense = async () => {
    if (!expenseToDelete) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/expenses?id=${expenseToDelete.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete expense')

      addToast({
        type: 'success',
        title: 'Success',
        message: 'Expense deleted successfully',
      })

      setDeleteDialogOpen(false)
      setExpenseToDelete(null)

      // Refresh data
      fetchExpenses()
    } catch (error) {
      console.error('Error deleting expense:', error)
      addToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to delete expense',
      })
    } finally {
      setDeleting(false)
    }
  }

  // Calculate totals from real data
  const expenses = data?.expenses || []
  const totalFixed = expenses
    .filter((e) => e.costType === 'FIXED' || e.costType === 'SALARY')
    .reduce((sum, e) => sum + Number(e.amount), 0)

  const totalByType = {
    FIXED: expenses.filter((e) => e.costType === 'FIXED').reduce((sum, e) => sum + Number(e.amount), 0),
    SALARY: expenses.filter((e) => e.costType === 'SALARY').reduce((sum, e) => sum + Number(e.amount), 0),
    VARIABLE: expenses.filter((e) => e.costType === 'VARIABLE').reduce((sum, e) => sum + Number(e.amount), 0),
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Expenses</h1>
          <p className="text-slate-600">Manage fixed costs, salaries, and recurring expenses</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Expense
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Expense</DialogTitle>
              <DialogDescription>
                Add a fixed cost, salary, or recurring expense.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Expense Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Office Rent"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="office">Office</SelectItem>
                      <SelectItem value="labor">Labor / Salary</SelectItem>
                      <SelectItem value="software">Software</SelectItem>
                      <SelectItem value="agency">Agency</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="insurance">Insurance</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="type">Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXED">Fixed Amount</SelectItem>
                      <SelectItem value="VARIABLE">Variable (% of revenue)</SelectItem>
                      <SelectItem value="SALARY">Salary</SelectItem>
                      <SelectItem value="ONE_TIME">One-time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="amount">
                    {formData.type === 'VARIABLE' ? 'Percentage (%)' : 'Amount (SEK)'}
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="recurrence">Recurrence</Label>
                  <Select
                    value={formData.recurrenceType}
                    onValueChange={(value) => setFormData({ ...formData, recurrenceType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DAILY">Daily</SelectItem>
                      <SelectItem value="WEEKLY">Weekly</SelectItem>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                      <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                      <SelectItem value="YEARLY">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddExpense} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Add Expense'
                )}
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
                <p className="text-sm text-slate-600">Total Monthly Fixed</p>
                <p className="text-2xl font-bold text-slate-800">
                  {totalFixed.toLocaleString('sv-SE')} kr
                </p>
              </div>
              <Receipt className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Fixed Costs</p>
                <p className="text-2xl font-bold text-slate-800">
                  {totalByType.FIXED.toLocaleString('sv-SE')} kr
                </p>
              </div>
              <Building className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Salaries</p>
                <p className="text-2xl font-bold text-slate-800">
                  {totalByType.SALARY.toLocaleString('sv-SE')} kr
                </p>
              </div>
              <Users className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Variable Costs</p>
                <p className="text-2xl font-bold text-slate-800">
                  {totalByType.VARIABLE > 0 ? `${totalByType.VARIABLE}%` : '0%'}
                </p>
              </div>
              <Megaphone className="h-8 w-8 text-orange-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Expenses</CardTitle>
          <CardDescription>
            {expenses.length > 0
              ? `${expenses.length} expense${expenses.length === 1 ? '' : 's'} configured`
              : 'No expenses configured yet'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-800 mb-2">No expenses yet</h3>
              <p className="text-slate-600 mb-4">
                Add your first expense to start tracking costs
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Expense
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Recurrence</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium">{expense.name}</TableCell>
                    <TableCell>
                      {expense.category ? (
                        <Badge className={categoryColors[expense.category.name] || 'bg-slate-100 text-slate-800'}>
                          {expense.category.name}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Uncategorized</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {typeLabels[expense.costType] || expense.costType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {expense.costType === 'VARIABLE'
                        ? `${Number(expense.amount)}%`
                        : `${Number(expense.amount).toLocaleString('sv-SE')} kr`}
                    </TableCell>
                    <TableCell className="capitalize">
                      {expense.recurrenceType?.toLowerCase() || 'One-time'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={expense.isActive ? 'default' : 'secondary'}>
                        {expense.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setExpenseToDelete(expense)
                          setDeleteDialogOpen(true)
                        }}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{expenseToDelete?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteExpense}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
