# BandhanTak Growth Saathi — MKT-2B Meta Ads Execution Plan

**Document type:** Claude Code implementation handoff  
**Phase:** MKT-2B — Meta Ads paused creation and approval-bound activation  
**Depends on:** MKT-1 + MKT-2A Google Search execution  
**Rule:** Existing Google execution ko dobara nahi banana. Pehle uske identified carry-forward gaps close karne hain, phir same safe foundation par Meta add karna hai.  
**Last updated:** 12 September 2026

---

## 1. Seedha decision

MKT-2A ka Google Search execution foundation code mein ban chuka hai aur fake provider/database tests se verify hua hai. Agla phase **MKT-2B** hai:

1. Current MKT-2A ke real-world blockers/honesty gaps close karna.
2. Meta token ki real write permission and business assets verify karna.
3. Approved static image ke saath Meta campaign hierarchy ko PAUSED banana.
4. Har step ko checkpoint/reconcile karna, duplicate objects na banana.
5. Separate activation approval ke baad ads/ad sets ko pehle aur campaign ko sabse last mein activate karna.
6. Existing Marketing AI task-detail screen mein hi sab dikhana.

Is phase mein AI video/Reel rendering, organic publishing, budget optimization, website publishing ya naya dashboard nahi banana.

### Is handoff ka implementation mode — credentials baad mein

Google/Meta ke real tokens, account IDs ya production access **is code phase ko start/finish karne ki condition nahi hain**.

- Claude ko tokens ka wait nahi karna hai aur tokens maangkar rukna nahi hai.
- Provider interfaces, complete implementation, fake providers, request-shape tests, failure simulations, UI and configuration checks abhi banenge.
- Real credential absent ho to connection/deployment safely `NOT_CONNECTED` ya `BLOCKED_CONFIG` dikhaye; app crash ya fake success nahi dikhaye.
- Code mein dummy token, test secret, placeholder production account ID ya bypass add nahi hoga.
- External writes sirf valid connection + exact approval par possible rahenge.
- Owner baad mein encrypted connection form/Railway secrets mein keys dalega aur ek combined real smoke checklist run karega.
- Real account smoke pending rehna **code-complete ko block nahi karega**, lekin “real-provider verified” status tab tak claim nahi hoga.

---

## 2. Current implementation review

### Jo sahi bana hai aur preserve karna hai

- `CampaignDeployment` and `MarketingExecutionEvent` durable state/audit foundation.
- Separate `CREATE_PAUSED_CAMPAIGNS` and `ACTIVATE_CAMPAIGNS` approvals.
- One deployment per draft/platform, stable marker and idempotency key.
- Conditional lease/worker claim and recovery cron.
- Google validate-only followed by one atomic PAUSED create.
- Provider writes on `retries: 0`.
- Unknown write outcome is reconciled before retry.
- Google activation changes only campaign status and uses a fresh approval.
- Existing admin console/task detail is reused.
- Meta tools correctly remain non-executable instead of showing a fake approval.
- Non-admin routes are protected and cron refuses to run without `CRON_SECRET`.

### Koi hidden rewrite nahi

MKT-2B ko `deploymentService`, `deploymentWorker`, approval route, task APIs and UI ko extend/refactor karna hai. Google behavior and its existing tests must remain green. Provider-specific code ko shared core se cleanly dispatch karna hai; Google logic ko Meta conditions se bharna nahi hai.

---

## 3. Kamiyan/prerequisites jo pehle close honi chahiye

Ye MKT-2A ko reject nahi karte, lekin production ya Meta execution se pehle inka solution zaroori hai.

### Gap A — Google ka real smoke test abhi nahi hua

Current evidence fake Google provider se hai. Real Google Ads API ne payload accept kiya, marker searchable hai aur read-back shape match karta hai—ye abhi prove nahi hua.

**Required action:**

- MKT-0 Google OAuth/account setup complete hone par Google test account mein exactly one paused-only smoke run.
- Ads UI mein campaign PAUSED, budget/ad groups/keywords/RSA visible hon.
- Same deployment ko sync/retry karke create count one prove ho.
- Production activation is phase ke automated acceptance ka part nahi hai.
- Smoke unavailable ho to code work continue ho sakta hai, lekin status “provider-mock verified; real smoke pending” hi rahe.
- Claude is gap par rukega nahi; fake provider and request-contract tests complete karke real smoke ko owner checklist mein chhodega.

### Gap B — Google Ads onboarding text/current requirement changed

Current code/UI `GOOGLE_ADS_DEVELOPER_TOKEN` ko mandatory samajhkar Google Ads → API Center batata hai. Google ke current September 2026 flow mein API access level Google Cloud project ke Google Ads API Overview par manage hota hai; legacy developer token header compatible/optional ho sakta hai.

**Required action before Meta work:**

- Current official Google Ads onboarding docs verify karo.
- `GoogleAdsAuth.developerToken` ko optional/legacy-compatible banao if current API permits.
- `developer-token` header sirf value present ho tab bhejo.
- Missing legacy token ko connection failure mat banao when Cloud project access works.
- Connection UI and `.env.example` ko Google Cloud API access level language par update karo.
- Test access ko production-ready na dikhao; test-only/Explorer/Basic/Standard jo provider returns/docs define karte hain wahi show karo.
- API version bump sirf compatibility tests ke baad; env override preserve karo.

### Gap C — `LIVE` delivery ka proof nahi hai

Current Google flow `ENABLED` read-back par deployment `LIVE` likhta hai. `ENABLED` ka matlab campaign configured active hai; policy review, eligibility, billing or zero traffic ke karan actual delivery alag ho sakti hai.

**Required action:**

- Internal `LIVE` compatibility rakh sakte ho, but UI label “Activated — spend may occur” ho.
- Provider `configuredStatus`, `effectiveStatus`, `serving/deliveryStatus` and policy summary separately store/show karo.
- “Delivering” tabhi bolo jab provider actual serving/delivery signal de.
- Ye truthfulness Google and Meta dono par apply ho.

### Gap D — Meta approval payloads abhi Google-shaped hain

Current typed payloads `platform: META` allow karte hain, lekin fields Google-specific hain: `conversionAction`, `biddingStrategy`, `verifiedBudgetMicros`, Google external counts. Meta ko is schema mein force nahi karna.

**Required action:**

- Platform-discriminated payload schemas banao:
  - `GoogleCreatePausedPayloadSchema` — backward-compatible current shape.
  - `GoogleActivatePayloadSchema` — backward-compatible current shape.
  - `MetaCreatePausedPayloadSchema`.
  - `MetaActivatePayloadSchema`.
- Parser `action + platform` se exact schema choose kare.
- Existing pending Google cards and hashes valid rahen.

### Gap E — Meta token test write permission verify nahi karta

Current token credential test `/me?fields=id,name` only calls identity. Comment permission check ka claim karta hai, but response mein permissions/scopes inspect nahi hote. `META_ADS` provider metadata only `ads_read` lists.

**Required action:**

- Meta write readiness `ads_management` explicitly verify kare.
- System user has advertiser/manage access to exact ad account, Page and Instagram business account verify karo.
- App/access-tier limitation ko permission se alag error dikhao.
- Connection UI required read versus write permissions clearly show kare.
- Permission missing ho to `BLOCKED_CONFIG`; create approval mat banao.

### Gap F — approved creative abhi actual image nahi hai

MKT-1 `CreativeAsset` rows briefs/concepts store karta hai. `APPROVE_PACKAGE` se brief approved hota hai, lekin `storageRef` blank ho sakta hai. Meta ko actual public image/image hash chahiye.

**Required action:**

- Brief approval aur actual media approval alag rakho.
- Admin can attach one real static creative inside existing task detail.
- Production media durable object storage mein ho, local container disk par nahi.
- Valid approved media ke bina Meta deployment `BLOCKED_CREATIVE` rahe.

### Gap G — Meta package provider-executable nahi hai

Current Meta draft has human-readable location/interests/exclusions/placements, but provider IDs and objective delivery fields nahi hain. Ad-set budget sum also separately validate nahi hota.

**Required action:**

- Human-readable draft ko direct API payload mat banao.
- Deterministic Meta mapper + provider resolution layer banao.
- Unresolved/ambiguous location or interest ko silently drop mat karo.
- Objective, optimization goal, billing event, destination type and promoted object ka explicit supported matrix banao.
- Unsupported package ko revise karne ka clear reason do.

### Gap H — working tree checkpoint nahi hai

MKT-1 and MKT-2A changes uncommitted hain, plus unrelated/untracked files exist.

**Required action:**

- Implementation se pehle exact `git diff`/untracked inventory report karo.
- User-owned image/other changes ko touch/delete na karo.
- Temporary scripts ko automatically delete na karo.
- A stable checkpoint commit/branch only if user authorizes it; otherwise existing changes preserve karke narrow edits karo.
- MKT-2B end report mein new files versus pre-existing uncommitted files clearly separate karo.

---

## 4. MKT-2B exact outcome

Complete hone par Growth Saathi:

1. Approved Meta campaign draft ko read karega.
2. Meta connection, token scopes, account/Page/IG access and media readiness verify karega.
3. Exact resolved targeting, placements, objective, budgets and creative preview karega.
4. Admin ke `Create paused on Meta` approval ke baad:
   - Campaign PAUSED.
   - Ad sets PAUSED.
   - Image/media reference ready.
   - Ad creatives created.
   - Ads PAUSED.
5. Provider tree ko read back karke only complete hierarchy ko `PAUSED_READY` bolega.
6. Fresh `Activate Meta campaign` approval generate karega.
7. Approval ke baad ads and ad sets activate karega, campaign ko last mein activate karega.
8. Configured state and effective delivery/review state separately show karega.
9. Timeout/partial failure par checkpoint se resume/reconcile karega; duplicate hierarchy nahi banayega.

