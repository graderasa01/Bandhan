# BandhanTak Growth Saathi — MKT-2 Paid Ads Execution Plan

**Document type:** Claude Code implementation handoff  
**Phase:** MKT-2 — approved plan se real Google/Meta campaign banana  
**Depends on:** MKT-1 read-only strategist and approval foundation  
**Primary rule:** AI recommendation de sakta hai aur approved campaign bana sakta hai, lekin bina fresh human approval ke campaign live karke paisa spend nahi karega.  
**Last updated:** 12 September 2026

---

## 1. Is phase ka seedha outcome

MKT-2 complete hone ke baad BandhanTak ka Growth Saathi:

1. MKT-1 mein approved Google Search aur Meta campaign packages ko padhega.
2. Required ad accounts, permissions, budget, landing URL aur conversion setup validate karega.
3. Admin ke **Create Paused Campaign** approval ke baad provider par real campaign resources create karega.
4. Har created campaign ko pehle **PAUSED** state mein rakhega; creation se spend start nahi hoga.
5. Provider se campaign ko dobara read karke external IDs, budget aur status verify karega.
6. Uske baad ek naya, separate **Activate Campaign** approval dikhayega.
7. Admin ke activation approval ke baad sirf selected platform ke verified campaign ko live karega.
8. Duplicate click, timeout ya retry hone par duplicate campaigns nahi banayega.
9. Existing `/admin/marketing-ai` console ke andar hi deployment progress, errors aur next approval dikhayega.

Is phase ka goal autonomous marketing ka safe execution layer banana hai. Is phase mein Reel/video generation, organic posting, website content publishing aur automated budget optimization nahi banana hai.

---

## 2. MKT-1 review: kya reuse hoga

Current implementation mein ye useful foundation already available hai:

- Growth Saathi admin console, command box, connections strip, work queue aur task detail sheet.
- `MarketingTask`, `MarketingRun`, `CampaignDraft`, `CreativeAsset`, `MarketingApproval` aur `MarketingMetricSnapshot` models.
- Typed marketing plan schema for Google Search and Meta packages.
- Package guardrails for budgets, landing paths, copy lengths aur unsafe claims.
- One-shot approval decision flow with payload hash, expiry and audit information.
- Google OAuth, Google Ads read methods, Search Console, GA4 and Meta read connectors.
- Tool registry mein external-write tools already declared hain.
- Only `APPROVE_PACKAGE` executable hai, isliye current production behavior safe hai.

MKT-2 ko is foundation ko extend karna hai; planner ya UI ko dobara rewrite nahi karna.

### Gaps jo MKT-2 mein solve honge

- Approval aur external provider execution ke beech durable job/deployment state nahi hai.
- Campaign hierarchy ke external IDs ko safely store karne ka dedicated structure nahi hai.
- Write request ke timeout ke baad result unknown ho sakta hai; generic retry duplicate campaign bana sakta hai.
- Google write adapter, validation and reconciliation missing hain.
- Meta write permission and write adapter missing hain.
- Campaign creation aur activation ko separate approvals ke roop mein execute karna missing hai.
- Provider read-back verification aur manual retry/reconcile experience missing hai.

---

## 3. Phase boundary — fast build ke liye exact scope

### MKT-2A: pehle implement karo

- Google Search campaign preflight.
- Google Search campaign ko atomic request se PAUSED create karna.
- Google external IDs/status read-back and reconciliation.
- Google campaign activation using a second approval.
- Deployment state, idempotency, audit and minimal UI status.

Google Search first rakhne ka reason: current package text-based hai aur isko video/image rendering ki dependency nahi hai.

### MKT-2B: usi architecture par next implement karo

- Meta permission upgrade and preflight.
- Meta campaign, ad set, creative and ad ko PAUSED create karna.
- Meta external IDs/status read-back and step-wise recovery.
- Meta activation using its own approval.
- Only already-approved and publicly accessible static creative use karna.

### Is phase se bahar

- AI video render karna.
- Reel/Story organic publish karna.
- Facebook/Instagram organic post scheduling.
- Website content ko automatically publish karna.
- Campaign budgets ko AI se automatically badalna.
- Live campaigns ko automatically pause karna.
- Cross-platform daily optimization loop.
- Public website par customer assistant/profile builder.
- Full marketing calendar screen ya separate complex dashboard.

In features ko MKT-3/MKT-4 mein banana hai. MKT-2 ko ads execution ka reliable base rehne do.

---

## 4. Product safety contract

### AI kya kar sakta hai

- Approved package ko provider-specific payload mein deterministically convert karna.
- Provider/account configuration validate karna.
- Preview and warnings generate karna.
- Explicit approval milne par paused campaign create karna.
- Created objects ko provider se read back karna.
- Activation ke liye separate approval prepare karna.
- Failed or uncertain execution ko reconcile karna.

### AI kya khud nahi karega

- Approval ke bina provider write call.
- Campaign creation approval ko activation approval samajhna.
- Admin ke approved budget, dates, audience, landing URL ya strategy ko silently change karna.
- Missing creative ko fake URL ya placeholder se replace karna.
- Timeout ke baad blind retry.
- Ek platform ke approval se doosre platform ko create/activate karna.
- Account token, secrets ya raw provider response ko UI/log mein leak karna.
- Platform rejection ko bypass karne ki koshish.

### Approval separation

Har platform ke liye do independent spend boundaries hon:

1. `CREATE_PAUSED_CAMPAIGNS` — provider par objects create kare, lekin spend start na kare.
2. `ACTIVATE_CAMPAIGNS` — verified paused campaign ko live kare aur spend start kar sakta hai.

Google aur Meta ke approvals alag hon. Agar Google ready hai aur Meta creative ke bina blocked hai, Google ka flow independently complete ho sake.

---

## 5. Canonical state machine

Approval state aur deployment state alag concepts hain. Inko ek field mein merge na karo.

