# TrueProfit integration review — 2026-09-29

## Status

Code changes are prepared against main at 8468481. Production login reached Google's account chooser, but account selection and the return to TrueProfit have not been tested. Railway CLI credentials are unauthorized; the browser also requires Railway login. No production credentials, user records, provider permissions, campaigns or deployments were changed. The user's exact login error is still needed to establish the production root cause.

## Repairs

- Provision the personal team and settings after successful authentication, when the Google user has actually been persisted. Lock the user row so simultaneous setup requests do not create duplicate personal teams. Reuse the same helper for integration onboarding and account repair.
- Keep production iframe session-cookie behavior, but allow local HTTP development cookies. Explain common login failures and offer a separate tab for Google login from an iframe. Never automatically link accounts by email or reset a password to bypass login.
- Disable the public password-setup endpoint, which used a source-visible shared secret. Deployment of this fix is important; changing the source alone does not secure the running service. Review production access logs for misuse once Railway access is restored. No password changes were made.
- Store hashed, expiring, single-use integration OAuth state in the existing verification_tokens table. Validate user, provider and Shopify domain; consume atomically across replicas. No database schema change is required. OAuth flows begun before deployment must be restarted.
- Google Ads: use API v25; decode every SearchStream response chunk; preserve a previous refresh token when reconnecting; report zero/partial account discovery honestly. Add a direct connection choice alongside Sheets. An optional GOOGLE_ADS_LOGIN_CUSTOMER_ID supports one configured manager and discovery of its advertiser accounts.
- Distinguish numeric Google Ads IDs from sheets: IDs during sync. Share one sync implementation between individual, unified and historical sync, use the correct OAuth client's refresh credentials, refresh proactively, use bounded transactions and non-null upsert keys, and report provider failures rather than unconditional success. Previously stored legacy-null rows are cleaned only for the specific rows being refreshed.
- Meta: fetch all account, campaign and insight pages using cursors. Request analytics permissions without ads_management. Add a missing-configuration error and indicate expired access.
- Shopify: consistently use API 2026-07, validate shop domains before sending credentials, bind callbacks to the initiating shop, use a timing-safe HMAC comparison and prevent overwriting another team's store connection. Send the previously ignored updated_at_min filter and preserve the starting sync watermark. Do not advance it when order processing fails.
- Permit signed Shopify webhooks through middleware; look up the full myshopify.com domain; distinguish successive updates to an order; allow failed webhook deliveries to retry.
- Reconnecting an existing Google Sheet retains its account ID and imported history. Surface sync failures and incomplete setup in the UI.
- Retry transient rate limits/server failures for provider reads with a timeout and bounded attempts. OAuth exchanges and Shopify writes are not retried automatically.
- Check team/store membership before returning background job status. Validate historical date ranges and report partial failures. Shopify order imports use the update timestamp for incremental sync, preserve the starting watermark, and do not advance it on product-only imports or failed transaction reads.
- Update Next.js to 16.3.6 and NextAuth to 4.24.15, use patched Auth.js core 0.41.3 for its optional peer, update vulnerable transitive dependencies, and align local/CI/Railway configuration on Node 22. Vitest 5 requires Node >=22.12.
- Remove --accept-data-loss from Railway's pre-deploy schema push. A potentially destructive schema change now blocks instead of being silently accepted.

## Deployment configuration to verify

Do not rotate ENCRYPTION_KEY during this repair: existing stored tokens depend on it. Configure missing values only after inspecting the deployed service.

| Integration | Required configuration |
| --- | --- |
| Core | DATABASE_URL, persistent NEXTAUTH_SECRET, persistent 64-hex-character ENCRYPTION_KEY, NEXTAUTH_URL=https://trueprofit-production.up.railway.app |
| Google login / Sheets | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET; enabled Sheets API for Sheets imports |
| Google Ads | GOOGLE_ADS_DEVELOPER_TOKEN with appropriate production access; optionally GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET as a pair, otherwise login credentials are used |
| Google manager | Optional GOOGLE_ADS_LOGIN_CUSTOMER_ID; omit for direct advertiser access. The current configuration supports one manager context per deployment. |
| Meta | FACEBOOK_APP_ID, FACEBOOK_APP_SECRET; account roles and appropriate app access for ads_read/business_management |
| Shopify | SHOPIFY_API_KEY, SHOPIFY_API_SECRET; app installation permissions for the target store |

