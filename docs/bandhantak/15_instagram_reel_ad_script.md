# BandhanTak — Instagram Reel Ad Script

**Document Type:** Marketing creative — ready-to-shoot script + AI production brief
**Status:** v1.0 · 2026-09-14
**Scope:** Ek 20-second Instagram Reel ad (plus 10-second cut-down), uske alternate hooks, caption, aur OpenArt se banane ka poora shot-by-shot brief.
**Authority:** Claims sirf wahi hain jo product me sach hain (`BANDHANTAK_MASTER_BUILD_PLAN.md` §3, `lib/i18n/dictionaries/en/public.ts`). Koi bhi naya claim add karne se pehle wahan verify karein.

---

## 0. Kya bech rahe hain — ek line me

> Matrimony apps profile ki kami door karti hain. BandhanTak **wajah** ki kami door karta hai.

Baaki sab ads "10 lakh profiles" kehti hain. Hamari ad ulta bolti hai: **roz gine-chune rishte — aur har ek ke saath likha hua kyun.** Ye ek hi cheez pure category me alag khadi karti hai, aur ye product me sach bhi hai.

### Sirf ye claims use karne hain (har ek product me built hai)

| Claim | Kahan se aata hai |
|---|---|
| Bol kar profile — form nahi bharna | `/bolo` voice profile flow; "Profile ready in 2 minutes" |
| Roz kuch chune hue rishte, hazaaron nahi | `lib/constants/plans.ts` — reelPerDay per plan |
| Har match ke saath wajah | "What matches — and what you should check" |
| AI raat bhar kaam karta hai | "Your handpicked profiles are ready by morning" |
| 7-level verification | `home.heroProof.verification` |
| AI khud se data nahi banata | "If it's missing, it stays missing" |
| Family ko ek swipe me bhej sakte hain | `home.reel.pointFamilyDesc` |
| Profile banana free | `home.finalCta.footnote` — "Registration is free" |

### Kyun "5 rishte" nahi likha

`lib/constants/plans.ts` me `reelPerDay` har plan ka alag hai — **FREE 3**, BASIC 5,
STANDARD 15, PREMIUM 30 — aur admin ise `/admin/pricing` se 1 se 100 ke beech kabhi
bhi badal sakta hai, bina deploy ke. Ad naye log laati hai, aur naya aadmi **FREE**
par aata hai: use **3** milte hain, 5 nahi. Yaani "roz 5 rishte" us aadmi ke liye
jhooth hai jo wo ad dekh raha hai, aur kal admin ke ek edit se har kisi ke liye
jhooth ho sakta hai.

"Kuch chune hue rishte" wahi farq bechta hai — hazaaron ke khilaaf gine-chune —
bina koi aisa number bole jo plan ke saath badalta hai.

> **Site par bhi yahi galti hai:** `home.reel.headlineAccent` = "five", aur
> `pricing` page par "Roz 5 rishtey" BASIC ke neeche hai. Home page har visitor
> ko dikhta hai, aur unmein se zyadatar FREE par jaayenge. Ye alag se theek
> karna hai — ad ki copy site ki galti ko copy nahi karegi.

### Ye kabhi nahi bolna

- "Shaadi pakki" / marriage guarantee — build plan §1 me explicitly mana hai.
- Fake success stories ya "iska rishta yahin se hua" jab tak asli consented couple na ho.
- Koi bhi number jo dashboard se prove na ho sake (users, matches, cities).

---

## 1. MAIN SCRIPT — "Kuch chune hue rishte" · 20 seconds

**Format:** 1080×1920 (9:16) · 20s · VO + on-screen text + subtitles
**Tone:** Thaka hua sach → rahat. Shor nahi, sukoon. Fast cuts, warm light.