```text
PACKAGE_DRAFT
    |
    | APPROVE_PACKAGE approved
    v
PACKAGE_APPROVED
    |
    | system creates platform-specific CREATE_PAUSED approval
    v
CREATE_APPROVAL_PENDING
    |
    | admin approves
    v
QUEUED
    -> PREFLIGHT
    -> VALIDATING
    -> CREATING
    -> RECONCILING
    -> PAUSED_READY
    |
    | system creates platform-specific ACTIVATE approval
    v
ACTIVATION_APPROVAL_PENDING
    |
    | admin approves
    v
ACTIVATING
    -> LIVE
```

Exceptional states:

- `BLOCKED_CONFIG`: permission, account ID, billing, conversion action or configuration missing.
- `BLOCKED_CREATIVE`: Meta ke paas valid approved public asset nahi hai.
- `UNKNOWN_OUTCOME`: write request ka response nahi mila; provider reconciliation required.
- `PARTIAL`: especially Meta mein kuch children create hue aur kuch fail hue.
- `FAILED_RETRYABLE`: safe recovery possible hai.
- `FAILED_FINAL`: payload/platform error ko manual correction chahiye.
- `CANCELLED`: admin ne execution se pehle cancel kiya.

`LIVE` ko sirf successful provider read-back ke baad set karo, sirf API success response ke basis par nahi.

---

## 6. Database changes

`CampaignDraft.externalCampaignId` aur `externalStatus` summary/display compatibility ke liye reh sakte hain, lekin reliable execution ke liye dedicated deployment record add karo.

### 6.1 New enum: `CampaignDeploymentStatus`

Recommended values:

```text
QUEUED
PREFLIGHT
VALIDATING
CREATING
UNKNOWN_OUTCOME
RECONCILING
PARTIAL
PAUSED_READY
ACTIVATION_PENDING
ACTIVATING
LIVE
BLOCKED_CONFIG
BLOCKED_CREATIVE
FAILED_RETRYABLE
FAILED_FINAL
CANCELLED
```

### 6.2 New model: `CampaignDeployment`

Recommended fields:

| Field | Purpose |
|---|---|
| `id` | Internal deployment ID |
| `draftId` | One approved `CampaignDraft` |
| `taskId` | Parent marketing task |
| `platform` | `GOOGLE_SEARCH` or `META` |
| `accountRef` | Non-secret Google customer ID or Meta ad account ID |
| `status` | Deployment state machine |
| `specHash` | Exact approved normalized spec hash |
| `idempotencyKey` | Unique one-execution identity |
| `executionMarker` | Provider object names mein embedded short marker |
| `createApprovalId` | Approval that authorized paused creation |
| `activateApprovalId` | Optional approval that authorized activation |
| `externalRefs` | JSON map of all provider resource IDs/names |
| `checkpoint` | Last safely completed execution step |
| `providerRequestId` | Sanitized provider request/trace ID if returned |
| `attemptCount` | Claim/execution attempts |
| `lastErrorCode` | Safe normalized error code |
| `lastErrorMessage` | Sanitized admin-facing error |
| `lockedAt` | Worker ownership/lease |
| `lockedBy` | Worker identifier |
| `startedAt` | First execution time |
| `pausedVerifiedAt` | Provider read-back success |
| `activatedAt` | Provider activation success |
| `lastSyncedAt` | Last external status sync |
| timestamps | Created/updated |

Recommended constraints:

- Unique `draftId + platform` for the first release.
- Unique `idempotencyKey`.
- Unique nullable `createApprovalId` and `activateApprovalId` where supported.
- Index `status + updatedAt` for worker/recovery scans.
- Relation to `CampaignDraft`, `MarketingTask` and approvals.

`externalRefs` examples:

```json
{
  "campaign": "customers/123/campaigns/456",
  "budget": "customers/123/campaignBudgets/789",
  "adGroups": ["customers/123/adGroups/11"],
  "criteria": ["customers/123/adGroupCriteria/22"],
  "ads": ["customers/123/adGroupAds/33"]
}
```

Meta version:

```json
{
  "campaignId": "1200...",
  "adSetIds": ["1201..."],
  "creativeIds": ["1202..."],
  "adIds": ["1203..."]
}
```

### 6.3 Optional execution events

If existing `MarketingRun` logs enough structured steps, reuse it. Otherwise add a compact `MarketingExecutionEvent` table with deployment ID, step, status, safe message, request ID and timestamp. Raw access tokens, full HTTP headers, user PII or large provider payloads store na karo.

### 6.4 Migration compatibility

- Current MKT-1 data valid rehna chahiye.
- New fields/tables nullable/default-safe hon.
- Migration existing drafts ya approvals ko reinterpret na kare.
- Existing `APPROVE_PACKAGE` behavior unchanged rahe.

---

## 7. Approval payloads

Approval payload generic free-form JSON na rahe; action-specific schemas add karo.

### 7.1 Create paused approval payload

Minimum fields:

```text
action: CREATE_PAUSED_CAMPAIGNS
platform
taskId
draftId
deploymentId
accountRef
accountDisplayName
campaignName
specHash
currency
dailyBudget
totalBudget
startAt
endAt
audienceSummary
landingUrls
conversionAction
creativeAssetIds
executionEffect: "Creates provider objects in PAUSED state; no spend starts"
```

### 7.2 Activate approval payload

Minimum fields:

```text
action: ACTIVATE_CAMPAIGNS
platform
taskId
draftId
deploymentId
externalCampaignId
verifiedExternalStatus: PAUSED
accountRef
campaignName
specHash
currency
dailyBudget
totalBudget
startAt
endAt
landingUrls
conversionAction
activationEffect: "Campaign becomes eligible to serve and spend"
pausedVerifiedAt
```

### 7.3 Approval rules

- Payload hash decision ke samay verify ho.
- Approval expired, already decided, mismatched or wrong-user ho to execute na ho.
- Approval decision and job enqueue ek database transaction mein hon.
- Double-click same job/deployment return kare, second execution nahi.
- Create approval execute hone ke baad usko activation ke liye reuse na karo.
- Spec edit hone par old approval invalid/expired mark ho aur new approval required ho.
- Activation approval creation tabhi ho jab deployment `PAUSED_READY` ho.
- Activation approval per platform ho; multi-platform bulk activation first release mein na ho.

---

## 8. Durable execution architecture

Paid platform write ko long HTTP request ke andar directly finish karne par depend mat karo.

### Recommended flow