---

## 5. Scope boundary

### In scope

- One Meta ad account per connection.
- One connected Facebook Page and optional/required connected Instagram professional account according to selected placements.
- Static single-image website/link ads.
- Supported Facebook Feed and Instagram Feed placements.
- Campaign, one or more ad sets, creative and ad creation.
- Everything initially PAUSED.
- Separate activation approval.
- Provider status/policy read-back.
- Manual static creative attachment in existing task detail.
- Checkpointed retry/reconciliation.

### Explicitly out of scope

- Reel/video generation or video upload.
- Story/Reel placements that require a 9:16 rendered asset.
- Carousel, collection, catalog and dynamic product ads.
- Instant Forms/lead form creation.
- WhatsApp/DM objective.
- Advantage+ or automated catalog campaigns.
- Organic Facebook/Instagram publishing.
- Meta Pixel/Conversions API implementation.
- Automatic budget increase/decrease.
- Automatic stop-loss/pause optimization.
- Webhooks and continuous performance optimization.
- Managing client/third-party businesses.

Out-of-scope formats/objectives ko silently downgrade nahi karna. Revision instruction do.

---

## 6. Supported Meta v1 matrix

Fast and dependable first release ke liye a narrow allow-list use karo.

### Required minimum path

| Plan intent | Provider execution |
|---|---|
| Objective | `OUTCOME_TRAFFIC` |
| Destination | BandhanTak public HTTPS website |
| Optimization | Current API-supported link-click/landing-page-view option selected from server allow-list |
| Billing | Current API-supported impressions billing for the chosen optimization |
| Creative | Approved static single image |
| Placement | Facebook Feed and/or Instagram Feed |
| Budget | Daily budget in INR minor units |
| Initial state | Campaign, ad set and ad all PAUSED |

### Optional path only when configuration exists

`OUTCOME_LEADS` or `OUTCOME_SALES` may be executable only if current Meta API requirements are implemented and the connected account has the required Pixel/Dataset, domain/event mapping and promoted-object configuration.

If those prerequisites are absent:

- Mark `BLOCKED_CONFIG`.
- Tell admin to revise to supported traffic objective or configure conversion tracking.
- Do not silently convert a leads/sales campaign into traffic.

`OUTCOME_AWARENESS` and `OUTCOME_ENGAGEMENT` remain draft-only until their exact optimization/destination matrix has tests.

Before implementation, verify names/fields against the configured current Meta Graph API version. Provider enums must live in an allow-listed mapper, not in the AI prompt alone.

---

## 7. Data and contract changes

### 7.1 Platform-discriminated approval payloads

#### `MetaCreatePausedPayload`

Minimum fields:

```text
action: CREATE_PAUSED_CAMPAIGNS
platform: META
taskId
draftId
deploymentId
goalId
accountRef
accountDisplayName
pageId
instagramActorId (nullable when Instagram placement absent)
campaignName
providerCampaignName
executionMarker
specHash
currency
objective
dailyBudgetMinor
maxSpendMinor
goalDailyCapMinor
goalTotalCapMinor
startAt
endAt
timeZone
resolvedAudienceSummary
resolvedPlacementSummary
landingUrls
creativeMediaIds
creativePreviewUrls
specialAdCategories
specialAdCategoryCountry
deferredRules
executionEffect: creates all objects PAUSED; no spend starts
```

#### `MetaActivatePayload`

Minimum fields:

```text
action: ACTIVATE_CAMPAIGNS
platform: META
taskId
draftId
deploymentId
accountRef
campaignId
adSetIds[]
creativeIds[]
adIds[]
verifiedConfiguredStatus: PAUSED
pausedVerifiedAt
specHash
currency
dailyBudgetMinor
maxSpendMinor
objective
startAt
endAt
timeZone
landingUrls
pageId
instagramActorId
creativeCount
activationOrder: ads -> adsets -> campaign
rollbackEffect
activationEffect: campaign becomes eligible to spend
```

Both schemas `.strict()` hon. Google schemas and legacy card verification preserve karo.

### 7.2 Typed Meta external references

`CampaignDeployment.externalRefs` remains JSON, but it must pass an internal strict schema before every use:

```text
campaignId
adSetIds by stable local ad-set key
imageHashes or providerMediaIds by creative-media ID
creativeIds by stable local ad key
adIds by stable local ad key
resolvedLocations
resolvedInterests
pageId
instagramActorId
configuredStatuses
effectiveStatuses
policyStatuses
```

Malformed/legacy JSON should not crash worker; normalize to a safe configuration error.

### 7.3 Add actual media metadata

Recommended small model: `MarketingCreativeMedia` linked to current `CreativeAsset`.

Fields:

| Field | Purpose |
|---|---|
| `id` | Stable media ID used by approval payload |
| `creativeAssetId` | MKT-1 brief/concept |
| `storageKey` | Object-store key; never provider token |
| `publicUrl` | Immutable HTTPS URL Meta can fetch |
| `mimeType` | Validated media type |
| `width`, `height` | Decoded image dimensions |
| `sizeBytes` | Validated size |
| `sha256` | Content identity/dedupe |
| `source` | `ADMIN_UPLOAD`, future `AI_RENDER`/`TEMPLATE_RENDER` |
| `status` | `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `INVALID` |
| `reviewedBy`, `reviewedAt` | Separate media approval |
| `providerRefs` | Optional provider image hash/reference map |
| timestamps | Audit |

Current `CreativeAsset.reviewStatus` remains concept/package review. A media file requires its own `APPROVED` status.

### 7.4 Optional deployment delivery fields

Avoid calling enabled objects “delivering” without evidence. Either add explicit fields or store a strict snapshot:

```text
configuredStatus
effectiveStatus
deliveryStatus
policyStatus
deliveryIssues[]
lastProviderSnapshotAt
```

Keep `LIVE` as backward-compatible “activated/spend possible” state if changing enum would disturb MKT-2A.

---

## 8. Manual static creative attachment

Meta execution cannot start from a text brief alone. Add the smallest useful media flow inside the existing task detail.

### UI

- On a Meta IMAGE creative show `Attach image`.
- Accept one image at a time.
- Show preview, dimensions, size and review state.
- Admin explicitly clicks `Approve image for Meta Ads`.
- Replacing an approved file invalidates pending Meta create approval and requires a new one.
- No separate media-library screen.

### Upload route

- Admin-only multipart route scoped to task and creative.
- Verify creative belongs to that task/draft and is `IMAGE`.
- Limit request size before buffering.
- Decode with existing image tooling (`sharp` is already available).
- Accept only supported raster formats; reject SVG/HTML/polyglots.
- Strip EXIF/metadata and re-encode to a known format.
- Enforce allowed aspect ratio and minimum dimensions for selected feed placement.
- Compute SHA-256 and dedupe within the task.
- In production require configured S3-compatible object storage and stable `S3_PUBLIC_URL`.
- Store under dedicated immutable `marketing-creatives/` prefix, not profile-photo or private-media prefix.
- HEAD/GET probe final URL without following to private/internal addresses.
- Never use local disk URL for real Meta creation.

### Creative readiness

At least one approved actual media row must map to every executable ad. The package’s `creativeId` strings are concept IDs, not database UUIDs. Resolve them through stored creative `brief.id`, then to selected approved media. Ambiguous/missing mapping -> `BLOCKED_CREATIVE`.

For MKT-2B static feed scope:

- `STATIC` ads only.
- `REEL` and `STORY` briefs remain preview-only for MKT-3.
- Package must contain at least one compatible static ad/ad set pair.
- Unsupported placements/formats are shown as deferred or require a new package approval; never silently execute them.

---

## 9. Meta connection and permission readiness

### Required connection facts

- Meta App has Marketing API product/use case.
- Token is valid and belongs to the intended app/system user.
- `ads_read` for performance reads.
- `ads_management` for campaign writes.
- System user/user has advertiser/manage access to the exact ad account.
- Connected Page can be used for promoted content.
- Instagram business/creator account belongs to/is connected with the Page when Instagram placement selected.
- Account currency is INR.
- Account status is usable and no disable reason blocks creation.
- Timezone is known.
- Current Marketing API access tier permits this self-owned account use.

Do not confuse `ads_management` permission with Meta’s Marketing API access tier; display them as separate checks.

### Minimal connection UI changes

In existing Meta Ads connection sheet show:

- Token valid.
- Read permission ready/not ready.
- Write permission ready/not ready.
- Ad account accessible.
- Page assigned.
- Instagram account assigned if needed.
- Account currency/timezone/status.
- Token expiry/rotation warning when available.
- `Test read connection` and `Check ad creation readiness` as separate concepts if needed.

Do not show access-token fragments beyond the existing safe credential hint policy. Never return the token to the browser after save.

### Error separation

- `META_TOKEN_INVALID`
- `META_ADS_MANAGEMENT_MISSING`
- `META_ACCESS_TIER_BLOCKED`
- `META_AD_ACCOUNT_FORBIDDEN`
- `META_AD_ACCOUNT_DISABLED`
- `META_PAGE_NOT_ASSIGNED`
- `META_INSTAGRAM_NOT_ASSIGNED`
- `META_ACCOUNT_CURRENCY_MISMATCH`

Each error includes one admin action and whether reconnect is required.

---

## 10. Common and Meta-specific preflight

Run immediately before each provider write, not only when card was created.

### Common checks

- Admin approval is valid, unexpired and exact payload hash matches.
- Draft/package remains approved.
- Current spec hash matches approval and deployment.
- Existing package guardrails run again.
- Daily/total/combined platform caps still pass.
- Destination is allowed BandhanTak HTTPS URL.
- Schedule not expired.
- Deployment lock/phase/status is valid.
- No external object already exists without reconciliation.

### Meta checks

- `ads_management` and account asset access still valid.
- Ad account currency/timezone/account status read back.
- Page/Instagram actor read back and assigned.
- Special-ad-category configuration explicitly present; never guessed by AI.
- Objective is in executable matrix.
- Optimization goal, billing event, destination type and promoted object are compatible.
- Ad-set budget sum equals/does not exceed the draft’s approved daily budget according to chosen Meta budget mode.
- Campaign/ad-set total maximum cannot exceed goal cap or combined Google+Meta cap.
- Every location/interested target resolves uniquely to current provider IDs.
- No religion, caste, community, health, sexuality or other prohibited/sensitive inferred targeting reaches mapper.
- Gender value is internally consistent (`all` versus a specific choice).
- Age minimum is at least 18 and matches approved preview.
- Only allow-listed feed placements.
- Every executable ad has approved media and safe copy.
- Public media URL is still reachable and immutable.

If any resolved targeting differs from the approved human-readable package, create a fresh execution approval showing the exact resolved values. Do not reuse a stale approval.

---

## 11. Pure Meta mapper

Add a pure deterministic mapper with no database/network access.

Suggested input:

```text
customer/ad account ID
provider campaign/ad-set/ad names with stable markers
approved Meta package
resolved provider targets
objective delivery configuration
page ID / Instagram actor ID
provider image hashes or approved media references
final URL + UTM
budget minor units
schedule/timezone
special category configuration
```

Suggested output:

```text
campaign request
ad-set requests with stable local keys
image upload/media requests if needed
creative requests with stable local keys
ad requests with stable local keys
activation order
warnings
deferred items
```

### Mapper rules

- Allow-listed fields only; never spread model JSON into API request.
- Names include stable marker and deterministic child suffix:
  - Campaign: `[BT:<marker>]`
  - Ad set: `[BT:<marker>:AS01]`
  - Creative: `[BT:<marker>:CR01]`
  - Ad: `[BT:<marker>:AD01]`
- All create-status values PAUSED wherever provider object supports status.
- Money stays integer minor units.
- No timezone-dependent JavaScript implicit date conversion.
- Placement strings convert through one fixed map.
- Location/interest names never enter targeting request without resolved provider IDs.
- CTA uses current API allow-list.
- `frequencyCap` and `stopLoss` are not silently implemented. Mark them `deferredRules` for MKT-4 and show them on create card.
- No automatic creative enhancements/AI variations unless explicitly approved; default opt-out when current API allows.
- Page and Instagram identity exact; never pick first returned account silently.

Mapper snapshot tests should pin every provider request shape.

---

## 12. Meta connector/provider interface

Refactor current Google-only worker behind platform providers. Suggested Meta provider methods:

### Read/preflight methods

- `describeAccount()`
- `inspectTokenCapabilities()`
- `listPromotablePages()`
- `listInstagramActors()`
- `resolveLocations()`
- `resolveInterests()`
- `readCampaignTree()`
- `findCampaignsByMarker()`
- `findAdSetsByMarker()`
- `findCreativesByMarker()`
- `findAdsByMarker()`

### Write methods

- `createCampaignPaused()`
- `createAdSetPaused()`
- `uploadOrResolveImage()`
- `createAdCreative()`
- `createAdPaused()`
- `setAdStatus()`
- `setAdSetStatus()`
- `setCampaignStatus()`

Every POST/mutation uses `retries: 0`. Meta read calls may use bounded retry policy. Sanitize Graph errors into code/message/subcode/trace ID; do not persist request bodies containing copy/media URLs if logs are not access controlled.

Use the configured `META_GRAPH_API_VERSION`; capture version in connection/deployment metadata. Before enabling executor, verify every field against official current version and a test/dev ad account.

---

## 13. Checkpointed paused creation

Meta create is multi-step and cannot be treated like Google’s one atomic hierarchy.

### Checkpoint order

```text
PREFLIGHT_OK
CAMPAIGN_CREATED_PAUSED
ADSETS_CREATED_PAUSED
MEDIA_READY
CREATIVES_CREATED
ADS_CREATED_PAUSED
TREE_VERIFIED_PAUSED
```

### Execution

1. Reconcile marker before the first create.
2. Create campaign with `PAUSED`; save ID immediately.
3. Read it back and verify account/name/objective/status.
4. For each stable ad-set key:
   - Search/attach existing marker match first.
   - Otherwise create PAUSED once.
   - Save ID and checkpoint after every success.
5. Resolve/upload each approved image once; store provider image hash/reference.
6. For each creative key:
   - Search/attach existing marker match.
   - Otherwise create once and store ID.
7. For each ad key:
   - Search/attach existing marker match.
   - Otherwise create PAUSED once and store ID.
8. Read full hierarchy.
9. Verify exact object counts, ownership marker, budgets, destination, identities, targets and configured PAUSED states.
10. Only then set `PAUSED_READY` and issue activation card.

### Partial success

- `externalRefs` and checkpoint write after every provider success.
- Failure after campaign/ad-set creation -> `PARTIAL`, no activation card.
- Retry begins with read/reconcile and skips confirmed objects.
- A child with the right marker but wrong parent/spec is ambiguous -> `FAILED_FINAL`, human review.
- Extra unexpected marked objects -> reconciliation ambiguous; do not guess one.
- Incomplete hierarchy must never display “ready”.

---

## 14. Unknown outcome and idempotency

Use the existing deployment-level idempotency and extend it to child objects.

### Rules

- No automatic write retry on timeout, connection reset, 5xx or unreadable response.
- Record `lastWriteAttemptAt`, intended step and stable child key before sending.
- Unknown campaign write -> find campaign by marker.
- Unknown ad-set write -> search within stored campaign by child marker.
- Unknown creative write -> search exact creative marker/account and verify Page/image/destination.
- Unknown ad write -> search within stored ad set by marker.
- Exactly one matching valid object -> attach and continue.
- Zero matches after grace window -> step becomes retry-safe.
- Multiple/mismatched matches -> `RECONCILIATION_AMBIGUOUS`, no new create.

Media upload duplicate may not spend money, but it still follows content hash/provider lookup before re-upload.

Do not derive child identity from array position only. Stable local package keys + deployment marker use karo so ordering changes cannot attach the wrong resource.

---

## 15. Activation choreography — campaign last

Activation approval is created only after full `PAUSED_READY` read-back.

### Immediately before activation

- Approval/payload/spec hash valid.
- Token/account/Page/IG access valid.
- Account usable and currency/budget unchanged.
- Schedule still valid.
- Landing and public media reachable.
- Campaign, all intended ad sets and all intended ads exist.
- Their configured statuses still PAUSED.
- Their parent relationships, budgets, destinations, targets and creatives match approved deployment.
- No policy rejection requiring edit.

### Safe activation order

1. Enable intended ads; verify configured status.
2. Enable intended ad sets; verify configured status.
3. Re-run campaign/account/budget check.
4. Enable campaign **last**.
5. Read full tree.
6. Mark deployment `LIVE` only when intended hierarchy is configured active and campaign read-back confirms active.
7. Store effective/delivery/policy state separately.

Because campaign stays PAUSED through child activation, failure before the last step cannot start delivery.

### Partial/uncertain activation

- Child enable fails while campaign paused -> `PARTIAL`, spend remains blocked, retry from checkpoint.
- Campaign enable timeout -> `UNKNOWN_OUTCOME`, reconcile before any retry.
- Read-back campaign active but hierarchy unsafe/mismatched -> immediately perform the documented compensating rollback: campaign PAUSED first, then record `PARTIAL/FAILED_FINAL`.
- Rollback behavior must be written on the activation approval preview so it is part of what admin approved.
- General-purpose pause/budget tools remain disabled; this compensation is scoped only to the same activation execution.

Meta may place active objects into review or limited-delivery state. UI should say “Activated; Meta review/delivery status: …”, not “ads definitely chal rahe hain”.

---

## 16. Provider drift and status sync

Extend recovery cron to dispatch both Google and Meta without weakening current Google behavior.

### Meta sync

- Reconcile `UNKNOWN_OUTCOME` after grace window.
- Resume approved queued/partial deployment only when retry-safe.
- Refresh PAUSED_READY, ACTIVATION_PENDING and LIVE/activated objects.
- Capture configured/effective/delivery/policy statuses.
- Detect external changes to budget, schedule, target, URL, identity or state.

### Drift behavior

- Never overwrite a manual Ads Manager edit automatically.
- Show exact safe difference.
- Require new package/approval for budget, targeting, URL, schedule or creative changes.
- If an externally active campaign becomes unsafe, do not invent a general automation. Show urgent admin action; compensating pause only when it is part of an in-progress approved activation rollback.
- Google and Meta statuses remain independent.

If helpful, add a `DRIFTED` deployment status; otherwise use a typed drift error without calling it generic failure.

---

## 17. Service refactor

Current worker contains explicit Google-only checks. Refactor carefully:

```text
deploymentWorker
  -> load and claim common deployment
  -> choose executor by deployment.platform
  -> googleExecutor (existing behavior)
  -> metaExecutor (new checkpointed behavior)
  -> common event/error/state helpers
