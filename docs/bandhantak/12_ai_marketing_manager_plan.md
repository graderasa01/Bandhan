# BandhanTak — AI Marketing Manager Plan

**Document Type:** Product Architecture + Fast Implementation Plan  
**Status:** DRAFT v1.0 · 2026-09-12  
**Authority:** `DECISIONS.md` se neeche; `10_engagement_and_monetization_architecture.md` aur `11_ai_action_layer_and_growth_plan.md` ka admin-marketing successor  
**Scope:** BandhanTak ke apne Google, Meta, Instagram aur analytics accounts ko APIs se padhne, campaign/content/video banane, approval ke baad publish karne aur results se agla action nikalne wala simple AI Marketing Manager

---

## 0. TL;DR — exactly kya banana hai

BandhanTak ko bahut saari alag screens ya dikhne wale alag-alag agents nahi chahiye. Ek hi admin-only **AI Marketing Manager** chahiye, working name **Growth Saathi**, jise natural language me goal diya ja sake:

> “Jaipur me agle 30 din me verified profiles badhani hain. Google, Facebook aur Instagram ka sahi campaign banao. Reels bhi tayyar karo.”

Growth Saathi khud:

1. Google par relevant demand aur keywords dekhega.
2. Search Console, Analytics, BandhanTak funnel aur existing ads ka data padhega.
3. Sabse sahi audience, offer, message aur landing page choose karega.
4. Google/Meta campaign ka complete ready-to-launch package banayega.
5. Connected third-party AI video tool se multiple Reel/Story variants banwayega.
6. Video provider na chale to BandhanTak ke approved templates se usable video banayega.
7. Campaign ko pehle draft/paused state me create karega.
8. Admin ki ek final approval ke baad publish/activate karega.
9. Spend, clicks, completed profiles aur verified profiles dekhkar performance analyse karega.
10. Kamzor creative pause aur winner scale karne ka action propose karega; approved limits ke andar baad me khud bhi kar sakega.

Admin ka regular kaam **strategy likhna, copy banana, platform me campaign setup karna aur report jodna nahi** hoga. Admin ka kaam sirf goal dena, preview dekhna aur sensitive/spend action approve karna hoga.

---

## 1. Product definition

### 1.1 Ye kya hai

```
Connected account data
        ↓
Observe + compare
        ↓
AI decision / campaign plan
        ↓
Creative + video production
        ↓
Approval
        ↓
API execution
        ↓
Measurement
        ↓
Next improvement
```

Ye ek **closed marketing loop** hai. Sirf content generator ya reporting dashboard nahi.

### 1.2 Ye kya nahi hai

- Das chatbot/agent characters ka show nahi.
- Har metric ke liye alag page nahi.
- Sirf generic marketing advice nahi.
- Fake “trending” claims nahi.
- Sirf views, clicks ya followers badhane wala bot nahi.
- Unlimited budget kharch karne wala autonomous bot nahi.
- AI ko raw API keys ya unrestricted database access dene wala system nahi.
- User ke private profile, photos, chats, KYC ya sensitive rishta data ko marketing model tak bhejne wala system nahi.

---

## 2. Fastest correct shape — one powerful screen

Primary route:

```
/admin/marketing-ai
```

Is first version me naye navigation jungle ki zaroorat nahi. Ek screen ke teen permanent zones aur detail ke liye drawers/sheets kaafi hain.

### Zone A — Command + conversation

Sabse upar ek large command box:

> “Growth Saathi ko bataiye kya hasil karna hai…”

Example commands:

- “Jaipur me ladkiyon ki verified profiles kam hain, campaign banao.”
- “Pichhle 30 din ke Google aur Meta ads analyse karo.”
- “Shaadi season ke liye 5 Reels aur 3 Stories banao.”
- “₹500/day me sabse achha Google Search campaign banao.”
- “Jo Reel achhi chali uske 4 naye variants banao.”
- “Homepage conversion kyun kam hai aur kya badalna chahiye?”

Conversation sirf text nahi: voice input bhi reuse ho sakta hai, lekin first release ka blocker nahi. Command ke baad AI ek structured work plan dikhaye, endless chat prose nahi.

### Zone B — AI work queue

Sirf ye statuses:

- **Need your approval**
- **Working**
- **Scheduled / live**
- **Learning / result ready**
- **Blocked — connection/action needed**

Har row me:

- AI kya kar raha hai
- Kis goal ke liye
- Kis account/channel par
- Kitna budget/spend involved hai
- Kya create/change hoga
- Evidence kya hai
- Approve, edit, reject ya pause

### Zone C — account health strip

Compact connection strip:

- BandhanTak product data
- Google Analytics
- Google Search Console
- Google Ads
- Meta Ads
- Facebook Page
- Instagram Professional
- Video provider

Sirf `Connected`, `Needs attention`, `Not connected`. Keys screen par kabhi nahi.

### No unnecessary screens rule

Campaign, creative, video, analytics aur approval ke detail isi route ke drawer/sheet me khulein. Dedicated extra page tabhi bane jab ek workflow genuinely ek screen me sambhalna mushkil ho. First release me one-route control room authority hai.

---

## 3. AI ko kya dekhna hai

AI ki quality uske model se kam, uske facts se zyada decide hogi. Ek **Marketing Context Builder** har planning run se pehle following aggregate facts banaye.

### 3.1 BandhanTak internal truth

Existing systems ko reuse karo:

| Existing source | Marketing AI kya padhega |
|---|---|
| Growth Console / `GrowthSnapshot` | Signup funnel, live profiles, retention, MRR, paid conversion, city/gender supply, biggest gates |
| Lifecycle dry-run | Kitne users kis genuine reason se nudge ke liye ready hain |
| Admin Messages | Existing audience definitions aur approved outreach paths |
| AI interactions | Feature usage/cost, provider health |
| Plans/items | Live prices aur actual unlocks; marketing copy kabhi product se alag promise na kare |
| Product events/conversions | Registration, profile completion, profile live, verification, subscription, meaningful rishta progress |

Marketing model ko aggregate numbers milenge. Individual member ka naam, phone, photo, biodata, caste/religion, chat ya private match facts nahi.

### 3.2 Google demand truth

Fast practical stack:

1. **Google Ads Keyword Planner API**
   - Keyword ideas
   - Average monthly searches
   - Competition
   - Historical metrics
   - Forecast metrics
   - City/language targeting
   - Seed ke liye BandhanTak URL + approved matrimony terms

2. **Google Search Console API**
   - BandhanTak kin queries par appear ho raha hai
   - Impressions, clicks, CTR, average position
   - Page, country aur device breakdown
   - High-impression/low-CTR opportunities
   - Pages jo index nahi ho rahi ya weak hain

3. **Google Analytics Data API**
   - Landing-page sessions
   - Traffic source/campaign
   - Registration start/completion
   - Profile completion/live
   - Verification and payment events
   - Funnel drop by campaign/device/city

4. **Google Trends API — optional**
   - Official API abhi limited alpha access me hai.
   - Access milne tak ye MVP dependency nahi.
   - Keyword Planner + Search Console + Analytics se first useful system banega.

**Truth rule:** “Trending” tabhi bolo jab source, geography, time window aur comparison available ho. Average monthly search ko “aaj viral” kabhi mat bolo.

### 3.3 Meta/Instagram truth

Meta Marketing API aur Instagram API se:

- Campaign/ad set/ad status
- Spend, reach, impressions, frequency
- Clicks, CTR, CPC/CPM
- Video plays and watch milestones where available
- Leads/conversions
- Creative-level performance
- Instagram media publishing status
- Reel/media insights supported by connected professional account

Own accounts ke liye required developer app, access tokens, ad account/page access aur correct permissions pehle configure honge. Consumer/personal Instagram account ko manage karne ka promise nahi.

---

## 4. One AI brain, explicit tools

User ko ek Growth Saathi dikhega. Andar ek **orchestrator model** hoga jo allow-listed tools call karega. First version me multi-agent framework ki complexity mat lao. Specialist behaviour prompts/modules se ho sakta hai; UI aur execution ek hi brain ke neeche rahe.

### 4.1 Read tools — automatic

```
bandhantak.growth.read
bandhantak.funnel.read
bandhantak.conversions.read
bandhantak.lifecycle.preview
google.keyword_ideas.read
google.keyword_metrics.read
google.search_console.read
google.analytics.read
google.ads.performance.read
meta.ads.performance.read
instagram.media.performance.read
connections.status.read
```

### 4.2 Creation tools — automatic draft