1. Admin approval endpoint decision record kare.
2. Same transaction mein deployment ko `QUEUED` kare.
3. Response user ko immediately accepted/queued state de.
4. A durable worker queued deployment claim kare.
5. Worker preflight, validation, creation and reconciliation steps run kare.
6. UI existing task polling/refetch se latest state dikhaye.
7. Stuck or retryable deployment recovery sweep se dobara claim ho.

Existing request ke `after()` hook ko best-effort fast trigger ke roop mein use kiya ja sakta hai, lekin woh only durability mechanism na ho. Deployment row source of truth rahe aur protected cron/worker stuck jobs recover kare.

### Suggested modules

```text
lib/services/marketing/execution/
  executeApprovedAction.ts
  deploymentService.ts
  deploymentWorker.ts
  executionErrors.ts
  idempotency.ts
  preflight.ts
  reconcile.ts

lib/marketing/connectors/googleAdsWrite.ts
lib/marketing/connectors/metaAdsWrite.ts

lib/marketing/mappers/googleSearchMapper.ts
lib/marketing/mappers/metaCampaignMapper.ts
```

Provider connectors network operations karein. Mappers pure deterministic functions hon. Services approvals, state transitions, locking and audit own karein.

### Suggested internal routes/jobs

- Existing `POST /api/admin/marketing-ai/approvals/[id]`: approve/reject only; approved write action ko queue kare.
- `POST /api/admin/marketing-ai/deployments/[id]/sync`: admin-triggered read-back sync.
- `POST /api/admin/marketing-ai/deployments/[id]/retry`: only retryable/reconciled states.
- Protected worker/cron route such as `/api/cron/marketing-executions`.

Route names repo convention ke hisab se adjust ho sakte hain. Public unauthenticated execution endpoint mat banao.

### Worker claim rules

- Transaction/conditional update se ek deployment ko ek worker claim kare.
- Lease expiry ke bina active lock steal na ho.
- Each step se pehle current status validate ho.
- Invalid state transition refuse ho.
- Provider write se pehle approval, payload hash and spec hash dobara verify hon.
- Logs sanitized hon.

---

## 9. Idempotency and unknown-result recovery

Ye MKT-2 ka sabse important engineering rule hai.

### 9.1 Stable identity

`idempotencyKey` ko at least in values se derive karo:

```text
platform + accountRef + draftId + specHash + createApprovalId
```

Provider campaign name mein short non-sensitive execution marker add karo, for example:

```text
BandhanTak Leads Delhi [BT:abc123]
```

Marker admin ko visible ho sakta hai aur reconciliation mein exact deployment dhoondhne ke kaam aayega.

### 9.2 Read timeout versus write timeout

- Read calls safe policy ke andar retry ho sakti hain.
- Write calls generic HTTP retry wrapper se automatically repeat na hon.
- Write timeout/network disconnect ka matlab failure assume na karo; result `UNKNOWN_OUTCOME` ho.
- `UNKNOWN_OUTCOME` mein next action provider par marker/known resource refs search/read-back ho.
- Exact matching object milne par IDs attach karke execution continue/reconcile karo.
- Koi object na mile aur provider request definitely failed prove ho tabhi retry allow ho.
- Multiple ambiguous matches milne par human review; automatic duplicate creation nahi.

### 9.3 Google versus Meta recovery

- Google create hierarchy ko one atomic mutate mein bhejne ka target rakho, isliye either full create or no create expected ho.
- Meta creation multi-step ho sakta hai. Har successfully created resource ke baad `externalRefs` and `checkpoint` save karo.
- Meta resume existing campaign/ad set/creative IDs reuse kare; completed step dobara create na kare.
- Partial Meta deployment ko live/activation approval na mile jab tak at least one complete valid ad and full read-back verification na ho.

---

## 10. Common execution preflight

Har platform write se immediately pehle:

1. Marketing connection `CONNECTED` and recent successful test ho.
2. Required credential decrypt ho sake; secret response/log mein na aaye.
3. Acting admin authorized ho and approval valid ho.
4. Current draft approved ho.
5. Current normalized draft hash approval `specHash` se match kare.
6. `packageGuardrails` dobara run ho; error-level issue ho to block.
7. Goal and draft daily/total budgets server-side caps ke andar hon.
8. Multi-platform combined maximum spend approved goal cap cross na kare.
9. Currency configured account currency se match ho; silent currency conversion na ho.
10. Start/end dates valid and non-expired hon.
11. Landing URL HTTPS ho, allowed BandhanTak origin/domain ho and publicly reachable route ho.
12. UTM parameters deterministic and approved package se match hon.
13. Conversion action/event provider account mein exists and usable ho.
14. Audience protected/sensitive targeting guardrails pass kare.
15. Campaign name marker ke saath provider limit mein ho.
16. Existing deployment/external match ho to reconcile; new create na ho.

Budget ko decimal floating point se provider minor units mein convert na karo. Integer paise/micros helpers with explicit rounding and boundary tests use karo.

---

## 11. Google Search execution design

### 11.1 Configuration required

Server-side/admin connection configuration mein ye values available hon:

- Google Ads manager/customer relationship as applicable.
- Target customer ID.
- Developer token.
- OAuth refresh credential with `adwords` scope.
- Account currency and timezone read-back.
- Default/fallback conversion action resource name, if package alias resolve karna ho.
- Allowed geo target and language mapping rules.

Google token ko query parameter, client response ya normal logs mein expose na karo.

### 11.2 Deterministic mapping

Approved `GoogleSearchPackage` ko provider resources mein map karo:

- `dailyBudgetRupees` -> CampaignBudget amount in correct micros.
- Campaign -> Search advertising channel, approved dates and selected bidding strategy.
- Campaign status -> `PAUSED`.
- Networks -> package enum ke fixed mapping se.
- Location strings -> preflight-resolved Google geo target constants.
- Language -> configured language criterion constants.
- Each package ad group -> AdGroup.
- Each keyword/match type -> AdGroupCriterion.
- Negative keywords -> campaign/ad-group negative criteria according to approved schema policy.
- Headlines/descriptions -> Responsive Search Ad assets.
- Final URL -> canonical public BandhanTak URL + deterministic UTM.
- Sitelinks/callouts -> implement only when their final URLs/text fully validated hon; otherwise explicitly defer, silently discard na karo.

