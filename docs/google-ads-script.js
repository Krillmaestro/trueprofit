/**
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
 *
 * Vid problem: Kontrollera att du har rättigheter till sheetet
 */

// ╔════════════════════════════════════════════════════════════╗
// ║  STEG 1: Klistra in din Google Sheet URL här              ║
// ╚════════════════════════════════════════════════════════════╝

var SPREADSHEET_URL = 'KLISTRA_IN_DIN_SHEET_URL_HÄR';

// Exempel: 'https://docs.google.com/spreadsheets/d/1ABC123xyz/edit'


// ╔════════════════════════════════════════════════════════════╗
// ║  INSTÄLLNINGAR (valfritt att ändra)                       ║
// ╚════════════════════════════════════════════════════════════╝

// Antal dagar bakåt att synka (standard: 30)
var DAYS_TO_SYNC = 30;

// Namn på fliken i Google Sheet (ändra INTE detta)
var SHEET_NAME = 'Ad Spend';


// ╔════════════════════════════════════════════════════════════╗
// ║  HUVUDSCRIPT - Rör inte koden nedan                       ║
// ╚════════════════════════════════════════════════════════════╝

function main() {
  // Validera URL
  if (SPREADSHEET_URL === 'KLISTRA_IN_DIN_SHEET_URL_HÄR' || !SPREADSHEET_URL.includes('docs.google.com')) {
    Logger.log('❌ FEL: Du måste ange din Google Sheet URL i SPREADSHEET_URL variabeln.');
    Logger.log('   Öppna ditt Google Sheet, kopiera URL:en från adressfältet och klistra in den.');
    return;
  }

  try {
    var spreadsheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
    Logger.log('✓ Ansluten till: ' + spreadsheet.getName());
  } catch (e) {
    Logger.log('❌ FEL: Kunde inte öppna spreadsheet.');
    Logger.log('   Kontrollera att URL:en är korrekt och att du har rättigheter.');
    Logger.log('   Fel: ' + e.message);
    return;
  }

  // Hitta eller skapa "Ad Spend" fliken
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log('→ Skapar ny flik: ' + SHEET_NAME);
    sheet = spreadsheet.insertSheet(SHEET_NAME);

    // Skapa header-rad
    var headers = ['Date', 'Campaign ID', 'Campaign Name', 'Spend', 'Impressions', 'Clicks', 'Conversions', 'Conversion Value', 'Currency'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.getRange(1, 1, 1, headers.length).setBackground('#f3f4f6');
    sheet.setFrozenRows(1);

    // Formatera kolumner
    sheet.setColumnWidth(1, 100);  // Date
    sheet.setColumnWidth(2, 120);  // Campaign ID
    sheet.setColumnWidth(3, 250);  // Campaign Name
    sheet.setColumnWidth(4, 100);  // Spend
    sheet.setColumnWidth(5, 100);  // Impressions
    sheet.setColumnWidth(6, 80);   // Clicks
    sheet.setColumnWidth(7, 100);  // Conversions
    sheet.setColumnWidth(8, 120);  // Conv Value
    sheet.setColumnWidth(9, 80);   // Currency
  }

  // Beräkna datumintervall
  var today = new Date();
  var startDate = new Date(today.getTime() - (DAYS_TO_SYNC * 24 * 60 * 60 * 1000));

  Logger.log('→ Hämtar data från ' + formatDateForLog(startDate) + ' till ' + formatDateForLog(today));

  // Hämta kampanjdata från Google Ads
  var query = 'SELECT ' +
    'segments.date, ' +
    'campaign.id, ' +
    'campaign.name, ' +
    'metrics.cost_micros, ' +
    'metrics.impressions, ' +
    'metrics.clicks, ' +
    'metrics.conversions, ' +
    'metrics.conversions_value ' +
    'FROM campaign ' +
    'WHERE segments.date >= "' + formatDateForQuery(startDate) + '" ' +
    'AND segments.date <= "' + formatDateForQuery(today) + '" ' +
    'ORDER BY segments.date DESC, campaign.name ASC';

  var report;
  try {
    report = AdsApp.report(query);
  } catch (e) {
    Logger.log('❌ FEL: Kunde inte hämta data från Google Ads.');
    Logger.log('   Fel: ' + e.message);
    return;
  }

  var rows = report.rows();
  var data = [];
  var currency = AdsApp.currentAccount().getCurrencyCode();
  var accountName = AdsApp.currentAccount().getName();

  Logger.log('→ Kontovaluta: ' + currency);

  while (rows.hasNext()) {
    var row = rows.next();

    // Konvertera cost_micros till vanlig valuta
    var costMicros = parseFloat(row['metrics.cost_micros']) || 0;
    var spend = costMicros / 1000000;

    // Formatera datum till YYYY-MM-DD
    var dateStr = row['segments.date'];

    data.push([
      dateStr,
      row['campaign.id'],
      row['campaign.name'],
      spend,
      parseInt(row['metrics.impressions']) || 0,
      parseInt(row['metrics.clicks']) || 0,
      parseFloat(row['metrics.conversions']) || 0,
      parseFloat(row['metrics.conversions_value']) || 0,
      currency
    ]);
  }

  if (data.length === 0) {
    Logger.log('⚠ Ingen data hittades för vald period.');
    Logger.log('  Tips: Kontrollera att du har kampanjer som körts de senaste ' + DAYS_TO_SYNC + ' dagarna.');
    return;
  }

  // Ta bort gammal data för samma datumintervall
  removeOldData(sheet, startDate, today);

  // Skriv ny data
  var lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.getRange(lastRow + 1, 1, data.length, 9).setValues(data);

  // Formatera spend-kolumnen som tal med 2 decimaler
  var spendRange = sheet.getRange(2, 4, sheet.getLastRow() - 1, 1);
  spendRange.setNumberFormat('#,##0.00');

  // Sammanfattning
  var totalSpend = data.reduce(function(sum, row) { return sum + row[3]; }, 0);
  var totalClicks = data.reduce(function(sum, row) { return sum + row[5]; }, 0);
  var totalConversions = data.reduce(function(sum, row) { return sum + row[6]; }, 0);

  Logger.log('');
  Logger.log('═══════════════════════════════════════');
  Logger.log('✓ EXPORT KLAR!');
  Logger.log('═══════════════════════════════════════');
  Logger.log('  Konto: ' + accountName);
  Logger.log('  Rader exporterade: ' + data.length);
  Logger.log('  Total spend: ' + totalSpend.toFixed(2) + ' ' + currency);
  Logger.log('  Total klick: ' + totalClicks);
  Logger.log('  Total konverteringar: ' + totalConversions.toFixed(1));
  Logger.log('');
  Logger.log('  Sheet: ' + spreadsheet.getName());
  Logger.log('═══════════════════════════════════════');
}