```
strategy.create
campaign.package.create
google.campaign.draft
meta.campaign.draft
ad.copy.create
landing.copy.create
seo.brief.create
reel.brief.create
story.brief.create
creative.variants.create
video.generate
video.template_render
```

Ye tools BandhanTak database me drafts/assets bana sakte hain. External platform par live effect nahi.

### 4.3 External write tools — approval required

```
google.campaign.create_paused
meta.campaign.create_paused
instagram.reel.publish
facebook.post.publish
google.campaign.activate
meta.campaign.activate
campaign.budget.change
campaign.pause
website.content.publish
```

### 4.4 Never-direct tools

Marketing AI ke registry me ye kabhi nahi:

- Raw SQL
- API secret read/export
- User/KYC/private media access
- Refund/payment transfer
- Safety/moderation override
- Permanent deletion
- Unlimited budget
- Matrimony ranking manipulation
- Fake profiles/testimonials/reviews

Har tool ke liye required:

- Input schema
- Output schema
- Permission tier
- Account ownership check
- Rate limit
- Idempotency key
- Audit event
- Timeout/retry behaviour
- Safe failure state

Model ka tool call authorization nahi hota. Server har call ko independently validate karega.

---

## 5. Goal-first marketing

AI ko “post banao” se pehle business outcome chahiye. Supported goals:

- Completed profile
- Live profile
- Verified profile
- Paid subscription
- Partner signup
- Returning inactive user
- Healthy rishta progression

Default acquisition north star:

> **Cost per completed and verified profile**

Views, followers, reach aur clicks diagnostic metrics hain; business outcome nahi.

### Goal object

Har marketing goal me:

- Name
- Geography
- Audience side (men/women/family/partner)
- Start/end date
- Primary conversion
- Baseline
- Target (admin-entered, AI-invented nahi)
- Total and daily budget cap
- Allowed channels
- Brand/safety constraints
- Stop-loss rule

Example:

```
Goal: Jaipur me verified women profiles badhana
Window: 30 days
Primary conversion: photo/contact verified + profile live
Budget cap: ₹15,000 total; ₹500/day
Channels: Google Search + Instagram Reels
Stop loss: ₹1,500 spend ke baad zero completed profile ho to pause proposal
```

---

## 6. Campaign Factory — ek request se poora package

Growth Saathi ko ek baar goal milne par following **Campaign Package** banana hai:

### Research

- Demand keywords and search volume
- BandhanTak ke existing queries
- Existing winning/losing ads
- Audience pain points
- Season/city context
- Relevant landing pages
- Evidence list with source and time window

### Strategy

- Goal and conversion event
- Target audience
- Channel choice ka reason
- Offer/value proposition
- Budget split
- Testing plan
- Success/failure conditions

### Google Search package

- Campaign name
- Geography/language/network
- Ad groups
- Keywords and match types
- Negative keywords
- Headlines/descriptions
- Assets/extensions
- Landing URL + UTM
- Budget/bid recommendation
- Conversion action

### Meta package

- Campaign objective
- Audience and exclusions
- Placements
- Ad sets
- Primary text/headline/description
- Static/Reel/Story creative assignments
- Landing URL + UTM
- Budget/schedule
- Frequency and stop-loss guardrail

### Creative package

- 3 genuinely different hooks, sirf synonyms nahi
- 3 visual directions
- 2 Reels
- 2 Stories
- 2 static creatives
- Captions and CTAs
- Brand/safety checklist

### Landing package

- Existing page use karni hai ya new landing page
- Hero headline/sub-copy
- One primary CTA
- Trust proof
- Verification explanation
- Grio voice CTA when relevant
- Analytics events

Campaign ko tab tak “ready” nahi bolo jab tak creative, landing URL, conversion tracking aur budget cap complete na hon.

---

## 7. Trend-to-content engine

AI random viral topic copy na kare. Har topic ko score kare:

```
Topic Score =
  Demand evidence
  × BandhanTak relevance
  × Target audience fit
  × Product truth
  × Creative potential
  × Safety/brand acceptability
```

### Topic sources

- Keyword Planner demand
- Search Console rising queries
- Existing ad search terms
- Winning BandhanTak creatives
- Seasonal calendar: shaadi season, festivals, exam/job/migration cycles where actually relevant
- Admin-entered idea
- Optional Trends API after access

### Topic rejection rules