Model output ko direct Google request body na banao. Mapper allow-listed fields only output kare.

### 11.3 Bidding strategy

- Approved bidding strategy ko deterministic allow-list se map karo.
- Agar selected strategy ko conversion tracking/history/configuration chahiye aur prerequisite missing hai, deployment `BLOCKED_CONFIG` ho.
- Strategy ko silently `MAXIMIZE_CLICKS` ya kisi aur value mein downgrade na karo.
- `targetCpa` only compatible strategy ke saath accept ho.
- Unsupported `MANUAL_CPC` details missing hon to explicit validation error do.

### 11.4 Validation before creation

1. Full Google mutation payload build karo.
2. Same payload ko `validateOnly: true` and `partialFailure: false` se run karo.
3. Provider validation errors ko safe field-level summary mein normalize karo.
4. Validation successful ho tab actual mutate proceed kare.
5. Validation aur mutation ke beech current deployment lock/spec hash verify karo.

### 11.5 Atomic creation

Where supported, one `GoogleAdsService.Mutate` request with temporary resource names use karke budget, campaign, campaign criteria, ad groups, keywords and RSAs create karo.

- `partialFailure: false`.
- Campaign starts `PAUSED`.
- Child resources can be configured ready-to-serve so later campaign activation is a small, explicit change.
- No automatic retry on uncertain mutation response.
- Successful response se all resource names store karo.
- Immediately read back campaign, budget, ad groups and at least one enabled/valid ad.
- Correct marker, customer ID, paused state, budget and destination confirm hone ke baad `PAUSED_READY` set karo.

### 11.6 Google activation

Activation approval execute karte waqt:

1. Campaign external resource provider se refetch karo.
2. Ownership marker and stored resource name match karo.
3. Status still `PAUSED` ho.
4. Current budget/dates/final URLs approved activation payload se match hon.
5. At least one valid ad and keyword set present ho.
6. Account/config/approval/spec hash preflight repeat ho.
7. Campaign status only `ENABLED` karo.
8. Read back and confirm `ENABLED`/eligible external state.
9. Deployment `LIVE`, task `SCHEDULED_LIVE` (or current equivalent) and goal active state update karo.

Activation fail ho to Meta ya kisi other deployment ko implicitly activate na karo.

---

## 12. Meta Ads execution design

### 12.1 Connection and permissions

MKT-1 read connection ka `ads_read` permission write ke liye enough nahi hai. Meta Ads connection flow ko required write permission such as `ads_management` ke saath reconnect/upgrade karna hoga.

Preflight verify kare:

- Ad account accessible and active.
- Token required permission/tasks rakhta hai.
- Page ID configured and usable hai.
- Instagram actor/account ID available hai jab Instagram placement use ho.
- Account currency/timezone expected configuration se match hai.
- Required business/ad account permissions valid hain.
- Creative URL provider ke dwara fetchable hai.

Permission missing ho to `BLOCKED_CONFIG` with a clear reconnect instruction; repeated API calls nahi.

### 12.2 Compliance configuration

`special_ad_categories` ya country-specific policy values AI se guess na karvao. Server-held/admin-confirmed compliance configuration use karo.

- Matrimonial product ke targeting mein religion, caste, health, sexuality ya other sensitive/protected traits infer/use na karo.
- Existing package guardrails execution preflight par rerun hon.
- Meta policy rejection ko only display/correct karo; evade/bypass wording or targeting generate na karo.

### 12.3 Creative gate

MKT-2 mein AI video generation nahi hai. Therefore Meta deployment ke liye:

- Only `CreativeAsset` with approved status and a real public `storageRef`/asset URL use ho.
- MIME/type, aspect ratio, dimensions, size and accessibility validate ho.
- Draft-only Reel/Story brief ko rendered asset mat samjho.
- No eligible asset ho to `BLOCKED_CREATIVE` set karo.
- Placeholder, local filesystem path or expired signed URL provider ko mat bhejo.
- Fast first version mein approved static image/link ad support enough hai.

Campaign/ad set skeleton banana technically possible ho sakta hai, but BandhanTak mein `PAUSED_READY` tabhi set karo jab at least one complete valid paused ad present ho.

### 12.4 Deterministic mapping

- Campaign objective allow-listed mapping se.
- Campaign status `PAUSED`.
- Ad set audience only allowed country/location/age/gender/interests representation se.
- Placements arbitrary model strings se nahi; defined allow-list mapper se.
- Ad set status `PAUSED`.
- Budget exact minor units and account currency mein.
- Schedule provider timezone conversion tests ke saath.
- Approved asset -> ad creative.
- Approved copy and allow-listed CTA -> ad.
- Ad status `PAUSED`.
- Destination URL + deterministic UTM.

### 12.5 Step-wise creation and checkpoints

Suggested steps:

1. Create campaign PAUSED; save ID.
2. Create each ad set PAUSED; save IDs after every success.
3. Create/reuse approved creative; save IDs.
4. Create each ad PAUSED; save IDs.
5. Read back campaign tree.
6. Confirm correct account, marker, budgets, destination, full ad availability and paused states.
7. Mark `PAUSED_READY`.

Each request ke baad checkpoint commit karo. Error ke baad resume last confirmed checkpoint se ho.

### 12.6 Meta activation

- Create a platform-specific activation approval only after `PAUSED_READY`.
- Immediately before activation campaign/ad sets/ads refetch karo.
- Ensure objects owned by current deployment and still paused/configured as approved hain.
- Activate necessary hierarchy in controlled order according to Meta requirements.
- If activation becomes partial, mark `PARTIAL`, clearly show which objects are active, and offer safe reconcile/pause—not blind repeated activation.
- Full verified serving state ke baad only `LIVE` mark karo.

---

## 13. Activation preview and spend clarity

Activation card par admin ko minimum ye exact information dikhni chahiye:

- Platform and account name/ID suffix.
- Campaign name and external ID.
- Current verified provider status.
- Daily and total maximum budget.
- Currency.
- Start and end time with timezone.
- Audience summary and locations.
- Landing URL(s).
- Conversion action/objective.
- Creative count/type for Meta.
- Clear line: **“Approve karne par campaign live ho sakta hai aur ad spend start ho sakta hai.”**

Button label generic `Approve` nahi; use:

- `Create paused on Google`
- `Create paused on Meta`
- `Activate Google campaign`
- `Activate Meta campaign`

Reject button decision save kare but external change na kare.

---

## 14. Minimal UI changes — koi extra bekar screen nahi

Existing `/admin/marketing-ai` and `TaskDetailSheet` reuse karo.

### Task detail mein ek Deployment section add karo

Per platform card:

- Google Search / Meta label.
- Connection readiness.
- Current deployment state.
- Approved budget.
- External campaign ID when available.
- Last verified time.
- Safe progress steps: preflight, validate, create, verify, activate.
- Action-specific approval card/button.
- Retry/reconcile button only for allowed states.
- Concise provider error and “what to fix” instruction.

### Status examples

- `Configuration needed`
- `Waiting for paused-create approval`
- `Creating safely in paused mode`
- `Checking provider result`
- `Created and paused — no spend yet`
- `Waiting for activation approval`
- `Live`
- `Creative required`
- `Needs review — result uncertain`

### UX rules

- Poll/refetch only while active execution state exists; idle screen continuous polling na kare.
- Double-click button disable ho.
- Provider raw error dump UI mein na ho.
- Active/live badge only read-back verified state se.
- Google and Meta failures visually independent hon.
- Same console mein kaam complete ho; separate campaign-builder wizard mat banao.

---

## 15. Task and approval orchestration

### After `APPROVE_PACKAGE`

1. Mark draft/package internally approved as current MKT-1 does.
2. Re-evaluate available platform drafts.
3. For each approved draft, create or reuse one deployment.
4. Run non-writing readiness check.
5. Ready platform ke liye `CREATE_PAUSED_CAMPAIGNS` approval create karo.
6. Blocked platform ke liye reason show karo; fake approval mat create karo.

### After paused creation

1. Deployment read-back verified.
2. Draft summary external campaign ID/status update.
3. A fresh `ACTIVATE_CAMPAIGNS` approval create karo.
4. Task detail user ko “created paused, no spend” state dikhaye.

### After activation

1. Provider read-back.
2. Deployment -> `LIVE`.
3. CampaignDraft external status sync.
4. Task -> existing live/scheduled state closest to schema.
5. MarketingGoal -> `ACTIVE` only if at least one selected deployment live hai.
6. Structured audit run/event record.

Task overall status ko multi-platform truth hide nahi karna chahiye. Example: Google `LIVE`, Meta `BLOCKED_CREATIVE`. UI cards exact per-platform state show karein.

---

## 16. Error normalization

Internal normalized categories:

- `AUTH_EXPIRED`
- `PERMISSION_MISSING`
- `ACCOUNT_NOT_READY`
- `BILLING_NOT_READY`
- `INVALID_CONVERSION_ACTION`
- `INVALID_GEO_OR_LANGUAGE`
- `INVALID_BUDGET`
- `POLICY_REJECTED`
- `CREATIVE_MISSING`
- `CREATIVE_INVALID`
- `SPEC_CHANGED`
- `APPROVAL_INVALID`
- `PROVIDER_VALIDATION_FAILED`
- `RATE_LIMITED`
- `NETWORK_UNKNOWN_OUTCOME`
- `PROVIDER_PARTIAL_FAILURE`
- `RECONCILIATION_AMBIGUOUS`
- `INTERNAL_ERROR`

Each normalized error specify kare:

- Retry safe hai ya nahi.
- Reconnect/config change chahiye ya nahi.
- Admin-facing short message.
- Provider request ID if safe.
- Original error sanitized server logs mein, secrets remove karke.

Policy/validation errors ko blind retry na karo. Rate limit read call retry ho sakti hai. Write unknown outcome always reconcile first.

---

## 17. External status sync

MKT-2 ko full analytics cron nahi banana, but deployment integrity ke liye lightweight status sync required hai.

Sync should fetch:

- Campaign status.
- Budget amount/currency.
- Start/end dates if exposed.
- Major child resource availability/status.
- Provider policy/configuration error summary.

Sync times:

- Immediately after create.
- Immediately before and after activation.
- Admin manual sync.
- Recovery sweep for active/uncertain deployments.

Performance metrics ingestion and optimization MKT-4 mein rahe. MKT-2 status sync ko KPI dashboard mein expand na karo.

If external user manually changes the campaign:

- Do not overwrite it automatically.
- Mark deployment `needs review`/appropriate failure state.
- Show detected difference.
- Require a new plan/approval before changing budget, audience, URLs or schedule.

---

## 18. Tool registry changes

Existing tool names reuse karo:

- `google.campaign.create_paused`
- `meta.campaign.create_paused`
- `google.campaign.activate`
- `meta.campaign.activate`

Rules:

- Tools directly LLM-callable external mutations na banen.
- LLM can propose/select intent; only approval executor invokes mutation adapter.
- Registry metadata mein phase MKT-2 and exact approval action enforce ho.
- `website.content.publish` remains disabled for this phase even if registry mein MKT-2 label currently hai; move its actual execution to a later content phase.
- Reel/Post publish and budget/pause tools remain non-executable.
- `EXECUTABLE_APPROVAL_ACTIONS` ko gradually enable karo:
  1. Google paused create after tests pass.
  2. Google activation after tests pass.
  3. Meta paused create after creative and permission gates pass.
  4. Meta activation after tests pass.

Ek action enum ko executable set mein add karna enough nahi hai. Executor must also verify platform, deployment state and matching tool/action allow-list.

---

## 19. API response shape

Task detail response mein compact deployment summary add karo:

```text
deployments[]:
  id
  platform
  status
  accountDisplay
  externalCampaignId
  dailyBudget
  totalBudget
  currency
  lastSyncedAt
  currentStep
  safeError
  availableActions[]
```

Approval response decision ke baad “provider write completed” claim na kare. It should return queued/current deployment state. UI subsequent task/deployment state fetch kare.

Never return:

- Access/refresh tokens.
- Client secrets/developer tokens.
- Full raw provider response containing sensitive fields.
- Internal encrypted credential fields.

---

## 20. Testing strategy

Default automated tests real ad networks ko call na karein. Provider clients injectable/fake hon and requests recorded for assertions.

### 20.1 Schema and mapper tests

- Google rupees -> micros conversion.
- Meta currency minor-unit conversion.
- Timezone and date boundaries.
- Google network/bidding/match type mapping.
- RSA headline/description limits.
- Duplicate keyword and negative keyword behavior.
- UTM construction and URL allow-list.
- Geo/language resolution failures.
- Meta placements and CTA allow-list.
- Sensitive targeting removal/block.
- Missing public creative -> `BLOCKED_CREATIVE`.

### 20.2 Approval tests

- Correct create approval queues one deployment.
- Activation approval cannot execute before `PAUSED_READY`.
- Create approval cannot activate.
- Expired approval rejected.
- Payload/spec hash mismatch rejected.
- Wrong admin/session rejected.
- Double click does not create duplicate job.
- Google approval does not authorize Meta.
- Edited budget invalidates old approval.

### 20.3 Concurrency and idempotency tests

- Two workers cannot claim same deployment.
- Same idempotency key returns existing deployment.
- Write timeout enters `UNKNOWN_OUTCOME`.
- Reconciliation finds marker and attaches existing resource.
- Ambiguous matches stop for review.
- Google mutation is not blindly retried.
- Meta resumes from stored checkpoint.
- Completed Meta child object is not recreated.

### 20.4 Google adapter tests

- First call is validate-only.
- Validation failure prevents mutate.
- Actual mutate uses paused campaign and no partial failure.
- Atomic operations reference temporary resource names correctly.
- All external resource names stored.
- Read-back mismatch prevents `PAUSED_READY`.
- Activation only changes intended campaign status.
- Post-activation read-back required for `LIVE`.

### 20.5 Meta adapter tests

- `ads_management` missing -> reconnect/config block.
- Page/IG actor prerequisites enforced.
- Campaign/ad set/ad initially paused.
- Missing creative prevents ready state.
- Partial step stores IDs/checkpoint.
- Resume uses existing resource IDs.
- Activation partial state is visible and not hidden.

### 20.6 Guardrail tests

- Daily and total cap enforcement.
- Cross-platform combined cap.
- Wrong currency blocks execution.
- Disallowed/non-public landing URL blocks.
- Protected targeting cannot reach provider mapper.
- Absolute/guaranteed claims remain blocked/sanitized according to current policy.
- Video brief cannot be used as uploaded media.
- Secrets absent from API responses and logs.

### 20.7 Route/UI tests

- Non-admin cannot decide approval, sync or retry.
- Approval button queues and disables correctly.
- Progress state refreshes.
- Paused state clearly says no spend.
- Activation warning clearly says spend can start.
- Google/Meta states render independently.
- Error recovery action only appears when safe.

### 20.8 Live verification policy

- Automated CI never activates a production campaign.
- Provider sandbox/test account use where available.
- Real account smoke verification first creates a tiny, explicitly approved PAUSED campaign only.
- Production activation is a manual acceptance step with exact small budget and named admin approval.
- Test objects use clear marker and are removed/archived only through an explicit cleanup procedure; automatic destructive cleanup mat add karo.

---

## 21. Implementation order for Claude Code

### Milestone 1 — execution foundation

- Add deployment enum/model and migration.
- Add typed approval payload schemas.
- Add deployment service, locks, idempotency and state transitions.
- Queue write actions from approval decision safely.
- Add worker/recovery entrypoint with no provider implementation enabled yet.
- Add fake-provider tests.

**Gate:** no real provider write; double-click/concurrency/recovery tests pass.

### Milestone 2 — Google paused creation

- Add pure Google mapper.
- Add preflight and conversion/geo/language resolution.
- Add validate-only request.
- Add atomic paused creation with write-safe HTTP behavior.
- Add read-back/reconciliation.
- Enable `google.campaign.create_paused` only after test gate.
- Add minimal deployment UI.

**Gate:** real/test-account smoke can create exactly one paused campaign and repeat request creates no duplicate.

### Milestone 3 — Google activation

- Create activation approval after paused verification.
- Add just-in-time activation preflight.
- Add status mutation and read-back.
- Enable `google.campaign.activate`.

**Gate:** mock tests complete; any real activation requires explicit admin production acceptance.

### Milestone 4 — Meta readiness and paused creation

- Upgrade/reconnect permissions.
- Add account/Page/Instagram/creative preflight.
- Add pure Meta mapper.
- Add checkpointed multi-step creation.
- Add reconciliation and partial recovery.
- Enable `meta.campaign.create_paused`.

**Gate:** one complete paused Meta campaign contains at least one valid paused ad; retries create no duplicates.

### Milestone 5 — Meta activation and polish

- Add Meta activation approval and executor.
- Add partial activation handling/read-back.
- Enable `meta.campaign.activate`.
- Finalize status sync, errors and UI details.
- Update original master plan implementation-status section.

**Gate:** all acceptance tests below pass.

---

## 22. Definition of done

MKT-2 complete tab maana jayega jab:

- An approved MKT-1 Google package can create one real PAUSED Google Search campaign.
- Creation never starts spend.
- External budget, campaign, ad group, keyword and ad resource references persist.
- Duplicate approval clicks/retries do not create duplicate campaigns.
- Unknown write outcomes reconcile before any retry.
- Separate activation approval is required and clearly warns about spend.
- Google live status only provider read-back after activation se set hota hai.
- Meta write permission readiness is validated.
- An approved Meta package with an approved real static asset can create a complete PAUSED campaign/ad set/creative/ad hierarchy.
- Meta partial failure resumes from checkpoints without recreating completed objects.
- Meta activation has its own separate approval and verified result.
- Google and Meta can succeed/fail independently.
- All budgets, destinations, schedules, conversion mappings and guardrails are revalidated at execution time.
- No video, organic publish, website publish, auto-budget or auto-pause path accidentally becomes executable.
- Admin can see progress, provider IDs, paused/live truth and actionable errors in the existing task detail UI.
- Non-admin and unauthenticated calls cannot write or trigger execution.
- Automated tests do not spend real money.
- Typecheck, lint, existing marketing checks, migrations and new execution tests pass.