| # | Time | Visual | On-screen text | Voiceover |
|---|---|---|---|---|
| 1 | 0.0–3.0s | Raat 1 baje, andhera kamra. Phone ki neeli roshni me ek thaka hua chehra. Angootha tezi se scroll kar raha hai. | **10,000 प्रोफाइल देखीं।**<br>*(2.0s par cut)* **बात 2 से हुई।** | "दस हज़ार प्रोफाइल देखीं… बात सिर्फ़ दो से हुई।" |
| 2 | 3.0–6.0s | Maa ka phone, WhatsApp par forward hote biodata. Table par printed biodata ka dher. | **प्रोफाइल की कमी नहीं थी।**<br>**वजह की कमी थी।** | "कमी प्रोफाइल की नहीं थी — कमी वजह की थी।" |
| 3 | 6.0–10.0s | Subah ki dhoop, khidki ke paas ek ladka phone me bol raha hai. Screen par fields khud bharti dikhti hain. | **फ़ॉर्म नहीं। बस बोलिए।**<br>**2 मिनट में प्रोफाइल।** | "BandhanTak पे फ़ॉर्म नहीं भरते — बस बोलते हैं। दो मिनट में प्रोफाइल तैयार।" |
| 4 | 10.0–14.0s | Subah, chai ka steel glass, phone par gine-chune cards. Har card ke neeche ek chhoti line. | **रोज़ कुछ चुने हुए रिश्ते।**<br>**हज़ारों नहीं।**<br>**हर एक के साथ — क्यों।** | "AI रात भर काम करता है। सुबह कुछ चुने हुए रिश्ते — और हर एक के साथ वजह।" |
| 5 | 14.0–17.0s | Beti maa-papa ko phone dikha rahi hai, teeno screen dekh rahe hain. | **7 लेवल वेरिफिकेशन**<br>**जो verify नहीं — वो भी साफ़ लिखा।** | "सात लेवल वेरिफिकेशन। और जो verify नहीं है, वो भी छुपाया नहीं जाता।" |
| 6 | 17.0–20.0s | Cream–gold background, beech me logo. | **BandhanTak**<br>**bandhantak.com**<br>**प्रोफाइल बनाना फ्री है** | "BandhanTak — भारत का AI-guided matrimony. प्रोफाइल बनाना फ्री है।" |

**VO notes:** Female voice, 28–35, Hindi with easy English words. Rafta thoda tez (reel jaisi), par shot 4 me theher kar — wahi ad ka dil hai. Total ~60 shabd / 20s.

---

## 2. ALTERNATE HOOKS — pehle 3 second hi sab kuch hain

Ek hi baaki-ad ke saath 4 alag hook chala kar test karein. Sirf shot 1 badalta hai.

| Hook | On-screen text | Kis dard par | Kis audience par |
|---|---|---|---|
| **A. Scroll fatigue** *(default)* | 10,000 प्रोफाइल देखीं। बात 2 से हुई। | Endless scrolling | 25–32, khud khoj rahe hain |
| **B. Maa ka WhatsApp** | माँ के WhatsApp में 40 बायोडाटा हैं। सही एक भी नहीं। | Family ka bojh | 45–60, parents |
| **C. Sirf photo** | आपने प्रोफाइल नहीं — सिर्फ़ फ़ोटो देखी है। | Shallow matching | 26–34, serious seekers |
| **D. Wajah** | "ये रिश्ता क्यों?" — इसका जवाब किसी app ने दिया? | Trust gap | Sab |

---

## 3. SHORT CUT — 10 seconds (Stories / retargeting)

| Time | On-screen text | Voiceover |
|---|---|---|
| 0–3s | **10,000 प्रोफाइल। बात 2 से।** | "दस हज़ार प्रोफाइल… बात सिर्फ़ दो से।" |
| 3–7s | **रोज़ कुछ चुने हुए रिश्ते।**<br>**हर एक के साथ — क्यों।** | "BandhanTak रोज़ कुछ चुने हुए रिश्ते भेजता है — और हर एक के साथ वजह।" |
| 7–10s | **bandhantak.com · प्रोफाइल फ्री** | "प्रोफाइल बनाना फ्री है।" |

---

## 4. Caption + hashtags