- BandhanTak se unrelated viral trend
- Religion/caste/community ko inflammatory targeting me use karna
- Fake urgency
- Guaranteed shaadi/match claims
- User photo/story without explicit consent
- Fear, shame or family pressure
- Competitor copying
- Unverified statistics

Har selected topic ke saath AI screen par dikhaye:

- “Ye topic kyun”
- Source
- Location
- Time window
- BandhanTak angle
- Intended audience
- Conversion goal

---

## 8. Reel & Story Factory

Marketing AI khud video model nahi hai. Wo creative director + production manager hai. Video generation provider-agnostic adapter ke peeche hogi.

### 8.1 Input

- Campaign goal
- Selected topic/evidence
- Audience
- Platform: Instagram/Facebook
- Format: Reel/Story
- Duration: 15/30/45 seconds
- Brand pack
- Language: Hinglish/Hindi/English
- CTA

### 8.2 Har topic par different creative variants

Ek hi video ke caption variants nahi. Minimum teen different concepts:

1. **Problem → relief**
   - “Profile banana mushkil lagta hai?”
   - Grio voice profile creation demo

2. **Trust proof**
   - Verification, privacy aur family controls

3. **Product demonstration**
   - Rishta Reel / limited thoughtful matches / profile journey

Optional fourth:

4. **Family perspective story**
   - Parent/guardian ko process samjhane wali respectful narrative

### 8.3 AI-generated production bundle

- Hook (first 1–2 seconds)
- Full script
- Shot-by-shot storyboard
- Scene prompts
- On-screen text
- Voiceover text
- Subtitle file/text
- Music mood, copyrighted track demand nahi
- Cover text
- Caption
- CTA
- UTM destination
- Compliance notes

### 8.4 Third-party video provider path

`VideoProvider` abstraction rakho:

```
generateVideo(brief) → jobId
getJob(jobId) → queued | rendering | ready | failed
download/ingest result → BandhanTak-owned media storage
```

Provider replaceable ho. Prompt-based Runway ya kisi approved vendor ko later plug kiya ja sake. Provider-specific fields core campaign model me leak na hon.

### 8.5 Template fallback — mandatory, shortcut nahi

Video API fail, rate-limit, costly ya unavailable ho to campaign rukna nahi chahiye. Deterministic template renderer ke approved templates:

- Kinetic text + voiceover
- App screenshot/product demo
- Image montage + subtitles
- Trust facts carousel video
- Story slides

AI script/storyboard/brand assets de; renderer MP4 banaye. Fallback output clearly `TEMPLATE_RENDERED` label ho, “AI-generated cinematic video” claim nahi.

### 8.6 Publish path

1. Video specification validate
2. Publicly reachable temporary media URL
3. Instagram Reel container create
4. Container status poll
5. Preview/approval state confirm
6. Publish call
7. Returned media ID store
8. Performance sync schedule

Instagram publishing sirf connected Professional Business/Creator account ke supported permissions ke saath.

---

## 9. Analysis & optimisation loop

### 9.1 Common attribution

Har campaign/creative ko internal IDs aur UTM parameters:

```
utm_source
utm_medium
utm_campaign
utm_content
bt_campaign_id
bt_creative_id
```

Registration se verified profile tak internal attribution preserve karo. Sirf platform-reported leads par depend nahi.

### 9.2 AI kya compare kare

- Channel → completed profile cost
- Campaign → verified profile cost
- Keyword/search term → profile quality
- Creative hook → landing visits
- Reel → watch/saves/shares → registrations
- Landing page → start/completion conversion
- City/gender supply impact
- Paid vs organic
- New vs returning users

### 9.3 Decision examples

- High CTR + low profile completion → ad nahi, landing/onboarding mismatch.
- Good watch time + low clicks → CTA weak.
- Cheap registrations + low verification → wrong promise/audience.
- Expensive click + high verified rate → automatically loser mat bolo.
- High frequency + falling response → creative fatigue.
- One gender/city oversupply → same acquisition campaign scale mat karo.

### 9.4 Optimisation authority ladder

**Stage 1 — Recommend only**  
AI analysis aur exact change propose kare.

**Stage 2 — One-tap approve**  
AI change ready rakhe; admin approve kare.

**Stage 3 — Guardrailed auto-optimise**  
Admin pehle policy approve kare, jaise:

- Daily budget kabhi ₹500 se upar nahi.
- Ek din me budget max 20% change.
- Zero verified profiles par ₹X spend ke baad pause.
- Winner scale se pehle minimum conversion sample.
- New campaign always paused until approval.

