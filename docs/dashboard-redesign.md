# Dashboard redesign — October 2026

Implemented from the supplied UI references and confirmed choices:

- Seven navigation icons, existing wolf logo, restrained navy/cyan panels.
- Portfolio Value switches between stock market value and recorded cumulative P/L. History starts with actual observations from this release; it is not reconstructed. One observation per Bangkok day is updated at most every 15 minutes while the app is open, online and no form is being edited. Two days are needed for a line.
- Total Assets includes stock portfolios (including their cash), other assets and trading capital. The previous-month comparison identifies the actual observation date when available.
- Today’s Change and available stock cash appear side by side at 70:30 on desktop. Cash includes only recorded stock portfolio cash; deposits and other assets remain in Total Assets and are managed through Tool. Trading capital is not described as withdrawable cash because that balance is not separately recorded.
- Portfolio carousel supports scrolling, ordering and custom JPEG/PNG/WebP covers saved with the account's Cloud data and JSON backup. Cards show total value, daily holding P/L and cumulative P/L including realized results and net dividends.
- Today's Change aggregates held stocks by ticker. Monetary-impact and percentage modes share the same daily headline; missing daily references are excluded and counted. Regular-session quotes exclude extended-hours streaming ticks.
- Price Alerts migrate existing stock targets and persist triggered status. Notifications operate while the app is open. Editing, dismissing, rearming and deleting do not place trades.
- Dashboard transaction preview renders five records. Full history supports search, type, stock/trading portfolio, Bangkok date range and chronological sort, twenty rows per page. Amounts follow the global USD/THB display switch.

## Pending architectural decision

The existing Cloud document contains the complete ledger used to calculate cost basis and lifetime results. The preview renders only five records, but this release does **not** implement a server-side five-record query. Splitting history into paginated Cloud collections requires a separate data migration and calculation change; the clarification remains open. No ledger records are removed to achieve the preview limit.

## Future idea

Navi is the user's proposed future companion. This release retains the existing logo and does not add an AI service or send financial records to an AI provider.

## Verification

Automated tests cover ranking, aggregation, missing quotes, fractional trades, Cloud conflicts, history dates, persistent alerts, backups and existing ledger behavior. The isolated localhost preview blocks Firebase and network connections and uses synthetic data, including seven synthetic history points for chart QA. Its sample data is never imported into the production account.

## October 4 follow-up

- Stock Trade Journal moves from Risk to Growth / Quarter. Risk retains its own trading capital history. Growth uses a compact two-column panel layout and full-width quarterly reports; the collapsed sidebar no longer expands over content on hover.
- After quarter end, the first eligible online opening records the latest completed quarter without a day limit. The snapshot is accepted for quarterly comparisons, with the actual valuation timestamp retained. Subsequent openings do not overwrite it. A long absence does not fabricate multiple past quarters from one current balance.
- Existing late Q3/2026 and the latest completed-quarter reports migrate on successful Cloud connection. Their original amounts, holdings, exchange rate and valuation timestamps are preserved. Comparisons use actual capture timestamps for cash flows.