```
10,000 प्रोफाइल देखने से सही रिश्ता नहीं मिलता।
सही वजह से मिलता है।

BandhanTak पे —
• फ़ॉर्म नहीं, बस बोलिए — 2 मिनट में प्रोफाइल
• रोज़ कुछ चुने हुए रिश्ते, हज़ारों नहीं — हर एक के साथ "क्यों"
• 7 लेवल वेरिफिकेशन, और जो verify नहीं वो भी साफ़ लिखा
• AI कुछ भी खुद से नहीं बनाता

प्रोफाइल बनाना फ्री है → bandhantak.com

#BandhanTak #ShaadiKiBaat #MatrimonyIndia #RishtaSearch
#IndianWedding #AIMatrimony #ShaadiSearch #VivahSanskar
```

**CTA button:** "Learn more" → `bandhantak.com` (free profile page).

---

## 5. Production brief — OpenArt se kaise banwana hai

### 5.1 Sabse sasta rasta jo achha bhi dikhta hai

Har shot ka **video** generate karna mehnga hai. Isliye:

> **6 still frames OpenArt se banaiye (9:16), aur CapCut me har frame par dheema zoom/pan (Ken Burns) laga dijiye.**

20-second reel me har shot 3–4 second ka hai — us duration me ek dheema push-in asli video jaisa hi lagta hai, aur kharcha 1/5 reh jaata hai.

### 5.2 Credit ka hisaab (OpenArt, 2026-09-14 ke daam)

| Rasta | Kya banega | Credits |
|---|---|---|
| **Still frames + CapCut motion** *(sifarish)* | 6 stills, Kling 3 Omni @ 10 cr | **60** |
| Sasta motion | upar ke 6 stills + 6 image2video (MiniMax H3 Max Turbo, 480p 5s @ 50 cr) | **360** |
| Achhi quality motion | 6 stills + 6 image2video (Veo 3.1, 1080p 4s + audio @ 120 cr) | **780** |

Ye daam default config ke hain (resolution/duration/audio badalne par daam badalta hai). **Sabse sasta koi bhi video 50 credits ka hai — 40 credits me video ban hi nahi sakta.**

### 5.3 Image prompts — copy-paste ready

Model: `kling-3-omni` · mode: `text2image` · aspect ratio: **9:16** · 10 credits each.
(Behtar chehre chahiye to `nano-banana-2-lite` — 15 cr.)

> **Zaroori:** kisi bhi prompt me text mat likhwaiye. Hindi text AI galat likhta hai, aur baad me edit bhi nahi hota. **Saara text CapCut me upar se daaliye** — crisp bhi rahega aur badalna bhi aasan.

**Shot 1 — Hook (raat ka scroll)**
```
Vertical 9:16 cinematic photograph. A 28-year-old Indian woman sits alone on her bed
at 1 AM in a modest Indian bedroom, lit only by the cold blue glow of her phone on her
tired face. Her thumb is caught mid-swipe. Behind her, soft bokeh of a ceiling fan and
a framed family photo. Muted teal-blue night palette, single practical light source,
shallow depth of field, 35mm lens, documentary realism, phone screen out of focus and
unreadable. No text, no logos, no watermark.
```

**Shot 2 — Problem (biodata ka dher)**
```
Vertical 9:16 cinematic photograph. Over-the-shoulder shot of an Indian mother in her
fifties in a cotton saree, sitting on a sofa in a warm Indian living room, holding a
phone. Beside her on the table, an untidy stack of printed marriage biodata papers and a
horoscope sheet. Warm tungsten evening light, gentle film grain, 50mm lens, documentary
realism, phone screen out of focus and unreadable. No text, no logos, no watermark.
```

**Shot 3 — Bol kar profile**
```
Vertical 9:16 cinematic photograph. A 27-year-old Indian man in a simple cotton kurta
sits by a sunlit window in an Indian home, holding his phone close to his mouth and
speaking into it with a relaxed half-smile. Soft golden morning light through a sheer
curtain falls across his face. Warm cream and marigold palette, shallow depth of field,
35mm lens, documentary realism. No text, no logos, no watermark.
```