---

## 23. Decisions Claude Code must not change silently

If implementation discovers one of these needs product input, stop that narrow part and document it; do not guess:

- Which Google Ads customer ID is the final production account.
- Which conversion action maps to each BandhanTak marketing goal.
- Final per-day and per-campaign budget caps.
- Meta ad account, Page and Instagram actor IDs.
- Meta compliance/special-ad-category configuration.
- Which storage/CDN URLs Meta is allowed to fetch.
- Whether a campaign with only partial Meta objects should be retained for manual repair.
- Whether actual production activation smoke test is authorized.

Architecture, tests, mocks, paused creation and safe failure handling should still be completed without waiting for production activation permission.

---

## 24. Official implementation references

Use current official provider documentation at implementation time; verify API versions instead of copying old examples:

- Google Ads Search campaign creation:  
  https://developers.google.com/google-ads/api/docs/campaigns/search-campaigns/getting-started
- Google Ads mutate best practices:  
  https://developers.google.com/google-ads/api/docs/mutating/best-practices
- Google Ads REST mutate overview:  
  https://developers.google.com/google-ads/api/rest/common/mutate
- Google Ads API version and release notes:  
  https://developers.google.com/google-ads/api/docs/release-notes
- Meta Marketing API official documentation:  
  https://developers.facebook.com/docs/marketing-apis/
- Meta Marketing API official Postman workspace:  
  https://www.postman.com/meta/facebook-marketing-api/documentation/9jo4f5y/mapi-onboarding

Provider version, permission or field behavior changes over time. Implement against the currently configured/tested API version and capture it in connection health metadata.

---

## 25. Copy-paste prompt for Claude Code

```text
Implement MKT-2 for BandhanTak Growth Saathi using:
docs/bandhantak/13_ai_marketing_manager_mkt2_execution_plan.md

First inspect the current MKT-1 implementation and preserve its behavior. Work milestone by milestone in the exact order in the plan. Do not redesign the admin console and do not add video generation, organic publishing, website publishing, budget optimization or unrelated screens.

Core safety contract:
- CREATE_PAUSED_CAMPAIGNS and ACTIVATE_CAMPAIGNS are separate, platform-specific approvals.
- Creation must always create PAUSED campaigns and must not start spend.
- Activation requires a fresh approval and immediate provider read-back checks.
- Do not use automatic generic retries for provider writes.
- On a write timeout, mark UNKNOWN_OUTCOME and reconcile by execution marker/resource IDs before retrying.
- Make execution durable, locked and idempotent.
- Never log or return tokens/secrets.
- Never silently change an approved budget, audience, bidding strategy, schedule, destination or creative.

Start with the deployment schema/state machine and fake providers. Then implement Google paused creation and activation. After those gates pass, implement Meta permission/creative gates, checkpointed paused creation and activation.

Use the existing contracts, task detail sheet, approval service, package guardrails, tool registry and provider credential system where appropriate. Add focused migrations and services instead of rewriting MKT-1.

Before enabling each external-write tool, add and run the tests and acceptance gate specified in the plan. Automated tests must not activate or spend through a real production account. If production account IDs, conversion mapping, Meta compliance settings or activation permission are absent, finish the safe architecture and report the exact remaining configuration rather than guessing.

At the end report:
1. files changed,
2. schema/migration changes,
3. tests and checks run,
4. which external-write tools are now executable,
5. which real-account setup remains,
6. evidence that creation stays PAUSED and duplicate retries are prevented.
```

---

## 26. Next phase after this

MKT-3 will add creative production:

- Trend-informed Reel/Story briefs.
- Third-party AI video/image provider adapter.
- Render job status and asset storage.
- Human creative approval.
- Instagram/Facebook publishing approvals.
- Creative performance comparison.

MKT-3 should consume the safe deployment/approval/idempotency foundation from MKT-2; it should not be mixed into this implementation.

---

## 27. Implementation status — MKT-2A built (Google Search), 2026-09-12

Milestones 1-3 (§21) code me hain aur local par fake provider + real Postgres ke against verify hue. Milestones 4-5 (Meta) jaan-boojh kar nahi bane — Meta deployment row honestly `BLOCKED_CONFIG · NOT_EXECUTABLE_YET` dikhata hai, koi fake card nahi.

| Deliverable | Kahan | Status |
|---|---|---|
| Deployment enum/model + events table, additive migration (§6) | `prisma/schema.prisma` → `CampaignDeployment`, `MarketingExecutionEvent`; `prisma/migrations/20260912144854_mkt2_campaign_deployments` | ✅ |
| Typed approval payloads (§7) | `lib/contracts/marketingExecutionPayloads.ts` (zod, strict) · UI vocab `lib/contracts/marketingExecution.ts` | ✅ |
| Deployment service — rows, readiness, cards, lease, transitions, task status (§8, §15) | `lib/services/marketing/execution/deploymentService.ts` | ✅ |
| Idempotency key + execution marker (§9.1) | `execution/idempotency.ts` — marker `BT:xxxxxxxxxx` deployment id se, card badalne par bhi wahi | ✅ |
| Error normalisation (§16) | `execution/executionErrors.ts` — write timeout/5xx = `UNKNOWN_OUTCOME`, kabhi retry-safe nahi | ✅ |
| Preflight (§10, §11.1-11.3) | `execution/preflight.ts` — readiness (no network) + write preflight (account, conversion action, geo, billing, dates) | ✅ |
| Pure Google mapper (§11.2, §11.5) | `lib/marketing/mappers/googleSearchMapper.ts` + `landingUrl.ts` — ek atomic `googleAds:mutate`, temp ids, `PAUSED`, `containsEuPoliticalAdvertising`, paise→micros integer | ✅ |
| Google write connector (§11.4-11.6) | `lib/marketing/connectors/googleAdsWrite.ts` — `retries: 0`, validate-only + real = same request, read-back GAQL, marker search, status-only activate | ✅ |
| Worker: claim → preflight → validate → reconcile-first → create → read-back → activation card → activate → LIVE (§8, §9, §11) | `execution/deploymentWorker.ts` (+ `reconcile.ts`) | ✅ |
| Approval decision + queue in one transaction, double-click idempotent (§7.3) | `lib/services/marketing/approvalService.ts` | ✅ |
| Routes: approve/reject (queues), `deployments/[id]/{sync,retry,recheck,request-activation}`, cron `/api/cron/marketing-executions` (§8) | `app/api/admin/marketing-ai/...`, `app/api/cron/marketing-executions/route.ts` | ✅ |
| Minimal UI in existing console (§13, §14) | `TaskDetailSheet.tsx` (Deployment section, action-specific buttons, spend warning), `WorkQueue.tsx` (per-platform badges, "Fix Deployment"), `ConnectionSheet.tsx` (conversion mapping) | ✅ |
| Tool registry write gate (§18) | `lib/marketing/tools/registry.ts` → `executableWriteTool()`; sirf `google.campaign.create_paused` + `google.campaign.activate` executable; `website.content.publish` MKT-3 | ✅ |
| Tests (§20) | `npx tsx scripts/marketing-ai-check.ts` (48 pure pins) · `npx tsx scripts/marketing-execution-check.ts` (22 DB + fake-provider cases) | ✅ 70/70 |
| Meta permission/creative gates, checkpointed create, activation (§12) | — | ⏳ MKT-2B |