```

Suggested files:

```text
lib/services/marketing/execution/providers/googleExecutor.ts
lib/services/marketing/execution/providers/metaExecutor.ts
lib/services/marketing/execution/metaPreflight.ts
lib/services/marketing/execution/metaReconcile.ts
lib/marketing/providers/metaAdsProvider.ts
lib/marketing/connectors/metaAdsWrite.ts
lib/marketing/mappers/metaCampaignMapper.ts
lib/marketing/storage/marketingCreativeStorage.ts
```

File names can follow repo conventions. Do not duplicate approval validation, leases, event logging, error normalization or route code per provider.

### Tool registry enable order

1. Keep Meta tools non-executable during foundation/refactor.
2. Enable `meta.campaign.create_paused` only after permission/media/mapping/idempotency tests pass.
3. Enable `meta.campaign.activate` only after campaign-last activation and rollback tests pass.
4. Google tools remain executable and regression-tested.
5. Reel/post/website/budget/pause tools remain false.

---

## 18. Minimal UI changes

Use current `/admin/marketing-ai` and `TaskDetailSheet` only.

### Meta deployment card

Show:

- Meta account/Page/Instagram identity.
- Read permission and write permission readiness.
- Static creative preview and approval status.
- Objective and supported/blocked reason.
- Resolved audience and placements.
- Daily/maximum budget and schedule.
- Creation progress: campaign, ad sets, media, creatives, ads, verification.
- External IDs after creation.
- Configured status separately from review/delivery status.
- Safe error + one fix.

### Buttons

- `Attach image`
- `Approve image for Meta Ads`
- `Re-check Meta readiness`
- `Create paused on Meta`
- `Sync from Meta`
- `Retry safely`
- `Request activation`
- `Activate Meta campaign`

Only state-valid buttons show hon. Generic Approve button spend boundary ke liye use na karo.

### Approval wording

Paused create:

> Meta par campaign, ad sets, creative aur ads PAUSED banenge. Is approval se ad spend start nahi hoga.

Activation:

> Approve karne par selected ads/ad sets active honge aur campaign sabse last mein active hoga. Campaign active hote hi spend ho sakta hai. Unsafe partial result par system campaign ko PAUSED rollback kar sakta hai.

---

## 19. API/routes

Reuse existing approval and deployment action routes where possible.

Potential additions:

- Admin-only creative media upload route.
- Admin-only media approve/reject route.
- Existing deployment `recheck/sync/retry/request-activation` actions become platform-dispatched.
- Existing cron includes Meta queues/recovery/status sync.

Every mutating admin route:

- `requireAdmin()`.
- Strict request schema.
- Resource ownership/task relation check.
- CSRF/origin policy consistent with existing admin mutations.
- Bounded upload size/time.
- Safe response without secrets/raw provider payload.
- Audit event.

---

## 20. Tests

No default test should call a real Meta production account.

### 20.1 MKT-2A carry-forward tests

- Google auth works with current Cloud access flow and no legacy developer token when officially supported.
- Legacy token remains compatible if present.
- UI no longer sends user to obsolete onboarding path.
- Google `LIVE` UI means activated, not guaranteed delivering.
- Existing 70 checks remain green.

### 20.2 Contract tests

- Platform discriminator selects correct create/activate schema.
- Google legacy pending cards still parse/hash.
- Meta payload cannot contain Google-only fields.
- Google payload cannot run Meta executor and vice versa.
- Meta external refs strict parser handles partial checkpoints.

### 20.3 Media tests

- Non-admin upload rejected.
- Wrong task/creative relation rejected.
- Oversized, corrupt, SVG/HTML/polyglot input rejected.
- Decoded dimensions—not filename/MIME claim—drive validation.
- EXIF stripped and output normalized.
- Content hash dedupe.
- Production local-disk media cannot become ready.
- Replaced media invalidates create approval.
- Brief approval alone does not pass media gate.
- Public URL private-network/redirect abuse blocked.

### 20.4 Permission/preflight tests

- Valid token with only `ads_read` -> `META_ADS_MANAGEMENT_MISSING`.
- `ads_management` but no ad-account role -> forbidden.
- Missing Page/Instagram assignment blocks selected placement.
- Disabled account/currency mismatch blocks.
- Unsupported objective/placement/format blocks.
- No approved static asset -> `BLOCKED_CREATIVE`.
- Ad-set budget sum above draft/goal cap blocks.
- Protected targeting never reaches provider payload.
- Ambiguous location/interest resolution blocks.
- Expired schedule blocks; dates are not silently shifted.

### 20.5 Mapper tests

- Campaign/ad-set/ad create statuses are PAUSED.
- Child names contain stable marker and keys.
- Correct integer budget units.
- Placement allow-list mapping.
- Gender/all and age mapping.
- Objective compatibility matrix.
- Page/IG identity and UTM final URL.
- No raw model extras reach provider request.
- Frequency cap/stop-loss explicitly deferred.

### 20.6 Creation/idempotency tests

Run timeout simulation after every step:

- Campaign landed but response lost.
- Second ad set landed but response lost.
- Image/media resolution response lost.
- Creative landed but response lost.
- Ad landed but response lost.
- Read-back temporarily missing.

For every case prove:

- No duplicate campaign.
- No duplicate logical ad set/creative/ad.
- Correct checkpoint and external refs.
- Retry first reconciles marker.
- Multiple matches stop for review.
- No activation card before complete paused tree.

### 20.7 Activation tests

- Activation requires separate Meta card.
- Create approval cannot activate.
- Activation rechecks spec/budget/media/account.
- Order is ads -> ad sets -> campaign.
- Campaign stays paused when child step fails.
- Campaign write timeout enters unknown outcome.
- Reconcile active -> activated status; paused -> retry-safe.
- Unsafe read-back after final activation triggers documented campaign-pause rollback.
- Effective pending-review state is not labelled delivering.
- Meta failure does not alter Google deployment.

### 20.8 Route/UI tests

- Action buttons state-correct and double-click safe.
- Spend warning visible before activation.
- Creative preview and approval clear.
- Google and Meta status cards independent.
- Raw token/provider response absent.
- Cron auth and platform dispatch.

### 20.9 Live smoke policy

- Use self-owned Meta development/test ad account or explicitly approved low-risk account.
- First smoke only creates complete PAUSED hierarchy.
- Verify manually in Ads Manager.
- Repeat sync/retry and prove no duplicates.
- No automatic production activation smoke.
- Cleanup/removal is an explicit manual step; do not add destructive automatic cleanup.

---

## 21. Implementation order

### Milestone 0 — preserve and audit

- Inventory current uncommitted work.
- Run current marketing checks/typecheck/lint.
- Record baseline failures without fixing unrelated code.
- Preserve user files.

**Gate:** baseline understood; no MKT-1/MKT-2A regression introduced.

### Milestone 1 — MKT-2A carry-forward hardening

- Update Google Cloud/API access onboarding and optional legacy token behavior.
- Make activated/delivery status wording truthful.
- Add/record real Google paused smoke when credentials are available.
- If unavailable, leave an explicit pending gate.

**Gate:** current Google tests pass and setup instructions match official current flow. Credentials absent hon to real smoke explicitly pending rahe, implementation continue ho.

### Milestone 2 — Meta contracts and connection readiness

- Add discriminated Google/Meta payload schemas with backward compatibility.
- Add Meta permission/account/Page/IG readiness.
- Add typed Meta external refs and errors.
- Keep Meta tools non-executable.

**Gate:** read-only readiness accurately distinguishes every missing prerequisite.

### Milestone 3 — actual static media

- Add creative-media metadata/storage.
- Add admin upload/preview/media approval in existing task detail.
- Add public URL and production object-store guards.
- Resolve package creative IDs to real approved media.

**Gate:** a brief without media is blocked; an approved valid static asset is ready.

### Milestone 4 — Meta paused creation

- Add pure mapper and provider interface.
- Add preflight/target resolution.
- Add checkpointed campaign/ad-set/media/creative/ad creation.
- Add read-back and reconciliation.
- Enable `meta.campaign.create_paused` after tests.

**Gate:** one complete PAUSED hierarchy, no duplicate under every timeout test.

### Milestone 5 — Meta activation

- Add fresh activation card.
- Add children-first/campaign-last activation.
- Add uncertain/partial reconciliation and approved rollback.
- Add configured versus delivery/policy status.
- Enable `meta.campaign.activate`.

**Gate:** spend cannot start before final campaign step; all activation tests pass.

### Milestone 6 — status sync and verification

- Extend cron/recovery to both providers.
- Complete UI/status/error polish.
- Run full regression suite.
- Perform paused-only live smoke if account setup is available.
- Update docs 13/14 implementation status.

Credentials unavailable hon to Milestone 6 ko mock/request-contract verification ke saath code-complete mark karo and real-smoke checklist return karo. Tokens ki wajah se milestones 2-5 incomplete mat chhodo.

---

## 22. Definition of done

MKT-2B complete tab maana jayega jab:

- Existing Google MKT-2A tests remain green.
- Google setup no longer requires an obsolete onboarding path.
- Real Google paused smoke is completed or honestly marked pending.
- UI distinguishes activated from actually delivering.
- Meta write permission, account, Page and Instagram readiness are verified—not assumed from `/me` success.
- An approved brief without actual approved media cannot create an ad.
- Admin can attach and separately approve a safe static image in existing task detail.
- Meta objective/targeting/placement mapping is allow-listed and deterministic.
- Unsupported formats/objectives are blocked or explicitly deferred, never silently changed.
- Meta campaign, all ad sets and all ads are created PAUSED.
- Full tree read-back is required for `PAUSED_READY`.
- Timeout/retry at every create step produces no duplicate logical object.
- Separate activation approval shows exact budget, IDs, audience, destination, media and spend warning.
- Activation order is ads -> ad sets -> campaign.
- Failure before campaign activation cannot start spend.
- Campaign activation unknown outcome reconciles before retry.
- Activated and effective policy/delivery statuses are displayed separately.
- Google and Meta deployments operate independently.
- Meta publish/Reels/video, general pause, budget change and website publishing remain non-executable.
- Full typecheck, lint, existing tests and new fake-provider/database tests pass.
- Automated tests never spend production money.

Completion ko do labels mein report karo:

- **Code complete / mock verified:** credentials ke bina achievable aur is handoff ka required outcome.
- **Real provider verified:** owner keys/account IDs add karne ke baad paused-only smoke successful hone par.

Real provider label pending hona acceptable hai; incomplete Meta executor, skipped safety tests ya hard-coded fake credentials acceptable nahi hain.

---

## 23. External setup the owner must provide

Code can prepare and test readiness, but these account facts come from the owner:

- Meta Business Portfolio and Meta App with Marketing API enabled.
- Self-owned ad account assigned to the system user/user.
- Facebook Page assignment.
- Linked Instagram Professional account assignment when Instagram Feed selected.
- Token with `ads_read` and `ads_management`; other business/Page scopes only when the chosen verification/API calls require them.
- Ad account ID, Page ID and Instagram actor ID.
- INR currency and usable ad account/billing status.
- Explicit special-ad-category configuration after policy review.
- Production S3-compatible object storage plus stable public CDN/base URL.
- Exact daily/total budget caps.
- Explicit permission before any production activation.

Tokens must be entered through encrypted credential storage/environment. Do not paste them into Claude prompts, Git, screenshots or planning docs.

### Keys add karne ke baad combined verification order

1. Railway/environment URLs and encryption/cron secrets verify karo.
2. Google OAuth connect karke Analytics, Search Console and Ads account IDs save karo.
3. Meta system-user token, ad account ID, Page ID and Instagram actor ID save karo.
4. Har connection ka read-only `Test connection` run karo.
5. Meta `Check ad creation readiness` se `ads_management` and asset assignments verify karo.
6. Google test account par one paused-only campaign create + sync karo.
7. Meta self-owned/test account par approved static image ke saath one complete paused-only hierarchy create + sync karo.
8. Ads Manager UIs mein IDs/status/budget/destination manually match karo.
9. Same sync/retry repeat karke prove karo ki duplicate object nahi bana.
10. Production activation tab tak na karo jab tak owner exact budget ke saath separately approve na kare.

---

## 24. Official references to verify during implementation

Provider APIs change frequently. Use current official sources and configured API versions:

- Meta Marketing API documentation:  
  https://developers.facebook.com/docs/marketing-apis/
- Meta official Marketing API Postman collection:  
  https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi
- Meta official onboarding collection with campaign/ad-set/creative/ad examples:  
  https://www.postman.com/meta/facebook-marketing-api/documentation/9jo4f5y/mapi-onboarding
- Meta Marketing API Access Tier update (May 2026):  
  https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/
- Meta Business SDK repository/auth guidance:  
  https://github.com/facebook/facebook-nodejs-business-sdk
- Google Ads current API access levels:  
  https://developers.google.com/google-ads/api/docs/api-policy/access-levels
- Google Ads developer-token/API-access transition:  
  https://developers.google.com/google-ads/api/docs/api-policy/developer-token
- Google Ads test accounts:  
  https://developers.google.com/google-ads/api/docs/best-practices/test-accounts

Do not copy provider field names from old blog posts. Record the tested Meta Graph API version in connection/deployment metadata.

---

## 25. Small copy-paste prompt for Claude Code

```text
Implement the next Growth Saathi phase from:
docs/bandhantak/14_ai_marketing_manager_mkt2b_meta_execution_plan.md

