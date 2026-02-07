/**
 * Google Ads Script - Exporterar data till Google Sheets för TrueProfit
 *
 * INSTALLATION:
 * 1. Gå till Google Ads → Verktyg & Inställningar → Massåtgärder → Skript
 * 2. Klicka "+ Nytt skript"
 * 3. Klistra in hela denna kod
 * 4. Ändra SPREADSHEET_URL till din Google Sheet URL
 * 5. Klicka "Auktorisera" och godkänn behörigheterna
 * 6. Klicka "Kör" för att testa
 * 7. Schemalägg att köra dagligen (t.ex. kl 06:00)
 *
 * SHEET FORMAT (skapas automatiskt):
 * Kolumn A: Date (YYYY-MM-DD)
 * Kolumn B: Campaign ID
 * Kolumn C: Campaign Name
 * Kolumn D: Spend (Cost)
 * Kolumn E: Impressions
 * Kolumn F: Clicks
 * Kolumn G: Conversions
 * Kolumn H: Conversion Value
 * Kolumn I: Currency
 */

// ============================================
// KONFIGURATION - ÄNDRA DESSA VÄRDEN!
// ============================================
var SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/DIN_SPREADSHEET_ID_HÄR/edit';

// Startdatum för data (YYYY-MM-DD format)
var START_DATE = '2025-01-08';

// Sheet-namn (måste matcha TrueProfit-inställningen)
var SHEET_NAME = 'Ad Spend';

// ============================================
// HUVUDFUNKTION - Google Ads kör denna automatiskt
// ============================================
function main() {
  Logger.log('Startar Google Ads export till Sheets...');

  // Öppna spreadsheet
  var spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  } catch (e) {
    Logger.log('FEL: Kunde inte öppna spreadsheet. Kontrollera URL:en.');
    Logger.log('URL: ' + SPREADSHEET_URL);
    throw e;
  }

  // Hämta eller skapa sheet
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    Logger.log('Skapade nytt sheet: ' + SHEET_NAME);
  }

  // ============================================
  // RENSA HELA SHEETET FÖRST! (förhindrar duplikater)
  // ============================================
  sheet.clear();
  Logger.log('Rensade hela sheetet');

  // Lägg till header
  sheet.appendRow([
    'Date', 'Campaign ID', 'Campaign Name', 'Spend',
    'Impressions', 'Clicks', 'Conversions', 'Conversion Value', 'Currency'
  ]);

  // Beräkna datumintervall - från START_DATE till idag
  var today = new Date();
  var startDate = new Date(START_DATE);

  Logger.log('Hämtar data från ' + START_DATE + ' till ' + formatDateForQuery(today));

  // Hämta kampanjdata från Google Ads
  var report = AdsApp.report(
    'SELECT ' +
      'segments.date, ' +
      'campaign.id, ' +
      'campaign.name, ' +
      'metrics.cost_micros, ' +
      'metrics.impressions, ' +
      'metrics.clicks, ' +
      'metrics.conversions, ' +
      'metrics.conversions_value ' +
    'FROM campaign ' +
    'WHERE segments.date BETWEEN "' + START_DATE + '" AND "' + formatDateForQuery(today) + '" ' +
    'ORDER BY segments.date DESC'
  );

  var rows = report.rows();
  var data = [];
  var currency = AdsApp.currentAccount().getCurrencyCode();

  while (rows.hasNext()) {
    var row = rows.next();

    // Konvertera cost från micros (1/1,000,000) till faktisk valuta
    var costMicros = row['metrics.cost_micros'] || 0;
    var cost = costMicros / 1000000;

    data.push([
      row['segments.date'],                           // A: Date
      row['campaign.id'],                             // B: Campaign ID
      row['campaign.name'],                           // C: Campaign Name
      cost,                                           // D: Spend
      parseInt(row['metrics.impressions']) || 0,      // E: Impressions
      parseInt(row['metrics.clicks']) || 0,           // F: Clicks
      parseFloat(row['metrics.conversions']) || 0,    // G: Conversions
      parseFloat(row['metrics.conversions_value']) || 0, // H: Conversion Value
      currency                                        // I: Currency
    ]);
  }

  Logger.log('Hämtade ' + data.length + ' rader från Google Ads');

  if (data.length === 0) {
    Logger.log('Ingen data att exportera för perioden.');
    return;
  }

  // Skriv all data på en gång (snabbare)
  if (data.length > 0) {
    sheet.getRange(2, 1, data.length, 9).setValues(data);
    Logger.log('Skrev ' + data.length + ' rader till sheet');
  }

  // Formatera kolumner
  formatSheet(sheet);

  Logger.log('Export klar! ' + data.length + ' rader exporterade.');
}

/**
 * Formaterar datum för Google Ads query
 */
function formatDateForQuery(date) {
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}

/**
 * Formaterar sheetet för bättre läsbarhet
 */
function formatSheet(sheet) {
  // Formatera Spend-kolumnen som valuta
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 4, lastRow - 1, 1).setNumberFormat('#,##0.00');
    sheet.getRange(2, 8, lastRow - 1, 1).setNumberFormat('#,##0.00');
  }

  // Auto-anpassa kolumnbredder
  sheet.autoResizeColumns(1, 9);
}

/**
 * Test-funktion för att verifiera konfigurationen
 */
function testConfiguration() {
  Logger.log('=== TESTAR KONFIGURATION ===');

  // Testa spreadsheet-åtkomst
  try {
    var spreadsheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
    Logger.log('✓ Spreadsheet hittades: ' + spreadsheet.getName());
  } catch (e) {
    Logger.log('✗ Kunde inte öppna spreadsheet: ' + e.message);
    return;
  }

  // Testa Google Ads-åtkomst
  try {
    var account = AdsApp.currentAccount();
    Logger.log('✓ Google Ads-konto: ' + account.getName());
    Logger.log('✓ Valuta: ' + account.getCurrencyCode());
  } catch (e) {
    Logger.log('✗ Kunde inte komma åt Google Ads: ' + e.message);
    return;
  }

  Logger.log('=== KONFIGURATION OK! ===');
  Logger.log('Du kan nu köra exportGoogleAdsToSheets()');
}
