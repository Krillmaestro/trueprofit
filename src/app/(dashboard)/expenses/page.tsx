'use client'

import { useState } from 'react'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Receipt, Users, Building, Megaphone, FileText } from 'lucide-react'

// Demo data
const demoExpenses = [
  { id: '1', name: 'Office Rent', category: 'Office', type: 'FIXED', amount: 15000, recurrence: 'MONTHLY', active: true },
  { id: '2', name: 'Marketing Manager', category: 'Labor', type: 'SALARY', amount: 45000, recurrence: 'MONTHLY', active: true },
  { id: '3', name: 'Accounting Software', category: 'Software', type: 'FIXED', amount: 599, recurrence: 'MONTHLY', active: true },
  { id: '4', name: 'Agency Fee', category: 'Agency', type: 'VARIABLE', amount: 5, recurrence: 'MONTHLY', active: true },
  { id: '5', name: 'Insurance', category: 'Insurance', type: 'FIXED', amount: 2500, recurrence: 'MONTHLY', active: true },
  { id: '6', name: 'Sales Commission', category: 'Labor', type: 'VARIABLE', amount: 3, recurrence: 'MONTHLY', active: true },
]

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

export default function ExpensesPage() {
  const [dialogOpen, setDialogOpen] = useState(false)

  const totalFixed = demoExpenses
    .filter((e) => e.type === 'FIXED' || e.type === 'SALARY')
    .reduce((sum, e) => sum + e.amount, 0)

  const totalByCategory = demoExpenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount
    return acc
  }, {} as Record<string, number>)

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
                <Input id="name" placeholder="e.g., Office Rent" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Select>
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
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                      <SelectItem value="variable">Variable (% of revenue)</SelectItem>
                      <SelectItem value="salary">Salary</SelectItem>
                      <SelectItem value="one-time">One-time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="amount">Amount (SEK)</Label>
                  <Input id="amount" type="number" placeholder="0" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="recurrence">Recurrence</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setDialogOpen(false)}>Add Expense</Button>
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

        {Object.entries(totalByCategory).slice(0, 3).map(([category, amount]) => (
          <Card key={category}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">{category}</p>
                  <p className="text-2xl font-bold text-slate-800">
                    {amount.toLocaleString('sv-SE')} kr
                  </p>
                </div>
                {categoryIcons[category]}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Expenses</CardTitle>
          <CardDescription>Manage your fixed costs and recurring expenses</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Recurrence</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {demoExpenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="font-medium">{expense.name}</TableCell>
                  <TableCell>
                    <Badge className={categoryColors[expense.category] || 'bg-slate-100 text-slate-800'}>
                      {expense.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {expense.type === 'VARIABLE' ? `${expense.amount}% of revenue` : expense.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {expense.type === 'VARIABLE'
                      ? `${expense.amount}%`
                      : `${expense.amount.toLocaleString('sv-SE')} kr`}
                  </TableCell>
                  <TableCell className="capitalize">{expense.recurrence.toLowerCase()}</TableCell>
                  <TableCell>
                    <Badge variant={expense.active ? 'default' : 'secondary'}>
                      {expense.active ? 'Active' : 'Inactive'}
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