**Ab executable:** `APPROVE_PACKAGE`, `CREATE_PAUSED_CAMPAIGNS` (sirf GOOGLE_SEARCH), `ACTIVATE_CAMPAIGNS` (sirf GOOGLE_SEARCH). Baaki sab cards preview hi hain.

**Evidence ki creation PAUSED rehti hai aur duplicate nahi banta** (`marketing-execution-check.ts`):
- fake provider ka call log: `describeAccount → listEnabledConversionActions → resolveGeoTarget → hasApprovedBilling → mutate:validate → findCampaignsByMarker → mutate:write → readCampaignTree`; campaign op `status: "PAUSED"`; validate aur write byte-identical.
- double click → wahi deployment, dusra mutate nahi; do parallel workers → ek claim, ek create; `@@unique([draftId, platform])`.
- write timeout → `UNKNOWN_OUTCOME`; 60s grace se pehle sync "wait" kehta hai; "kuch nahi mila" ke baad hi `FAILED_RETRYABLE`; landed-but-lost case me marker se attach, real mutate count 1 hi rehta hai.
- read-back fail → retry marker se attach karta hai (create count 1); ambiguous (2 matches) → `FAILED_FINAL`, create 0.
- activation: alag card (`verifiedExternalStatus: PAUSED`, `verifiedBudgetMicros`), just-in-time billing/landing/read-back checks, ek `setCampaignStatus(ENABLED)`, `LIVE` sirf read-back ENABLED par; activation timeout → sync decides (ENABLED → LIVE, PAUSED → safe retry).

**Design decisions jo doc se aage/alag hain (jaan-boojh kar):**
- Enum me do extra state: `CREATE_PENDING` (readiness pass, card pending) aur `ACTIVATION_QUEUED` (activation approved, worker claim se pehle) — doc §5 ke "CREATE_APPROVAL_PENDING" aur claim-able activation ke liye.
- `executionMarker` deployment id se derive hota hai (card id se nahi) — naya card issue hone par bhi purane attempt ke objects marker se milte hain (§9.1 ka irada, formula alag).
- Campaign dates creation ke din settle hoti hain (create card: "creation ke din se N din"); activation card exact dates + timezone dikhata hai (§11.2). Attach (retry) par provider ki dates hi truth hain.
- Sitelinks/callouts create nahi hote — card par "Deferred" line (§11.2 "explicitly defer").
- Conversion action: sirf exact-name match ya admin mapping (`conversion_<event>` settings, ConnectionSheet me field); MAXIMIZE_CONVERSIONS/TARGET_CPA par na mile to `BLOCKED_CONFIG` (§23 — guess nahi).
- Revise/answer us task par refuse hota hai jiska campaign platform par hai (`HAS_EXTERNAL_CAMPAIGN`) — duplicate campaign ka business risk; naya task banayein.
- `hashPayload` ab canonical (sorted keys) — JSONB key order rakhta nahi; MKT-1 ke purane cards `legacyHashPayload` se verify hote hain.
- Google campaign REMOVED (Ads UI se delete) → read-back mismatch/drift dikhata hai; auto-cancel nahi (§23 "retain for manual repair" ka faisla product ka).

**Real-account setup jo abhi bhi haath se baaki hai (code ke bahar, §23):**
1. Google Cloud: Ads API enable, consent screen scope `adwords`, redirect URI `<NEXT_PUBLIC_APP_URL>/api/admin/marketing-ai/connections/google/callback`; page se "Connect with Google".
2. Google Ads developer token (API Center) — page se paste; **Basic/Standard access** chahiye (Explorer/test-only token sirf test accounts par mutate karta hai).
3. Customer ID (client account, manager nahi) + agar MCC se access ho to Login customer ID; phir **"Test connection"** — currency/timezone/manager/test-account facts yahin save hote hain, readiness inke bina block karti hai.
4. Account currency INR hona chahiye; billing setup APPROVED (activation isse block hoti hai, paused create nahi).
5. Conversion action: account me `verification_completed` (ya jo event package me ho) naam ka ENABLED action, ya ConnectionSheet me `event=customers/…/conversionActions/…` mapping.
6. `NEXT_PUBLIC_APP_URL=https://bandhantak.com` (http/localhost landing block hota hai) aur landing page publicly reachable (activation HEAD/GET probe karti hai).
7. `CRON_SECRET` set + scheduler se `POST /api/cron/marketing-executions` har 10-15 min (lease recovery, uncertain reconcile, status sync).
8. Pehla real smoke: Google **test account** par ek chhota paused campaign (create card), phir Google Ads UI me dekh kar remove — automatic cleanup nahi hai. Production activation = named admin ka manual acceptance (§20.8).
9. `GOOGLE_ADS_API_VERSION` default `v23` (Feb 2027 tak); v25 latest — env se badlo, code change nahi.