Stage 3 first release ka part nahi.

---

## 10. Approval and safety model

| Action | Default |
|---|---|
| Data read/analysis | Automatic |
| Strategy/copy/creative brief | Automatic draft |
| Video generation | Automatic within generation-credit cap |
| Internal draft save | Automatic |
| External campaign create | Approval; create PAUSED |
| Campaign activate | Approval |
| Reel/Story/Facebook publish | Approval |
| Budget increase | Approval |
| Pause on hard stop-loss | Can become pre-approved later |
| Website public content change | Preview + approval |
| Pricing/feature promise | Separate admin authority; marketing AI direct nahi |

Approval card me exact diff:

- Account
- Channel
- Audience
- Content preview
- Destination
- Start/end
- Daily/total budget
- Conversion event
- What will happen now
- Rollback/pause path

“Approve campaign” aur “Publish Reel” separate actions hain. Ek vague “Allow AI” button kabhi nahi.

---

## 11. Grio boundary

**Grio aur Growth Saathi ko merge mat karo.**

### Grio

- Customer/family-facing BandhanTak helper
- Public Lite: product, pricing, trust, safety aur registration guidance
- Logged-in Full: voice profile build, app help, personal journey and permitted actions

### Growth Saathi

- Admin-only
- Aggregate marketing/business facts
- Ads, content, accounts, campaigns, website conversion

### Safe relationship

Growth Saathi public Grio se sirf aggregate anonymous intent padhe:

- Kis public question ko kitni baar poocha gaya
- Kaunse answer ke baad registration start hua
- Kis FAQ par users confuse hue

Raw voice/text conversation ya personal details marketing model ko nahi. Growth Saathi Grio ke common questions se FAQ/Reel topics propose kar sakta hai, par Grio ka behaviour bina review ke change nahi.

---

## 12. Minimal data model

Names indicative hain; implementation existing schema conventions follow kare.

### `MarketingConnection`

- provider
- accountRef encrypted/opaque
- scopes
- status
- token expiry/refresh metadata
- last successful sync
- last error code

### `MarketingGoal`

- objective
- geography/audience
- primary conversion
- baseline/target
- budget caps
- allowed channels
- status

### `MarketingTask`

- goalId
- requestedBy
- user request
- status
- current step
- blocking reason

### `CampaignDraft`

- internal campaign ID
- platform
- structured campaign spec
- evidence snapshot ID
- approval status
- external campaign ID
- external status

### `CreativeAsset`

- kind: copy/image/reel/story/template
- brief and variant group
- storage reference
- provider/job reference
- review status
- platform media ID

### `MarketingApproval`

- action type
- exact payload hash
- preview
- requested/approved/rejected by
- expiry
- execution result

### `MarketingMetricSnapshot`

- platform/account/campaign/creative
- window
- spend and delivery metrics
- BandhanTak conversion metrics
- fetchedAt
- data freshness

### `MarketingRun`

- AI task/run
- tools called
- inputs were aggregate flag
- model/provider/tokens
- decisions/evidence
- errors
- audit references

Raw third-party responses ko forever dump na karo. Required normalized fields store karo; short-lived debug payload redact/expire karo.

---

## 13. Connector architecture

Core AI ko platform SDK directly import nahi karna. Adapters:

```
lib/marketing/connectors/googleAds
lib/marketing/connectors/googleAnalytics
lib/marketing/connectors/searchConsole
lib/marketing/connectors/metaAds
lib/marketing/connectors/instagram
lib/marketing/connectors/video
```

Common connector rules:

- OAuth/token handling server-only
- Refresh before expiry
- Minimum required scope
- Account allow-list
- Connection test
- Quota/rate-limit backoff
- Provider request IDs in logs
- Sanitised error messages
- No token in model context/log/UI
- API version explicit and upgradeable

External calls background jobs/outbox through hon. Browser request ko video rendering, platform processing ya long report sync complete hone tak hold na karo.

---

## 14. Prompt and decision contract

Marketing Manager free-form essay return na kare. Strict structured response:

```
diagnosis
evidence[]
assumptions[]
recommendedPlan
campaignPackages[]
creativeBriefs[]
requestedToolCalls[]
approvalsNeeded[]
successMetric
stopConditions[]
nextReviewAt
```

Rules in system prompt:

