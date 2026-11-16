# RFP diagnostic release and containment (NIN-245)

Scope: Stellina Admin, AP-200, CFG-SEC-003. This change replaces the three raw
error console calls with fixed RFP events, bounded HTTP status and fixed error
classification through the existing browser adapter. It introduces no new
configuration values or API contracts. Existing safe error UI is preserved.

Before release, run the deterministic repository suite and the targeted
`frontend/test/rfp-diagnostics.test.js` checks. The targeted tests exercise the
real authenticated clients with synthetic credentials, all three pages, RFP
create/update, each load dependency, HTTP 401/403/500 and network failures,
throwing console sinks, and a diagnostics-disabled forward correction.

Release first to staging using the existing staging build configuration. With
synthetic accounts/data, exercise RFP save, hotel invitations and response
comparison failures. Inspect browser output locally: the `stellina.rfp.*`
events must contain only the structured envelope, fixed classification and
optional numeric status. Confirm loading clears and existing safe error UI
remains. Do not copy request objects, browser network exports or real credentials
into release evidence. Browser output is local; it is not central monitoring.

Promote the same reviewed correction through the normal production release
process after staging checks pass. The release owner should watch existing
request failure signals and safe user reports for save/load regressions, and
repeat synthetic browser probes after promotion. Do not add telemetry carrying
raw error objects to monitor this change.

If diagnostics cause regressions or privacy checks fail, stop promotion and
prepare a forward correction removing the three `logRfpFailure` calls (or make
that helper a no-op). Re-run the targeted failure/UI checks and release through
the normal process. The containment tests model this correction in memory;
they do not add a runtime switch or change production. Keep request behavior,
safe user-facing errors and loading cleanup intact. Never revert to raw-error
logging, including when restoring an older application release.

Deployment and production verification are follow-up release activities; this
implementation does not perform them. No material Engineering Prep deviations:
the shared browser adapter, small RFP diagnostic boundary, tests and this release
note support the three requested page fixes within the application repository.