Preserve existing MKT-1 and Google MKT-2A behavior. First close the plan’s MKT-2A carry-forward gaps, especially current Google Cloud API access guidance, truthful activated-vs-delivering status, and a real paused-only smoke gate when credentials are available.

Google/Meta tokens and real account IDs abhi available nahi hain. Unka wait mat karo, unhe mat maango, aur is wajah se implementation mat roko. Complete code provider interfaces, fake providers, recorded request-contract tests and failure simulations ke saath banao. Missing credentials par honest NOT_CONNECTED/BLOCKED_CONFIG state honi chahiye; koi dummy secret, bypass ya fake success mat add karna. Real smoke ko final owner checklist mein pending likhna.

Then implement Meta MKT-2B: verify ads_management plus the exact ad account/Page/Instagram assignments, require a separately approved real static image, and create campaign/ad sets/creative/ads all PAUSED. Use stable child markers, checkpoints, retries:0 on writes, and reconciliation before retry. Generate a separate activation approval; activate ads first, ad sets second, campaign last. Do not add video/Reel generation, organic publishing, website publishing, budget optimization or new dashboards.

Keep Meta write tools disabled until their tests pass. Do not paste/log tokens and do not run a production activation automatically. At the end report current gaps, files changed, tests, executable tools, paused/no-duplicate evidence, and remaining owner account setup.
```

---

## 26. Phase after MKT-2B

MKT-3 will turn existing concepts into creative production:

- AI/static template image variants.
- Third-party video generation adapter.
- Deterministic template-video fallback.
- Render jobs and retries.
- Human creative approval.
- Reels/Stories publishing approvals.
- Creative performance comparison.

MKT-3 should reuse `MarketingCreativeMedia`, provider status, approvals and execution idempotency built here.

---

## 27. Interrupted implementation status — 13 September 2026

Claude weekly limit par Milestone 2/3 ke beech ruk gaya. Existing work ko delete/rewrite nahi karna; yahin se continue karna hai.

### Code jo aa chuka hai

- Google legacy developer token optional/current Cloud access guidance work.
- Google activated-versus-delivering contract groundwork.
- Platform-discriminated Google/Meta approval payload schemas.
- Expanded Meta error/status vocabulary.
- Meta provider interface.
- Meta Graph write transport with `retries: 0`.
- Meta write connector methods.
- Meta pure campaign mapper.
- Meta refs parser and reconciliation helpers.
- Meta preflight/readiness service.
- Meta connection-readiness API route.
- `MarketingCreativeMedia` schema + additive migration.
- Dedicated marketing creative storage.
- Image decode/re-encode/metadata stripping/media approval service.
- Admin media upload and review API routes.
- Deployment service mein Meta card/readiness groundwork.

### Verification result at interruption

- `npx prisma validate`: **pass** — Prisma schema valid.
- `npx tsc --noEmit`: **fail**, two errors:
  - `creativeMediaService.ts`: `sharp.Metadata` namespace type not found.
  - `creativeMediaService.ts`: `sharp.OutputInfo` namespace type not found.
- `npx tsx scripts/marketing-ai-check.ts`: **47/48**.
  - `EXECUTABLE_PLATFORMS` already contains `META`, while the existing assertion still expects only Google.
  - Meta registry write tools are still correctly `executable: false`.

Do not merely weaken/change the test to green. During unfinished work, keep Meta non-executable at both gates. Add `META` to the executable-platform set only in the final enable milestone, together with registry flags and passing Meta tests.

### Work that is still missing

1. Fix the two `sharp` TypeScript types using proper type imports; do not use `any`.
2. Restore a fully green baseline before adding more code.
3. Add Fake Meta provider and dedicated Meta execution/database test script.
4. Refactor Google-only `deploymentWorker.ts` into platform dispatch.
5. Implement checkpointed Meta create executor:
   campaign PAUSED → ad sets PAUSED → image → creatives → ads PAUSED → full read-back.
6. Wire `metaReconcile` into retry, sync and unknown-outcome recovery.
7. Implement Meta activation executor:
   ads ACTIVE → ad sets ACTIVE → campaign ACTIVE last → read-back; rollback campaign PAUSED on unsafe partial result.
8. Extend cron/recovery queries to Meta without changing Google semantics.
9. Wire media upload/preview/approve and Meta readiness into existing `TaskDetailSheet`/`ConnectionSheet`.
10. Add platform-specific activation card and activated-versus-delivering UI.
11. Run migration against the intended local/test database and DB-backed tests.
12. Enable `meta.campaign.create_paused` only after paused-create tests pass.
13. Enable `meta.campaign.activate` only after activation-order/rollback tests pass.
14. Run full typecheck, lint, existing Google tests and new Meta tests.
15. Leave real Google/Meta smoke pending until owner adds credentials.

### Current safety state

Meta write tools remain `executable: false`, and the main deployment worker has no Meta executor. Therefore the partial implementation cannot currently create or activate a Meta campaign. Preserve this fail-closed state until all tests pass.

### Continuation order

```text
fix compile
→ restore existing 48/48 check without prematurely enabling Meta
→ fake Meta provider/tests
→ paused-create executor + reconcile
→ media/readiness UI wiring
→ activation executor (campaign last) + rollback tests
→ cron/status sync
→ final tool enable gates
→ full regression report
→ real credential smoke remains pending
```

### Resume prompt for Claude Code

```text
Continue the interrupted MKT-2B implementation from section 27 of:
docs/bandhantak/14_ai_marketing_manager_mkt2b_meta_execution_plan.md

Do not restart or rewrite the completed Google, Meta connector/mapper/preflight, or creative-media groundwork. First fix the two sharp TypeScript type errors and restore the existing Marketing AI check to green without prematurely enabling Meta. Keep Meta external writes fail-closed while unfinished.

Then add the fake Meta provider/tests, platform-dispatched worker, checkpointed all-PAUSED Meta creation, marker reconciliation, media/readiness UI, children-first/campaign-last activation, rollback and cron/status sync. Enable each Meta registry tool only after its own tests pass. Tokens are not available: do not ask for them or stop; finish with mocks/request-contract tests and leave a combined real paused-only smoke checklist. Never auto-activate production.

