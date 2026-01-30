'use client'

import { useState, Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Check, Copy, ExternalLink, Loader2, AlertCircle, FileSpreadsheet, Play, Clock } from 'lucide-react'

// The Google Ads script content
const GOOGLE_ADS_SCRIPT = `/**
 * ============================================================
 * TrueProfit - Google Ads Export Script
 * ============================================================
 *
 * Detta script exporterar din Google Ads-data till ett Google Sheet
 * som TrueProfit sedan läser för att visa din ad spend i dashboarden.
 *
 * SNABBSTART:
 * 1. Skapa ett Google Sheet och kopiera URL:en
 * 2. Ersätt SPREADSHEET_URL nedan med din URL
 * 3. Klicka "Kör" för att testa
 * 4. Schemalägg scriptet att köra varje timme
 */

// ╔════════════════════════════════════════════════════════════╗
// ║  STEG 1: Klistra in din Google Sheet URL här              ║
// ╚════════════════════════════════════════════════════════════╝

var SPREADSHEET_URL = 'KLISTRA_IN_DIN_SHEET_URL_HÄR';

// Exempel: 'https://docs.google.com/spreadsheets/d/1ABC123xyz/edit'


// ╔════════════════════════════════════════════════════════════╗
// ║  INSTÄLLNINGAR (valfritt att ändra)                       ║
// ╚════════════════════════════════════════════════════════════╝

var DAYS_TO_SYNC = 30;
var SHEET_NAME = 'Ad Spend';


// ╔════════════════════════════════════════════════════════════╗
// ║  HUVUDSCRIPT - Rör inte koden nedan                       ║
// ╚════════════════════════════════════════════════════════════╝

function main() {
  if (SPREADSHEET_URL === 'KLISTRA_IN_DIN_SHEET_URL_HÄR' || !SPREADSHEET_URL.includes('docs.google.com')) {
    Logger.log('❌ FEL: Du måste ange din Google Sheet URL i SPREADSHEET_URL variabeln.');
    return;
  }

  try {
    var spreadsheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
    Logger.log('✓ Ansluten till: ' + spreadsheet.getName());
  } catch (e) {
    Logger.log('❌ FEL: Kunde inte öppna spreadsheet. Fel: ' + e.message);
    return;
  }

  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log('→ Skapar ny flik: ' + SHEET_NAME);
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    var headers = ['Date', 'Campaign ID', 'Campaign Name', 'Spend', 'Impressions', 'Clicks', 'Conversions', 'Conversion Value', 'Currency'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.getRange(1, 1, 1, headers.length).setBackground('#f3f4f6');
    sheet.setFrozenRows(1);
  }

  var today = new Date();
  var startDate = new Date(today.getTime() - (DAYS_TO_SYNC * 24 * 60 * 60 * 1000));

  var query = 'SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date >= "' + formatDateForQuery(startDate) + '" AND segments.date <= "' + formatDateForQuery(today) + '" ORDER BY segments.date DESC';

  var report = AdsApp.report(query);
  var rows = report.rows();
  var data = [];
  var currency = AdsApp.currentAccount().getCurrencyCode();

  while (rows.hasNext()) {
    var row = rows.next();
    var spend = (parseFloat(row['metrics.cost_micros']) || 0) / 1000000;
    data.push([row['segments.date'], row['campaign.id'], row['campaign.name'], spend, parseInt(row['metrics.impressions']) || 0, parseInt(row['metrics.clicks']) || 0, parseFloat(row['metrics.conversions']) || 0, parseFloat(row['metrics.conversions_value']) || 0, currency]);
  }

  if (data.length === 0) {
    Logger.log('⚠ Ingen data hittades.');
    return;
  }

  removeOldData(sheet, startDate, today);
  var lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.getRange(lastRow + 1, 1, data.length, 9).setValues(data);

  var totalSpend = data.reduce(function(sum, row) { return sum + row[3]; }, 0);
  Logger.log('✓ EXPORT KLAR! ' + data.length + ' rader, ' + totalSpend.toFixed(2) + ' ' + currency);
}

function removeOldData(sheet, startDate, endDate) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  var startStr = formatDateForQuery(startDate);
  var endStr = formatDateForQuery(endDate);
  for (var i = data.length - 1; i > 0; i--) {
    var rowDate = data[i][0];
    if (typeof rowDate === 'string' && rowDate >= startStr && rowDate <= endStr) {
      sheet.deleteRow(i + 1);
    }
  }
}

function formatDateForQuery(date) {
  var year = date.getFullYear();
  var month = ('0' + (date.getMonth() + 1)).slice(-2);
  var day = ('0' + date.getDate()).slice(-2);
  return year + '-' + month + '-' + day;
}`

function GoogleSheetsSetupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const accountId = searchParams.get('account')

  const [spreadsheetUrl, setSpreadsheetUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [step1Done, setStep1Done] = useState(false)
  const [step2Done, setStep2Done] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/ads/google-sheets/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          spreadsheetUrl,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Något gick fel')
        return
      }

      router.push('/ads?success=google_sheets_connected')
    } catch {
      setError('Kunde inte konfigurera Google Sheets')
    } finally {
      setLoading(false)
    }
  }

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_ADS_SCRIPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea')
      textArea.value = GOOGLE_ADS_SCRIPT
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    }
  }

  if (!accountId) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Något gick fel. <a href="/ads" className="underline">Gå tillbaka</a> och försök igen.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Koppla Google Ads</h1>
        <p className="text-slate-500 mt-1">
          3 enkla steg för att börja spåra din Google Ads-data
        </p>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2 text-sm">
        <div className={`flex items-center gap-1.5 ${step1Done ? 'text-emerald-600' : 'text-slate-400'}`}>
          {step1Done ? <Check className="h-4 w-4" /> : <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-xs">1</span>}
          <span>Skapa Sheet</span>
        </div>
        <div className="w-8 h-px bg-slate-200" />
        <div className={`flex items-center gap-1.5 ${step2Done ? 'text-emerald-600' : 'text-slate-400'}`}>
          {step2Done ? <Check className="h-4 w-4" /> : <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-xs">2</span>}
          <span>Lägg till Script</span>
        </div>
        <div className="w-8 h-px bg-slate-200" />
        <div className="flex items-center gap-1.5 text-slate-400">
          <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-xs">3</span>
          <span>Koppla</span>
        </div>
      </div>

      {/* Step 1: Create Google Sheet */}
      <Card className={step1Done ? 'border-emerald-200 bg-emerald-50/30' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-3">
              <span className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${step1Done ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                {step1Done ? <Check className="h-4 w-4" /> : '1'}
              </span>
              Skapa ett Google Sheet
            </CardTitle>
            {!step1Done && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep1Done(true)}
                className="text-xs"
              >
                Markera som klar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <FileSpreadsheet className="h-6 w-6 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-slate-600 mb-3">
                Scriptet skapar automatiskt rätt format i ditt sheet. Du behöver bara:
              </p>
              <ol className="space-y-2 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="font-medium text-slate-800 shrink-0">1.</span>
                  <span>
                    Gå till{' '}
                    <a
                      href="https://sheets.new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-medium inline-flex items-center gap-1"
                    >
                      sheets.new <ExternalLink className="h-3 w-3" />
                    </a>
                    {' '}för att skapa ett nytt sheet
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-slate-800 shrink-0">2.</span>
                  <span>Ge det ett namn (t.ex. "TrueProfit Google Ads")</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium text-slate-800 shrink-0">3.</span>
                  <span>Kopiera URL:en från adressfältet (du behöver den i steg 3)</span>
                </li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Add Google Ads Script */}
      <Card className={step2Done ? 'border-emerald-200 bg-emerald-50/30' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-3">
              <span className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${step2Done ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                {step2Done ? <Check className="h-4 w-4" /> : '2'}
              </span>
              Lägg till script i Google Ads
            </CardTitle>
            {!step2Done && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep2Done(true)}
                className="text-xs"
              >
                Markera som klar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Copy button prominently displayed */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={copyScript}
              className={`gap-2 flex-1 ${copied ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Kopierat till urklipp!' : 'Kopiera scriptet'}
            </Button>
            <Button
              variant="outline"
              asChild
              className="gap-2"
            >
              <a href="https://ads.google.com/aw/bulkactions/scripts" target="_blank" rel="noopener noreferrer">
                Öppna Google Ads Scripts <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>

          {/* Instructions */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <p className="font-medium text-slate-800 text-sm">I Google Ads:</p>
            <ol className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <span className="bg-blue-100 text-blue-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0">1</span>
                <span>Klicka på <strong>+ Nytt script</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-blue-100 text-blue-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0">2</span>
                <span>Markera all exempelkod och <strong>ta bort den</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-blue-100 text-blue-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0">3</span>
                <span><strong>Klistra in</strong> scriptet du kopierade (Ctrl+V / Cmd+V)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-blue-100 text-blue-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium shrink-0">4</span>
                <span>Ersätt <code className="bg-white px-1.5 py-0.5 rounded border text-xs">KLISTRA_IN_DIN_SHEET_URL_HÄR</code> med din Sheet-URL</span>
              </li>
              <li className="flex items-start gap-2">
                <Play className="h-5 w-5 text-emerald-600 shrink-0" />
                <span>Klicka <strong>Kör</strong> för att testa - du ska se "EXPORT KLAR!" i loggen</span>
              </li>
              <li className="flex items-start gap-2">
                <Clock className="h-5 w-5 text-blue-600 shrink-0" />
                <span>Klicka på <strong>klock-ikonen</strong> och schemalägg att köra <strong>varje timme</strong></span>
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Enter Sheet URL */}
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold">
              3
            </span>
            Koppla till TrueProfit
          </CardTitle>
          <CardDescription>
            Klistra in samma Sheet-URL som du använde i scriptet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="spreadsheetUrl" className="text-sm font-medium">
                Google Sheet URL
              </Label>
              <Input
                id="spreadsheetUrl"
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={spreadsheetUrl}
                onChange={(e) => setSpreadsheetUrl(e.target.value)}
                className="mt-1.5"
                required
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={loading || !spreadsheetUrl}
                className="flex-1"
              >
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Slutför koppling
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/ads')}
              >
                Avbryt
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Info box */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-5 pb-5">
          <div className="flex gap-3">
            <div className="shrink-0">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-medium text-blue-900 mb-1">Hur det fungerar</h3>
              <p className="text-sm text-blue-700">
                Google Ads-scriptet körs automatiskt varje timme och uppdaterar ditt Sheet med senaste datan.
                När du klickar "Synka allt" på dashboarden hämtas data från sheetet direkt.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function GoogleSheetsSetupPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    }>
      <GoogleSheetsSetupContent />
    </Suspense>
  )
}