- Only supplied data ko fact bolo.
- Missing data ko missing bolo.
- Forecast ko estimate label karo.
- No guaranteed matches/marriage/results.
- No invented customer story/statistic.
- Brand voice respectful, warm, serious and family-aware.
- AI ranking/match scores ko marketing targeting me expose/use na karo.
- Every action must connect to an admin goal and measurable conversion.
- Platform spend/publish tool approval ke bina call na karo.

Har plan ke saath **evidence snapshot** save ho, taaki baad me pata chale AI ne ye decision kis data par liya.

---

## 15. Fast implementation order

### Phase MKT-0 — accounts and measurement foundation

Code se pehle:

- GA4 property and BandhanTak conversion events
- Search Console verified property
- Google Ads account, OAuth and developer token process
- Meta Developer App and own ad account access
- Instagram Professional account connection
- Approved Facebook Page/Business assets
- Video provider decision optional; template fallback mandatory

Events minimum:

```
landing_view
registration_started
registration_completed
profile_completed
profile_live
verification_completed
subscription_captured
```

### Phase MKT-1 — first actually useful Marketing Manager

Deliverables:

- One `/admin/marketing-ai` route
- Connection health strip
- Goal/command input
- BandhanTak GrowthSnapshot context
- Google Keyword Planner, Search Console, GA4 read connectors
- Meta/Google existing campaign performance read connectors
- Structured AI diagnosis and Campaign Package
- Campaign/creative drafts stored internally
- Approval cards
- No external writes yet

**Exit gate:** admin ek goal de aur AI real data ke basis par complete Google + Meta + Reel campaign package banaye, jisme manual strategy/copy work na bache.

### Phase MKT-2 — campaign execution

- Google campaign create in PAUSED state
- Meta campaign/ad set/ad create in PAUSED state
- External IDs and status sync
- Approval-bound activation
- Budget caps
- Idempotency and audit

**Exit gate:** approved package platform dashboard me duplicate ke bina paused campaign ban jaye; second approval ke baad hi spend possible ho.

### Phase MKT-3 — Reel/Story production

- Provider-neutral video jobs
- Multiple concepts per topic
- Brand/subtitle/voice bundle
- Template fallback renderer
- Media QA
- Instagram container/status/publish workflow
- Media ID + analytics sync

**Exit gate:** ek chosen topic se minimum 3 genuinely different video concepts bane; provider fail ho to at least one publishable template video ready rahe.

### Phase MKT-4 — continuous analyst

- Scheduled metric sync
- Daily quiet analysis
- Meaningful-change notifications only
- Creative fatigue and funnel mismatch detection
- Weekly outcome report
- One-tap optimisation proposals

**Exit gate:** AI clicks nahi, completed/verified profile outcome se winners/losers explain kare.

### Phase MKT-5 — limited autonomy

- Pre-approved optimisation policies
- Controlled pause/budget movement
- Automatic winning-creative variants
- Full stop button
- Maximum spend and change-frequency enforcement

MKT-5 tab tak nahi jab tak MKT-2/3/4 ka audit trail aur attribution reliable prove na ho.

---

## 16. First release ka exact user journey

1. Admin Growth Saathi kholta hai.
2. Connections strip current account health dikhati hai.
3. AI background me last 30-day BandhanTak + Google + Meta facts summarise karta hai.
4. Admin bolta/likhta hai: “Jaipur verified profiles ke liye ₹500/day campaign banao.”
5. AI missing target/constraint ho to maximum ek short question poochta hai.
6. AI research evidence, channel choice aur complete Campaign Package deta hai.
7. Saath me 3 Reel concepts aur 2 Story concepts.
8. Admin `Generate creatives` approve karta hai.
9. Third-party video tool render karta hai; failure par template renderer.
10. Admin final creatives aur exact budget dekhta hai.
11. `Create paused campaigns` approval se Google/Meta drafts bante hain.
12. Final `Activate` approval ke baad campaign live.
13. AI performance sync karta hai.
14. Meaningful problem/winner hone par hi admin ko alert.
15. AI next action ready rakhta hai: edit, new variant, pause ya scale.

Regular operation me admin ko platform dashboards me jaakar manual setup/copy-paste nahi karna padna chahiye.

---

## 17. Failure and recovery