/**
 * Tar bort befintlig data inom datumintervallet
 * (för att undvika dubbletter vid uppdatering)
 */
function removeOldData(sheet, startDate, endDate) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return; // Bara header

  var startStr = formatDateForQuery(startDate);
  var endStr = formatDateForQuery(endDate);
  var rowsToDelete = [];

  // Hitta rader att ta bort (bakifrån)
  for (var i = data.length - 1; i > 0; i--) {
    var rowDate = data[i][0];
    if (typeof rowDate === 'string' && rowDate >= startStr && rowDate <= endStr) {
      rowsToDelete.push(i + 1);
    }
  }

  // Ta bort raderna
  for (var j = 0; j < rowsToDelete.length; j++) {
    sheet.deleteRow(rowsToDelete[j]);
  }

  if (rowsToDelete.length > 0) {
    Logger.log('→ Tog bort ' + rowsToDelete.length + ' gamla rader');
  }
}

/**
 * Formaterar datum för GAQL-query (YYYY-MM-DD)
 */
function formatDateForQuery(date) {
  var year = date.getFullYear();
  var month = ('0' + (date.getMonth() + 1)).slice(-2);
  var day = ('0' + date.getDate()).slice(-2);
  return year + '-' + month + '-' + day;
}

/**
 * Formaterar datum för loggning
 */
function formatDateForLog(date) {
  return date.toISOString().split('T')[0];
}


// ╔════════════════════════════════════════════════════════════╗
// ║  SCHEMALÄGGNING                                            ║
// ╠════════════════════════════════════════════════════════════╣
// ║  Efter att du testat scriptet, schemalägg det:            ║
// ║  1. Klicka på klock-ikonen (bredvid "Kör")                ║
// ║  2. Välj frekvens: "Timvis"                               ║
// ║  3. Klicka "Spara"                                        ║
// ║                                                            ║
// ║  Scriptet kommer nu köras automatiskt varje timme!        ║
// ╚════════════════════════════════════════════════════════════╝
