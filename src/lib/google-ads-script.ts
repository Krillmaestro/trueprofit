/**
 * Google Ads Script push integration
 *
 * The user pastes a generated script into Google Ads (Tools → Scripts) and
 * schedules it hourly. The script POSTs campaign-level daily spend and
 * conversion value straight to /api/ads/google/ingest. No Sheets, no OAuth,
 * no developer token – nothing that can expire.
 *
 * Accounts using this integration have platformAccountId `script:<id>` and
 * hold the encrypted ingest secret in accessTokenEncrypted. They must be
 * skipped by the pull-based sync endpoints (their data is pushed to us).
 */

export const SCRIPT_ACCOUNT_PREFIX = 'script:'

// Days re-sent on every run. Google Ads keeps attributing conversions to
// earlier click dates, so the window must be wide enough to catch late sales.
export const SCRIPT_DAYS_BACK = 90

export function isScriptAccount(platformAccountId: string): boolean {
  return platformAccountId.startsWith(SCRIPT_ACCOUNT_PREFIX)
}

export function buildGoogleAdsScript(ingestUrl: string, ingestKey: string): string {
  return `/**
 * TrueProfit – Google Ads-export
 *
 * 1. Google Ads → Verktyg → Massåtgärder → Skript → "+" → Nytt skript
 * 2. Klistra in hela koden, klicka "Auktorisera" och sedan "Kör"
 * 3. Sätt Frekvens till "Varje timme"
 *
 * Skriptet skickar spend, klick, konverteringar och konverteringsvärde per
 * kampanj och dag (senaste ${SCRIPT_DAYS_BACK} dagarna) till TrueProfit vid varje körning.
 * Fungerar både i ett annonskonto och i ett förvaltarkonto (MCC) – i ett MCC
 * skickas alla underkonton tillsammans.
 */

var TRUEPROFIT_URL = '${ingestUrl}';
var TRUEPROFIT_KEY = '${ingestKey}';
var DAYS_BACK = ${SCRIPT_DAYS_BACK};

function main() {
  var root = AdsApp.currentAccount();
  var tz = root.getTimeZone();
  var now = new Date();
  var dateTo = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var dateFrom = Utilities.formatDate(new Date(now.getTime() - (DAYS_BACK - 1) * 86400000), tz, 'yyyy-MM-dd');

  var rows = [];
  var currency = null;

  if (typeof AdsManagerApp !== 'undefined') {
    // Förvaltarkonto: hämta från alla underkonton
    var accounts = AdsManagerApp.accounts().get();
    while (accounts.hasNext()) {
      var child = accounts.next();
      try {
        AdsManagerApp.select(child);
        var n = collect(dateFrom, dateTo, rows);
        if (n > 0 && !currency) currency = child.getCurrencyCode();
        Logger.log(child.getName() + ' (' + child.getCustomerId() + '): ' + n + ' rader');
      } catch (e) {
        Logger.log('Hoppade över ' + child.getCustomerId() + ': ' + e.message);
      }
    }
  } else {
    collect(dateFrom, dateTo, rows);
  }

  var response = UrlFetchApp.fetch(TRUEPROFIT_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + TRUEPROFIT_KEY },
    payload: JSON.stringify({
      customerId: root.getCustomerId(),
      accountName: root.getName(),
      currency: currency || root.getCurrencyCode(),
      dateFrom: dateFrom,
      dateTo: dateTo,
      rows: rows
    }),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code !== 200) {
    throw new Error('TrueProfit svarade ' + code + ': ' + body);
  }
  Logger.log('Skickade ' + rows.length + ' rader (' + dateFrom + ' – ' + dateTo + '). Svar: ' + body);
}

function collect(dateFrom, dateTo, rows) {
  var query =
    'SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros, ' +
    'metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value ' +
    'FROM campaign WHERE segments.date BETWEEN "' + dateFrom + '" AND "' + dateTo + '"';

  var count = 0;
  var result = AdsApp.search(query);
  while (result.hasNext()) {
    var r = result.next();
    rows.push({
      date: r.segments.date,
      campaignId: String(r.campaign.id),
      campaignName: r.campaign.name,
      cost: Number(r.metrics.costMicros || 0) / 1000000,
      impressions: Number(r.metrics.impressions || 0),
      clicks: Number(r.metrics.clicks || 0),
      conversions: Number(r.metrics.conversions || 0),
      conversionValue: Number(r.metrics.conversionsValue || 0)
    });
    count++;
  }
  return count;
}
`
}