At the end run and report Prisma validation/migration status, typecheck, lint, existing Google checks, new Meta tests, exact executable tools, and evidence that retries create no duplicates and campaign activation is always last.
```

---

## 28. Live configuration audit and second resume handoff — 13 September 2026

This section supersedes section 27's interruption snapshot. Continue from the current code; do not restart completed work.

### Owner-supplied Google properties

- GA4 property ID: `553936510`
- Search Console property: `sc-domain:bandhantak.com`
- Google Ads customer ID: `965-995-0894` (normalize to `9659950894` only at the connector boundary if required).
- Google Ads developer token is intentionally not required by the current direct OAuth/Cloud-project access flow.

Important: the current local env files do **not** expose these values under the checked application keys, and the current Google connection service reads account/property refs from `MarketingConnection` records. Therefore do not claim Google is connected merely because the IDs are written in this document. Either:

1. save them through the existing Growth Saathi connection UI after Google OAuth, or
2. deliberately implement documented env fallbacks plus blank `.env.example` entries, while preserving DB values as the primary source.

GA4 and Search Console still require a valid Google OAuth grant/refresh token; IDs alone are not a connection test.

### Local secret/config presence (values deliberately not recorded)

- Meta access token, ad account ID, Facebook Page ID and Instagram user ID are present in Git-ignored local env files.
- `CRON_SECRET` and `SECRETS_ENCRYPTION_KEY` are present in `.env.local`.
- Never print, commit, screenshot or copy the real Meta token into this plan or `.env.example`.
- The Meta credentials currently appear in both `.env` and `.env.local`. Keep one local source of truth (prefer `.env.local`) after verification; do not echo the value while cleaning it up.
- `NEXT_PUBLIC_APP_URL` was not found under the checked env key. Set it to the correct local/production base URL before OAuth callback testing.
- Production S3-compatible storage variables were not found. Real Meta image creation remains blocked until stable publicly reachable media storage is configured; local/fake execution tests can continue.

Add only blank documented placeholders to `.env.example` for every env fallback the code actually supports. Never place real IDs/tokens in `.env.example`.

### Read-only live Meta result

A real read-only readiness call was run; it did not create, activate or modify an ad.

- Token identity: **READY** (`GRIO`).
- `ads_read`: **READY**.
- `ads_management`: **READY at token-scope level**.
- Facebook Page: **READY**, Page is visible with `ADVERTISE` and management tasks.
- Ad account: **BLOCKED** with Meta Graph `(#200)`: the ad-account owner has not granted this token/system user account-level `ads_management` or `ads_read` access.
- Instagram: **BLOCKED**: the configured Instagram actor is not linked to the configured BandhanTak Facebook Page; the Page returned no linked Instagram account.
- Marketing API access tier: **UNVERIFIED** because Meta does not expose this app-level fact through the same Graph read; check it in the Meta App Dashboard.

Required owner fixes before any real paused smoke:

1. Meta Business Settings → Users → System users → select the same system user → Assign assets → Ad accounts → select the configured ad account → grant Manage campaigns/full-control access.
2. Confirm the ad account is owned by/shared with the same Business Portfolio and assigned to the app/system user used by the token.
3. Facebook Page settings/Business Suite → Linked accounts → connect the intended Instagram **Professional** account to the BandhanTak Page, then update the numeric IG actor ID if Meta returns a different one.
4. Re-run read-only readiness. Do not create a campaign until the ad account, Page and Instagram checks are all ready and the account currency/status/timezone have been read successfully.

The readiness classifier currently turns this account-level `(#200)` denial into the message “token par ads_management permission nahi hai”, even though `/me/permissions` proves the token scope is granted. Fix the classifier/copy so it distinguishes token-scope permission from ad-account asset assignment and recommends the correct action.

### Current implementation audit

Work now present after section 27:

- Fake Meta provider and network-isolation stub.
- Platform-dispatched deployment worker.
- Meta paused-create, activate, sync/reconcile executor groundwork.
- Recovery/cron dispatch for Google and Meta.
- Media rows attached to task payloads and creative storage/service/API groundwork.
- Continue-task external-object guard fixed for Meta as well as Google.
- Meta readiness evaluator and connection-service call.
- Token/error scrubbing hardening.

Still incomplete or unverified:

- `npx prisma validate`: **PASS**.
- `npx tsx scripts/marketing-ai-check.ts`: **PASS (48/48)**.
- `npx tsc --noEmit --pretty false`: **FAIL** at `lib/services/marketing/execution/deploymentService.ts:850` because `metaFactsOf()` references `d.checkpoint` although `d` is not in scope. Pass the checkpoint explicitly or derive it from an in-scope typed value; do not use `any` or silently drop checkpoint truth.
- No dedicated `scripts/meta-connection-check.ts` was found even though the readiness evaluator mentions it.
- No dedicated DB-backed `scripts/marketing-meta-execution-check.ts` was found.
- Existing task/connection UI still needs proof of complete wiring for media upload/preview/separate approval, readiness detail, external Meta IDs, activation status and effective delivery status.
- Meta create and activate registry switches correctly remain `executable: false`; keep them fail-closed until their separate test gates pass.
- No real campaign create or activation was attempted.

### Exact resume prompt for Claude Code

```text
Resume MKT-2B from section 28 of:
docs/bandhantak/14_ai_marketing_manager_mkt2b_meta_execution_plan.md

The local Meta token and IDs are available; never print or copy the token. A read-only live readiness check already proved token identity, ads_read, ads_management and the Facebook Page are visible. It also found two real setup blockers: the token/system user does not have account-level access to the configured ad account (Meta Graph #200), and the configured Instagram actor is not linked to the BandhanTak Page. Treat these as BLOCKED_CONFIG, not as permission success and not as reasons to stop mock implementation. Fix the readiness error classification so token-scope permission and asset assignment are reported separately.

First fix the current compile error in deploymentService.ts:850: metaFactsOf() references out-of-scope d.checkpoint. Preserve typed checkpoint truth; no any. Then run Prisma validate, full typecheck and the existing 48/48 check.

Finish—not restart—the remaining MKT-2B work:
1. add the dedicated read-only meta-connection-check script;
2. add the dedicated fake-provider + DB-backed Meta execution test script;
3. complete TaskDetailSheet media upload/preview/separate approval and ConnectionSheet readiness UI;
4. verify checkpointed all-PAUSED create, timeout/landed reconciliation, ambiguity handling and zero duplicates at every child step;
5. verify activation order ads → ad sets → campaign last, rollback/safe partial behavior, and activated-vs-effective-delivery UI;
6. verify Google/Meta isolation and recovery/cron behavior;
7. add blank .env.example placeholders only for env keys the code really consumes, never real secrets;
8. keep meta.campaign.create_paused and meta.campaign.activate executable:false until each gate's tests pass.

Google owner values are GA4 553936510, Search Console sc-domain:bandhantak.com and Ads customer 965-995-0894. Current code expects these refs in MarketingConnection after Google OAuth; either keep that UI/DB flow and report the exact setup steps, or add explicit documented env fallbacks. IDs alone are not OAuth. NEXT_PUBLIC_APP_URL and production public object storage also remain required for real callback/media smoke.

After mock/DB tests are green, re-run the live Meta readiness check. Do not attempt any real campaign write while ad-account/Instagram readiness is blocked. When the owner fixes both, ask for explicit permission for a single PAUSED-only smoke. Never activate a production campaign automatically.

At the end report: files changed, migrations actually applied, every command result, exact registry/executable gates, no-duplicate evidence, remaining owner blockers, and whether status is (a) code complete/mock verified or (b) real provider verified.
```

---

## 29. MKT-2B resume result — 13 September 2026

**Status: (a) Code complete / mock verified — YES. (b) Real provider verified — NO.** Meta is blocked on ad-account asset assignment and Google is not OAuth-connected. No real campaign was created, activated or modified; the only live call was the read-only readiness check below.

### What changed in this resume

- **Compile fix:** `deploymentService.metaFactsOf()` receives the stored checkpoint explicitly (typed `CampaignDeployment["checkpoint"]`); parsed refs still win over the column.
- **Readiness classifier:** Graph `(#200) Ad account owner has NOT grant ads_management or ads_read` and `#272` now map to `META_AD_ACCOUNT_FORBIDDEN` — asset assignment, `reconnect: false`, fix = System users → Assign assets → Ad accounts → Manage campaigns. Token-scope messages stay `META_ADS_MANAGEMENT_MISSING`. When `/me/permissions` shows the scope granted, the evaluator reports a permission-shaped account-read refusal as asset assignment, and account status/currency/timezone become explicit UNVERIFIED lines. The connection stores `readinessCode`/`readinessMessage` and no longer keeps a stale currency/timezone after a failed account read. `MetaDeploymentFacts.accountAccess` added.
- **New scripts:** `scripts/meta-connection-check.ts` (live, read-only, from `.env.local`; `scripts/_stubs/metaReadOnlyNetwork.ts` refuses every non-GET request inside the process; the token is redacted from every output line; nothing stored) and `scripts/marketing-meta-execution-check.ts` (fake Meta + local DB, 27 cases).
- **UI:** new `components/admin/marketing-ai/MetaExecutionPanels.tsx` — Meta ad images (attach, preview, separate "Approve image for Meta Ads", replace/local-disk warnings), Meta facts on the deployment card (token scope vs ad-account access, identity, external IDs, checkpoint, deferred rules) and configured-vs-delivery for both platforms. `TaskDetailSheet` renders them with platform-specific action labels and Meta create/activation wording. `ConnectionSheet` (Meta Ads) gains special ad categories/country, Pixel + event, "Check ad creation readiness" with the full report and the last-check summary, and an env-source hint; Google developer-token copy now says legacy/optional.
- **Gates enabled, each after its own tests:** `EXECUTABLE_PLATFORMS = {GOOGLE_SEARCH, META}`; registry `meta.campaign.create_paused` and `meta.campaign.activate` executable. `marketing-ai-check.ts` pins updated; `marketing-execution-check.ts` (Google) imports network isolation, is Google-only by default (`withMeta` opt-in), expects `ACCOUNT_NOT_READY` for its unconnected Meta row and `PAYLOAD_INVALID` for the Google-shaped Meta card.
- **`.env.example`:** blank `META_AD_ACCOUNT_ID`, `META_FACEBOOK_PAGE_ID`, `META_INSTAGRAM_USER_ID` (consumed by `connectionService.envAccountRef`). No real values.
- **Local env (Git-ignored):** `.env.local` Instagram actor set to the Page-linked account; the five duplicate `META_*` lines removed from `.env` after verifying token/account/page/version were identical (`.env` held the stale Instagram id). `.env.local` is now the single local source for Meta.

### Command results

| Command | Result |
|---|---|
| `npx prisma validate` | PASS |
| `npx prisma migrate status` (local Docker, `localhost:15432`) | 78 migrations, up to date — no new migration applied in this resume |
| `npx tsc --noEmit` | PASS |
| `npx eslint` on all marketing app/lib/component paths + scripts | PASS |
| `npx tsx scripts/marketing-ai-check.ts` | 48/48 |
| `npx tsx scripts/marketing-execution-check.ts` | 22/22 (with Meta gates on) |
| `npx tsx scripts/marketing-meta-execution-check.ts` | 27/27 (first run 26/27 — the test assumed Graph `v26.0`, the env pins `v20.0`) |
| `npx tsx scripts/meta-connection-check.ts` | exit 2 = BLOCKED; read-only, 0 writes |
| Server-render smoke of the new panels (scratchpad, not committed) | 7/7 |

Checks leave nothing behind: test tasks, media rows, media files and audit rows are deleted; connection rows are restored.

### Executable gates now

- `EXECUTABLE_APPROVAL_ACTIONS`: `APPROVE_PACKAGE`, `CREATE_PAUSED_CAMPAIGNS`, `ACTIVATE_CAMPAIGNS`.
- `EXECUTABLE_PLATFORMS`: `GOOGLE_SEARCH`, `META`.
- Executable tools: `google.campaign.create_paused`, `google.campaign.activate`, `meta.campaign.create_paused`, `meta.campaign.activate`.
- Still `executable: false`: `instagram.reel.publish`, `facebook.post.publish`, `campaign.budget.change`, `campaign.pause`, `website.content.publish`.
- A Meta write additionally needs a green readiness check stored on the connection, approved static media and its own approved card.

### No-duplicate evidence (fake Meta account after each case)

| Case | Stored campaign / ad sets / images / creatives / ads | Writes sent |
|---|---|---|
| Happy create | 1 / 2 / 2 / 2 / 2 | campaign ×1, ad set ×2, image ×2, creative ×2, ad ×2 |
| Campaign landed, answer lost | 1 / 2 / 2 / 2 / 2 | same |
| Second ad set landed, answer lost | 1 / 2 / 2 / 2 / 2 | same |
| Image upload landed, answer lost | 1 / 2 / 2 / 2 / 2 | same |
| Creative landed, answer lost | 1 / 2 / 2 / 2 / 2 | same |
| Last ad landed, answer lost | 1 / 2 / 2 / 2 / 2 | same |
| Ad set write lost (did not land) | 1 / 2 / 2 / 2 / 2 | ad set ×3 (lost attempt + one each) |
| Read-back missing → recovery sweep resume | 1 / 2 / 2 / 2 / 2 | same as happy; the resume sent 0 |

Sync never writes. Ambiguity (two tagged campaigns, or a tagged creative with another image/URL) stops at `FAILED_FINAL` with nothing new created. Two parallel workers take one lease.

### Campaign-last evidence

- Order: `setAdStatus → setAdStatus → setAdSetStatus → setAdSetStatus → setCampaignStatus`; campaign status during every child write: PAUSED ×4.
- Child failure → `PARTIAL` with 0 campaign writes; retry → the campaign is written once, last.
- Campaign write timeout: not applied → Sync reads PAUSED → safe retry; applied → Sync reads ACTIVE → `LIVE` with no second write.
- Unsafe read-back → rollback writes `ACTIVE → PAUSED`, verified PAUSED, `FAILED_FINAL`; after the fix Sync → `PAUSED_READY` → a fresh activation card.
- `LIVE` with ads in review shows "Activated", not "Delivering"; "Delivering" only when Meta reports the campaign and an ad effectively ACTIVE.

### Live read-only Meta readiness — 13 September (after the Instagram id update)

| Check | State |
|---|---|
| Token identity | READY (GRIO) |
| `ads_read` / `ads_management` (token scope) | READY / READY |
| Marketing API access tier | UNVERIFIED (App Dashboard only) |
| Ad account asset assignment | **MISSING** — Graph #200 "Ad account owner has NOT grant ads_management or ads_read permission" |
| Account status / currency / timezone | UNVERIFIED (account not readable) |
| Facebook Page | UNVERIFIED — in the token's Page list, task list not returned by this read |
| Instagram | **READY** — `@bandhantak` linked to the Page |

### Remaining owner blockers before one PAUSED-only smoke

1. Business Settings → Users → System users → the same system user → Assign assets → Ad accounts → the configured ad account → Manage campaigns (full control); the ad account must belong to or be shared with the same Business Portfolio.
2. Confirm the system user holds the Page's "Create ads" (ADVERTISE) task — the last read did not return tasks.
3. Set `META_GRAPH_API_VERSION=v26.0` in `.env.local` (it is `v20.0`; the mapper sends `is_adset_budget_sharing_enabled` (v24+), `targeting_automation` (v23+) and per-feature creative opt-outs (v22+)).
4. On the Meta Ads connection, set special ad categories (`NONE` or the category) after policy review.
5. Configure production S3-compatible storage + `S3_PUBLIC_URL`, then re-attach and approve the static images — local-disk media never passes a production create.
6. Set `NEXT_PUBLIC_APP_URL` (https) for the landing URL and the OAuth callback.
7. Re-run `npx tsx scripts/meta-connection-check.ts` and "Check ad creation readiness" until every required line is READY.
8. Only then ask for explicit permission for a single PAUSED-only smoke; verify in Ads Manager; Sync twice to prove no duplicates. No production activation without the owner's separate approval of the exact budget.

### Google owner values — decision

The existing UI/DB flow is kept; no env fallbacks were added. After "Connect with Google" per provider: GA4 property `553936510`, Search Console `sc-domain:bandhantak.com`, Google Ads customer `965-995-0894` (stored as `9659950894`) — Save, then Test connection for each. Prerequisites: the OAuth client's redirect `<NEXT_PUBLIC_APP_URL>/api/admin/marketing-ai/connections/google/callback`, the three APIs and scopes on the consent screen, and the Google Ads API access level on the Cloud project.

### Not done in this resume

- Authenticated browser walkthrough of `/admin/marketing-ai` (needs an admin login). The UI is covered by typecheck, lint, the client-boundary pin and the server-render smoke.
- Real Google and Meta smokes — pending the owner setup above.
- All MKT-1 / MKT-2A / MKT-2B work is still uncommitted in the working tree.

---

## 30. Google live connection — 13 September 2026

**Status: deployed to production and preflight-verified; OAuth grants pending the owner's consent.** No campaign was created, activated or modified.

### Diagnosis

| Check | Finding |
|---|---|
| `https://bandhantak.com/api/admin/marketing-ai/connections/google/callback` (before deploy) | **404** — MKT-1/2A/2B had never been deployed. Deployment `0be7843d` (12 Sept 12:43 IST) predates MKT-1; all of it was uncommitted. Committed admin routes answered 405, so this was absence, not auth. |
| Production DB (Supabase pooler, ap-northeast-1) | 75/75 migrations, 0 unfinished, 0 rolled back; no `marketing_*` / `campaign_*` / `creative_*` tables or enums — the grants were missing because the table did not exist. 1 ADMIN user. |
| Railway `NEXT_PUBLIC_APP_URL` | already `"https://bandhantak.com"` |
| Railway `APP_URL` | `"https://bandhantak.com\n"` (trailing newline) — set to `https://bandhantak.com` with `--skip-deploys`. Fallback only; `NEXT_PUBLIC_APP_URL` wins in `appOrigin()`, `marketingOAuthOrigin()` and the deployment preview URLs. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | set on Railway; identical to `.env.local` (compared by SHA-256, values never printed) |
| `SECRETS_ENCRYPTION_KEY` | set, decodes to 32 bytes; **differs** from `.env.local` — a grant sealed on one never opens on the other, so Google checks run inside the container |
| Cookies / middleware | session cookie `SameSite=Lax` (survives the top-level return from accounts.google.com); `bt_mkt_oauth_state` httpOnly, Lax, Secure under `next start`, 10 min; middleware matcher excludes `/api` |
| Deployment logs (before) | only Google Sign-In lines (`[auth:google] user=…`, one `token exchange failed: 400`) — nothing for marketing, which did not exist |

### Deploy

Pre-deploy: `npx prisma validate` PASS · `npx tsc --noEmit` PASS (includes the new script) · `npx tsx scripts/marketing-ai-check.ts` 48/48 · `npx eslint` on the two new files PASS.

`railway up --ci` of the working tree → deployment `76caccb2-7eab-452c-8e33-5d1957629c25` **SUCCESS** (the CLI log stream timed out; status polled). `prisma migrate deploy` applied `20260912080715_growth_saathi_marketing_ai`, `20260912144854_mkt2_campaign_deployments`, `20260913063000_mkt2b_marketing_creative_media`; Next ready in 463 ms; no error/warning lines. **Not committed or pushed** — a later deploy from a clean checkout would remove Growth Saathi from production.

### New: `scripts/google-connection-check.ts`

Read-only toward Google by construction (`scripts/_stubs/googleReadOnlyNetwork.ts`: GET/HEAD plus four read-only POSTs — token refresh, GAQL search, GA4 runReport, Search Analytics query; `googleAds:mutate`, code exchange and revocation are refused in-process). Secrets are redacted from every line.

- `--preflight` — env, state/cookie round-trip, deployed callback/start answer with the admin-login redirect, and Google's authorization endpoint per provider with an unregistered redirect URI as a control.
- default — the three `MarketingConnection` rows: sealed grant present, opens with this key, scopes, account ref, status, last error.
- `--save-refs --ads= --ga4= --search-console=` — `saveConnectionSettings` (normalisation + audit row), only on a row that holds a grant, actor = the granting ADMIN.
- `--test` — `testConnection()` per provider (records the outcome, like the button) plus a raw token refresh and essential read so failures carry Google's own status/message; Ads also lists directly accessible customers, Search Console lists visible properties.

Run it as `railway ssh -- npx tsx scripts/google-connection-check.ts --preflight` — **not** through `sh -c "…"`: `railway ssh` joins its arguments into one remote command line, so `sh -c` receives only `npx` and the run prints nothing with exit 0.

### Preflight inside the production container (after deploy)

| Section | Result |
|---|---|
| Env | client id/secret set · key usable · origin `https://bandhantak.com` from `NEXT_PUBLIC_APP_URL` · redirect_uri **MATCH** `https://bandhantak.com/api/admin/marketing-ai/connections/google/callback` |
| State + cookie | READY ×3 (verifies own provider; provider swap and missing cookie refused) |
| Deployed routes | callback and start → 307 `https://bandhantak.com/admin/login?next=/admin/marketing-ai` |
| Google authorization endpoint | control (unregistered redirect) → REJECTED `redirect_uri_mismatch`; GOOGLE_ADS (`adwords`), GOOGLE_ANALYTICS (`analytics.readonly`), SEARCH_CONSOLE (`webmasters.readonly`) → **ACCEPTED** (continue to sign-in) with `access_type=offline prompt=consent include_granted_scopes=false` |
| Status mode | all three rows MISSING — NOT_CONNECTED, "'Connect with Google' se authorise karein" (exit 1, honest) |

The probe proves the client, the exact redirect URI and the scope strings are accepted before sign-in. It cannot see the consent screen's publishing status, test-user list or API enablement — those surface at consent or on the first read.

### Owner step (pending)

Signed in at `https://bandhantak.com/admin/login` as the ADMIN, one at a time (the state cookie has one name — parallel tabs break each other):

1. `https://bandhantak.com/api/admin/marketing-ai/connections/google/start?provider=GOOGLE_ADS`
2. `https://bandhantak.com/api/admin/marketing-ai/connections/google/start?provider=GOOGLE_ANALYTICS`
3. `https://bandhantak.com/api/admin/marketing-ai/connections/google/start?provider=SEARCH_CONSOLE`

Then: `railway ssh -- npx tsx scripts/google-connection-check.ts --save-refs --ads=965-995-0894 --ga4=553936510 --search-console=sc-domain:bandhantak.com --test`.

---

## 31. Google live connection, continued — 13 September 2026

**Status: Google Analytics CONNECTED · Search Console CONNECTED · Google Ads BLOCKED** (the Cloud project's Google Ads API access level is Test and 965-995-0894 is a production account). No campaign was created, activated or modified; every Google call in this section was read-only.

### Grants in the production DB (container status mode, before refs)

| Provider | Sealed grant | Opens with the prod key | Scope | Granted (UTC) |
|---|---|---|---|---|
| GOOGLE_ADS | present | yes | `adwords` | 2026-09-13 11:25:26, ADMIN |
| GOOGLE_ANALYTICS | present | yes | `analytics.readonly` | 2026-09-13 11:26:40, ADMIN |
| SEARCH_CONSOLE | present | yes | `webmasters.readonly` | 2026-09-13 11:27:34, ADMIN (re-granted 12:40:59 before the refs run) |

The callback's immediate test answered NOT_FOUND "… set nahi hai" for each (no account ref yet) and left status DISCONNECTED — expected.

### Account refs (`--save-refs`, `saveConnectionSettings`, actor = the granting ADMIN, one audit row each)

- GOOGLE_ADS `965-995-0894` → stored `9659950894`
- GOOGLE_ANALYTICS `553936510`
- SEARCH_CONSOLE `sc-domain:bandhantak.com` — replaced a previously saved `https://bandhantak.com/`, which is not among the properties this Google account can see.

### Real read-only tests (`--test` in the production container)

| Provider | Result |
|---|---|
| Google Analytics | **PASS** — property 553936510 readable; **0 sessions** in the last 30 days (GA4 `runReport`). There is no gtag/GTM in `app/`, `components/`, `lib/` or the served `/` HTML, so the site is not sending GA4 data yet (MKT-0 tag + events still pending). Row CONNECTED, last successful read 13:21:07Z. |
| Search Console | **PASS** — `sc-domain:bandhantak.com`, permission **siteOwner**, the only property visible to this account; Search Analytics 2026-08-14 → 2026-09-10 returned no rows. Row CONNECTED, last successful read 13:21:08Z. |
| Google Ads | **FAIL** — token refresh OK with `adwords`; `listAccessibleCustomers` returns 9659950894 and 4415110084, so 9659950894 is directly accessible and needs no login-customer-id. The customer read failed — see below. |

### Google Ads diagnosis — throwaway read-only replay inside the container (file deleted after the run)

| Variant | Google's answer |
|---|---|
| A `{query, pageSize: 1}` + legacy developer-token (what the connector sent) | 400 `requestError.PAGE_SIZE_NOT_SUPPORTED` — "Setting the page size is not supported. Search Responses will have fixed page size of '10000' rows." (request-id `0u_H-wbfwGSw8iXXAzuD5Q`) |
| B `{query, pageSize: 1}`, no developer-token | same 400 (`ijpjrBgmjf2JoYgWYO-fpA`) |
| C `{query}` + developer-token | 403 `authorizationError.ACTION_NOT_PERMITTED` — "The Google Cloud project is only approved for use with test accounts. To access non-test accounts, apply for Explorer, Basic or Standard access." (`nfQ6pWT0GRiYcY3vNbQthA`) |
| D `{query}`, no developer-token (direct OAuth / Cloud-project access) | same 403 (`JQv4pnHAxjbaG2MUVwNTng`) |

Two independent problems: a code bug (every GAQL search sent `pageSize`, refused since v17) and the owner-side access level. The stored legacy developer token (a `ProviderCredential` row; Railway env has no `GOOGLE_ADS_DEVELOPER_TOKEN`) changes neither answer.

While the 400 stood, the strip showed Google Ads as **CONNECTED** although its row stayed DISCONNECTED: `listConnectionStatus()` demotes only on NEEDS_ATTENTION, and `recordConnectionOutcome()` sets that only for AUTH / FORBIDDEN / an upstream 404. With the fix the 403 maps to FORBIDDEN → NEEDS_ATTENTION, so this case reads honestly; the general gap (a never-successful connection whose test fails with a 400/5xx still shows CONNECTED) is left for a separate change.

### Fix

- `lib/marketing/connectors/googleAds.ts` — `searchGoogleAds(auth, query)` sends `{ query }` only (row counts stay in the GAQL `LIMIT`). `googleErrorDetails` lives here now and is exported. A Google failure is re-thrown with the same code, status, request id and details, and a message of Google's own `[errorCode] text` instead of a 240-character JSON excerpt — so the sheet's todo and the execution layer's FORBIDDEN message name the fix.
- `lib/marketing/connectors/googleAdsWrite.ts` — the eight read-back searches drop their page-size argument and share `googleErrorDetails`.
- `readKeywordIdeas` keeps `pageSize`: `generateKeywordIdeas` is a different request type (not verifiable live while Test access blocks the account).
- `scripts/marketing-ai-check.ts` — new pin: the GAQL body is exactly `{query}`, and a 403 GoogleAdsFailure reads `[authorizationError.ACTION_NOT_PERMITTED] …` with no JSON.
- `scripts/google-connection-check.ts` — on an Ads failure the raw replay also runs without the developer token when one is stored.

| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npx eslint` (changed files) | PASS |
| `npx tsx scripts/marketing-ai-check.ts` | 49/49 |
| `npx tsx scripts/marketing-execution-check.ts` | 22/22 |
| `npx tsx scripts/marketing-meta-execution-check.ts` | 27/27 (after the Google check, never in parallel) |

### Owner blocker — Google Ads

The Cloud project that owns the OAuth client has Google Ads API access level **Test**. Apply for **Explorer, Basic or Standard** access (Cloud Console → Google Ads API, per Google's current flow — Gap B). Until it is approved every read and write works only on Google Ads test accounts. After approval run Test connection on the sheet, or `railway ssh -- npx tsx scripts/google-connection-check.ts --test` — no reconnect is needed.

### Not visible to the API — owner checks

- **OAuth consent screen publishing status.** With an External app in **Testing**, Google expires refresh tokens after 7 days for any scope beyond basic profile — all three connections would then need a fresh Connect every week. Moving the app to **In production** removes that expiry; Google may then ask for app verification for these scopes, and until then the consent screen shows the unverified-app warning.
- API enablement is shown by the reads themselves: GA4 and Search Console answered with data, and the Google Ads API answered at its authorisation layer (a disabled API answers `SERVICE_DISABLED` instead).

Commit and redeploy from the committed revision: §32.