Register these exact HTTPS callback URLs in the corresponding provider console:

- Google login: https://trueprofit-production.up.railway.app/api/auth/callback/google
- Google Ads: https://trueprofit-production.up.railway.app/api/ads/google/oauth
- Google Sheets: https://trueprofit-production.up.railway.app/api/ads/google-sheets/oauth
- Meta: https://trueprofit-production.up.railway.app/api/ads/facebook/oauth
- Shopify: https://trueprofit-production.up.railway.app/api/shopify/oauth

Check Google consent-screen publishing/test-user settings for the intended account. Login and Ads/Sheets have separate scopes and callbacks. An OAuthAccountNotLinked error requires the existing sign-in method or an authenticated account-linking flow; do not enable unverified automatic linking.

## Validation

Run npm ci, npm run test:integrations, npx tsc --noEmit and npm run build. The integration suite uses simulated provider responses and mocked database operations; it does not replace a live provider or PostgreSQL integration test. A GitHub workflow runs these checks under the project's declared Node 22 runtime. npm audit reports zero known vulnerabilities for this lockfile on 2026-09-29; this is not a complete security audit.

The pre-existing calculation tests are repaired to call the actual arithmetic helpers, use Prisma Decimal fixtures and historical COGS inputs, and are included in both the test runner and TypeScript checking. The suite currently has 75 passing tests in seven files. These test selected arithmetic and integration regressions, not the correctness of every dashboard total. TypeScript checking and the local production build with `npm run build -- --webpack` pass. The default Turbopack build cannot bind its worker port in the local sandbox; CI exercises the default build. Build-time missing-environment warnings refer to the isolated clone without production secrets, not verified Railway configuration. An unused helper exported from an API route was removed because Next.js rejects non-route exports.

## Required live checks and remaining limits

1. Log into Railway and inspect runtime logs and environment configuration without exposing secret values. Complete Google login with the user's intended account and capture the exact callback error if it still fails.
2. Deploy the reviewed change, then verify existing-user and first-user sign-in, team creation, refresh and sign-out. Check email/password login with the user's existing method; do not invent or reset credentials.
3. Connect the intended Shopify, Meta and Google accounts, approving provider permissions as needed. Verify the chosen shop/customer/account identifiers and currencies.
4. Sync a fixed date range twice; verify counts and totals stay stable. Compare Shopify orders and refunds and provider spend for the same dates/timezones. Test token renewal, canceled consent, reconnect, and a second provider response page.
5. Shopify webhook subscriptions must be configured in the Shopify app; this patch repairs reception but does not automatically install subscriptions. Confirm delivery and HMAC validation with a real event. Access to orders older than 60 days requires Shopify's additional approved read_all_orders scope, which is not requested automatically here.
6. Shopify historical/background jobs and webhook deduplication still use in-process tracking. For reliable recovery across deployments and multiple replicas, migrate these to a durable worker/job store before promising unattended large imports. Concurrency against real PostgreSQL has not been exercised in this review.
7. Do not import the same Google ad account through both direct Ads and Sheets unless duplicate source totals are intentionally handled. Mixed-currency totals and differences in provider attribution windows require a separate reconciliation decision.
8. Financial reconciliation remains a release gate: dashboard and P&L calculations duplicate logic, currently derive sales by subtracting discounts from Shopify subtotal again, and do not consistently deduct refunds from final profit. Refund tax and restocked-item costs are not sufficiently represented for precise reporting. Reconcile against actual shop data and define tax-inclusive presentation before relying on the reported profit. Legacy bulk/historical Shopify paths also need consolidation with the full order/transaction importer; bulk imports currently select only the first active store.
9. The optional Auth.js core override removes a vulnerable nested peer pulled by NextAuth v4. Runtime login remains on patched NextAuth v4, with the existing Prisma adapter; test real login after deployment. Do not rotate production keys as part of this dependency update.

## Provider references

- [NextAuth v4 sign-in events](https://next-auth.js.org/configuration/events)
- [Google Ads REST SearchStream response format](https://developers.google.com/google-ads/api/rest/common/search)
- [Google Ads API version lifecycle](https://developers.google.com/google-ads/api/docs/sunset-dates)
- [Shopify API versioning](https://shopify.dev/docs/api/usage/versioning)
- [Shopify standalone OAuth validation](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps)