**Shot 4 — Kuch chune hue rishte (ad ka dil)**
```
Vertical 9:16 cinematic photograph. A young Indian woman's hands hold a phone above a
small table with a steel cup of chai, morning sunlight falling in soft stripes across
the table. Unhurried, calm mood. Warm cream, marigold and soft rose palette, gentle
lens flare, 50mm lens, shallow depth of field, documentary realism, phone screen out of
focus and unreadable. No text, no logos, no watermark.
```

**Shot 5 — Bharosa aur parivaar**
```
Vertical 9:16 cinematic photograph. A young Indian woman sits on a sofa between her
mother and father, leaning in to show them something on her phone; all three look at the
screen with warm, hopeful expressions. Middle-class Indian living room, warm evening
lamp light, soft shadows, 35mm lens, documentary realism, phone screen out of focus.
No text, no logos, no watermark.
```

**Shot 6 — CTA plate (beech khaali, logo ke liye)**
```
Vertical 9:16 image. Soft cream and ivory gradient background with a delicate arc of
marigold and jasmine garland framing only the top edge, fine gold foil texture at the
corners, deep wine-coloured shadow at the very bottom. Large clean empty space in the
centre. Minimal elegant Indian wedding aesthetic, soft studio light, no people.
No text, no logos, no watermark.
```

### 5.4 Agar video generate karna ho (image2video)

Har still ko uska pehla frame banaiye aur sirf **motion** likhiye:

| Shot | Motion prompt |
|---|---|
| 1 | `The woman swipes the phone screen once with her thumb and exhales slowly; camera pushes in very slowly. Subtle handheld micro-movement.` |
| 2 | `The mother scrolls her phone and glances at the stack of papers; camera drifts slowly to the right.` |
| 3 | `The man speaks a short sentence into his phone and smiles slightly; camera pushes in gently.` |
| 4 | `Steam rises from the chai; the woman's thumb scrolls once, slowly; camera tilts up a few degrees.` |
| 5 | `All three lean closer to the phone; the mother smiles. Camera pushes in slowly.` |
| 6 | `Golden foil shimmer drifts slowly across the frame; petals fall gently at the top edge.` |

### 5.5 Edit checklist (CapCut / InShot)

- **Canvas:** 1080×1920, 30fps.
- **Safe area:** upar ~250px aur neeche ~420px Instagram ke UI se dhak jaata hai — wahan text mat rakhiye.
- **Font:** bold Devanagari (Mukta / Noto Sans Devanagari), bada size. Colour: cream text on dark shots, deep wine `#4A1119` on light shots. Gold `#C9A96E` sirf accent/underline ke liye.
- **Subtitles:** hamesha on — 85% log bina sound ke dekhte hain.
- **Music:** trending soft Indian instrumental, VO ke neeche −18 dB.
- **Cuts:** har cut beat par. Shot 4 sabse lamba (4s) — wahi yaad rehta hai.
- **Logo:** sirf aakhri 3 second me. Shuru me logo lagane se pehle 3 second ka hook mar jaata hai.

### 5.6 Disclosure

AI-generated visuals hain, isliye Meta Ads me **"AI-generated content"** wala toggle on karein aur caption me chhota sa `AI-generated visuals` likh dein. Frames me dikhe log asli members nahi hain — unhe kabhi testimonial ki tarah present na karein.

---

## 6. Kya test karna hai

| Metric | Kahan se | Target |
|---|---|---|
| 3-second hold | Instagram Insights | > 45% |
| Hook A/B/C/D winner | 4 alag ad sets, ek jaisa budget | 3 din, phir haaray hue band |
| Landing → profile start | BandhanTak funnel | > 20% |
| Profile start → live profile | `Profile Draft → Profile Ready` | > 50% |

Ye ad ka kaam profile **shuru** karwana hai, install nahi — isliye winner wahi hai jiska "profile start" sasta hai, jiska click sasta nahi.