| Failure | Safe behaviour |
|---|---|
| Keyword API unavailable | Cached dated metrics + Search Console; stale label |
| AI provider fails | Task retryable; existing draft safe |
| Video provider fails | Template fallback |
| Instagram processing stuck | No duplicate publish; status poll/retry |
| Campaign creation partial | Created external IDs store; resume missing steps |
| Activation fails | Campaign remains paused |
| Analytics delayed | “Data incomplete/fresh through date” label |
| Token expired | Connection needs attention; no blind retries |
| Budget/update API conflict | Read current state, show conflict, require refreshed approval |

Every external mutation idempotent ho. Retry kabhi duplicate campaign/ad/post na banaye.

---

## 18. Acceptance criteria

### Product

- One primary admin screen; no unnecessary dashboard maze.
- Natural-language goal se end-to-end campaign package.
- Recommendation ke saath real evidence/source/window.
- Multiple genuinely different creative/video concepts.
- Admin ka daily manual marketing work approval tak reduce ho.

### Execution

- Google/Meta campaign first PAUSED.
- Publish/activate/spend without valid unexpired approval impossible.
- Exact daily/total budget server-side validate.
- Every external action audited.
- Retry duplicate object create na kare.

### Video

- Third-party provider replaceable.
- Provider failure par template fallback.
- Instagram-required media validation.
- User/private profile media creative me kabhi nahi.

### Measurement

- UTM/internal IDs ad se verified-profile outcome tak.
- Platform metrics and BandhanTak conversions separately visible.
- AI views/clicks ko business success na bole.
- Data freshness displayed.

### Safety

- No secrets/PII in model context.
- No fake claims/testimonials/urgency.
- No unlimited autonomy.
- Kill switch and manual pause always available.

---

## 19. Suggested implementation map for Claude Code

Claude Code implementation se pehle existing services and docs padhe, then exact file map propose kare. Indicative ownership:

```
app/admin/marketing-ai/
app/api/admin/marketing-ai/
components/admin/marketing-ai/
lib/contracts/marketingAi.ts
lib/services/marketing/
lib/marketing/tools/
lib/marketing/connectors/
lib/marketing/video/
lib/marketing/attribution/
```

Reuse first:

- `AdminShell`
- `GrowthSnapshot` / Growth services
- Lifecycle dry-run
- Admin messages/audiences where applicable
- AI provider routing + credentials pattern
- `AiInteraction`
- `AdminAuditLog`
- Existing S3/private/public media conventions
- Existing theme/design system

Do not build parallel versions of growth, credentials, audit, outreach or provider routing.

Implementation rule:

> Pehle MKT-1 ka architecture, contracts, permissions and acceptance tests approve karao. Uske baad MKT-1 implement karo. MKT-2/3/4 ko ek hi giant change me mat milao.

---

## 20. Current official API references

Verified 2026-09-12; implementation ke waqt versions/scopes dobara verify hon:

- Google Ads Keyword Ideas: https://developers.google.com/google-ads/api/docs/keyword-planning/generate-keyword-ideas
- Google Keyword Planning overview: https://developers.google.com/google-ads/api/docs/keyword-planning/overview
- Google Trends API alpha: https://developers.google.com/search/apis/trends
- Google Search Console Search Analytics: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Google Analytics Data API: https://developers.google.com/analytics/devguides/reporting/data/v1
- Google Ads campaigns: https://developers.google.com/google-ads/api/docs/campaigns/overview
- Google Ads conversion reporting: https://developers.google.com/google-ads/api/docs/conversions/reporting
- Meta Marketing API official collection: https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi
- Instagram API and Reels Publishing official collection: https://www.postman.com/meta/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00

---

## Final decision

**Build one Growth Saathi, not many visible agents.** Uske paas explicit API tools, real aggregate facts, video-provider adapter, template fallback, approval gates and outcome attribution ho. First useful version data padhe aur complete ready-to-launch campaign banaye. Next version same approved package ko paused campaigns aur publishable Reels me convert kare. Autonomy sabse aakhir me, proven guardrails ke baad.


---

## 21. Implementation status — Phase MKT-1 built (2026-09-12)

`/admin/marketing-ai` live hai. Jo bana:

| Deliverable (§15 MKT-1) | Kahan | Status |
|---|---|---|
| One route, three zones + drawers | `app/admin/marketing-ai/page.tsx`, `components/admin/marketing-ai/*` | ✅ |
| Connection health strip (8 chips, keys kabhi screen par nahi) | `ConnectionStrip.tsx`, `ConnectionSheet.tsx`, `lib/services/marketing/connectionService.ts` | ✅ |
| Goal/command input + §5 goal object | `CommandBox.tsx`, `CommandGoalInput` | ✅ |
| GrowthSnapshot + plans + lifecycle context | `lib/services/marketing/contextBuilder.ts` (PII guard `assertNoPii`) | ✅ |
| Keyword Planner, Search Console, GA4 read connectors | `lib/marketing/connectors/googleAds.ts`, `searchConsole.ts`, `googleAnalytics.ts` | ✅ code; accounts MKT-0 |
| Meta/Google campaign performance read | `metaAds.ts`, `googleAds.ts`; Page/IG: `facebookPage.ts`, `instagram.ts` | ✅ code; accounts MKT-0 |
| Structured diagnosis + Campaign Package (§14 contract) | `lib/contracts/marketingPlanSchema.ts`, `lib/services/marketing/growthSaathi.ts` | ✅ |
| Guardrails (code decides, D-32) | `lib/services/marketing/packageGuardrails.ts` | ✅ |
| Drafts stored internally | `CampaignDraft`, `CreativeAsset`, `MarketingRun` (evidence + tools called) | ✅ |
| Approval cards (§10 exact diff, payload hash) | `MarketingApproval`, `approvalService.ts` — sirf `APPROVE_PACKAGE` executable | ✅ |
| No external writes | Registry me har `EXTERNAL_WRITE_APPROVAL` tool `availableFrom: MKT-2+`; koi executor nahi | ✅ |
| Tool allow-list (§4) | `lib/marketing/tools/registry.ts` — never-direct patterns check script me pinned | ✅ |
| Tests | `npx tsx scripts/marketing-ai-check.ts` (30 pins: boundary, guardrails, PII, hash, connectors) | ✅ |

**Exit gate check (2026-09-12, local):** admin ne ek goal diya ("Jaipur … ₹500/day, total ₹15,000") — sirf
BandhanTak data connected tha (Google/Meta not connected, honestly `missingData` me) — Growth Saathi ne
Google Search package (2 ad groups, keywords/match types, headlines ≤30, descriptions ≤90, negatives,
sitelinks, UTM), Meta package (audience bina protected traits, ad sets, 4 ads creative ids se bandhe),
2 Reels + 2 Stories alag concepts, 2 statics, landing package aur topics diye; guardrails ne "100%
Photo Verified" jaisi 14 absolute lines hataayi aur card par gin kar dikhaayi. Approve → drafts APPROVED,
goal ACTIVE, audit row; koi platform call nahi. Clarifying-question path (budget na do → ek sawaal →
jawab → package) bhi live verify hua.

**MKT-0 abhi bhi haath se (code ke bahar):**
- Google Cloud project: Ads API / Analytics Data API / Search Console API enable, consent screen par
  scopes, redirect URI `<NEXT_PUBLIC_APP_URL>/api/admin/marketing-ai/connections/google/callback`.
- Google Ads developer token (API Center) — page se paste hota hai (encrypted).
- Meta Business Manager system-user token (`ads_read`, `pages_read_engagement`, `pages_show_list`,
  `instagram_basic`, `instagram_manage_insights`) — page se paste hota hai (encrypted).
- GA4 par MKT-0 events (`registration_started` … `subscription_captured`) — GA4 read inhi naamon par
  filter karta hai; jab tak site ye events nahi bhejti, funnelEvents zero dikhenge (finding, bug nahi).

**MKT-2A (2026-09-12):** Google Search paused create + separate activation ab code me hai — status, evidence aur
baaki real-account setup `13_ai_marketing_manager_mkt2_execution_plan.md` §27 me. Meta write (MKT-2B), publish, video
render, metric sync cron, optimisation proposals abhi bhi baaki. `MarketingMetricSnapshot` abhi sirf stale-fallback ke liye bharta hai.

**Model routing:** feature key `marketingManager` (/admin/ai-settings). Default Sonnet 5; Anthropic ke
bade output ke liye provider ab >16k `max_tokens` par SDK stream path use karta hai. Gemini par schema
(~12 KB) `responseSchema` se reject hota hai — provider plain JSON mode + schema-in-prompt par khud gir
jaata hai aur zod validate karta hai (2026-09-12 ko `gemini-3.6-flash` par end-to-end chala).
