# "Isme accha kya hai?" — 26-second story ad

**Document Type:** Shooting/assembly script for the ad built from the four supplied stills
**Status:** v1.0 · 2026-09-14
**Builder:** `scripts/reel/build-story-ad.py`
**Companion:** `16_ad_story_concepts.md` (Kahani A, jiska ye chhota roop hai)

---

## 0. Ad ka dhaancha

Ek sawaal. Ek khaali jawab. Phir wo jawab jo pehli baar likha hua milta hai.

```
Sawaal  ->  Khaali jawab  ->  Likha hua jawab  ->  Aur jo pata nahi  ->  Bulawa
narrator    maa-beti          phone / wajah        trust panel           narrator
```

Ye kahani isliye kaam karti hai ki iska turning point **product ka apna
feature** hai — wo narangi line jo kehti hai ki ye abhi pata nahi. Koi doosri
matrimony company ye ad nahi bana sakti, kyunki unke paas wo line hai hi nahi.

---

## 1. Chaar tasveerein, aur har ek ka kaam

| File | Aapki tasveer | Ad me kaam |
|---|---|---|
| `art/narrator.png` | Cream kurta wali, haath khule, seedha camera me | Sawaal poochti hai, aur aakhir me bulaati hai |
| `art/family.png` | Maa aur beti sofa par, ek screen dekhte hue | Wo pal jab sawaal poocha jaata hai |
| `art/reasons.png` | Phone, jisme match ke neeche teen wajah likhi hain | **Jawab** — ad ka dil |
| `art/trust.png` | Trust score, 7 level, aur "Government ID — Not verified yet" | Sabse bold hissa: jo pata nahi wo bhi likha |

### `reasons.png` ke baare me ek zaroori baat

Us poster par upar **"Roz 5 rishtey"** likha hai. Wo daawa galat hai —
`lib/constants/plans.ts` me `reelPerDay` FREE par **3** hai, aur ad naye log
FREE par hi laati hai. Isliye builder us poster ka sirf **phone wala hissa**
kaatta hai (`crop` setting se) aur uske upar apni line lagata hai, jo file me
badal sakti hai.

> **Behtar hoga ki wo poster dobara banwa lein**, is headline ke saath:
> **"Har match ke saath — wajah."** / "Kya match karta hai — aur kya check karna chahiye."
> Phone ke andar bhi card par "Aaj ke liye 5 rishtey" likha hai; usay
> "Aaj ke liye aapke rishtey" kar dein to poster har jagah istemaal ho sakega.

### `reasons.png` dobara banwane ka prompt

ChatGPT me pehli image wapas daaliye aur ye kahiye — isse chehra, phone aur
poora andaaz wahi rahega, sirf galat daawa hat jayega:

```
Keep this exact layout, phone, colours, lighting and the mascot — change only
the text. Replace the headline "Roz 5 rishtey. Hazaaron nahi." with
"Har match ke saath — wajah." on one line, in the same deep wine and gold
treatment. Replace the sub-line with
"Kya match karta hai — aur kya check karna hai."
Inside the phone, change the card's top row from "Aaj ke liye 5 rishtey" to
"Aaj ke liye aapke rishtey". Keep the three reason rows exactly as they are,
including the orange "Relocation preference abhi unanswered hai".
```

Wo naya poster bina kisi crop ke poora istemaal ho sakega — tab
`build-story-ad.py` me us shot ka `crop` `(0, 0, 0, 0)` kar dijiye.

---

## 2. Shot by shot

**Format:** 1080×1920 · 26 second · Hindi VO + Roman Hinglish captions

| # | Time | Tasveer | Camera | Caption (Poppins) | Voiceover |
|---|---|---|---|---|---|
| 1 | 0.0–5.0 | narrator | Dheema push in | *(koi nahi — use bolne dijiye)* | "Har ghar me ek sawaal poocha jaata hai… 'isme accha kya hai?'" |
| 2 | 5.0–9.5 | family | Halka push, warm | **"Aur jawab milta hai — 'accha rishta hai.'"** | "Aur jawab milta hai — accha rishta hai. Bas itna." |
| 3 | 9.5–15.5 | reasons | Upar se neeche, teen wajah par | **"Har match ke saath — wajah."** | "BandhanTak har match ke saath wajah likh kar deta hai. Kya match karta hai — aur kya aapko check karna chahiye." |
| 4 | 15.5–21.0 | trust | Dheema pull back | **"Jo verify nahi hua — wo bhi saaf."** | "Jo verify ho gaya, wo bhi dikhta hai. Aur jo abhi nahi hua — wo bhi." |
| 5 | 21.0–26.0 | narrator | Sthir, garm | **bandhantak.com**<br>**Registration free hai** | "BandhanTak. Rishta sirf dekha nahi jaata — samajh kar aage badhaya jaata hai." |

**Cuts:** Shot 1→2 aur 4→5 par **dissolve** (bhaav wale jod), 2→3 aur 3→4 par
**hard cut** (jankari wale jod). Ye farq hi ad ko ad jaisa banata hai.

**VO:** aurat, 30–38, garm aur theheri hui — jaldi me nahi. Shot 3 me thoda
ruk kar, kyunki wahi ad ka matlab hai. Kul ~62 shabd / 26 second.

---

## 3. Jo is ad me jaan daalta hai

Ye teen cheezein `build-story-ad.py` karta hai, aur inhi se ad "AI se bani
slideshow" jaisi nahi lagti:

1. **Har shot ki apni chaal.** Narrator par push in (paas bulana), family par
   halki chaal (chhedna nahi), reasons par upar-se-neeche (padhne jaisa),
   trust par pull back (poora dikhana). Ek hi zoom sab par lagana sabse aam
   AI-video ki nishani hai.
2. **Padhne wali chaal.** Shot 3 me camera teen wajah par neeche sarakta hai —
   darshak ki aankh wahi karti hai jo wo app me karega.
3. **Foil wipe.** Act badalte waqt brand ka sona (`--bt-grad-foil`) ek pal ke
   liye guzarta hai. Do jagah — 2→3 aur 4→5. Zyada karne par saste lagta hai.

---

## 4. Kaise banayein

```bash
cd scripts/reel
mkdir -p art
# chaaron tasveerein in naamon se rakhiye:
#   art/narrator.png  art/family.png  art/reasons.png  art/trust.png

export ELEVENLABS_API_KEY=...  ELEVENLABS_VOICE_ID=...
python3 make-vo-clips.py --set story      # is ad ki paanch lines
python3 build-story-ad.py music.mp3       # -> bandhantak-story-ad.mp4
```

Tasveer ke naam ya crop badalna ho to `SHOTS` `build-story-ad.py` me hai —
har shot ki lambai, chaal, caption aur crop ek hi jagah.

---

## 5. Daawon ki hadd — is ad par bhi wahi

- Koi ginti nahi (`reelPerDay` plan ke saath badalta hai — FREE par 3).
- Koi shaadi ki guarantee nahi.
- Tasveeron ke log **member nahi hain**. Narrator brand ki awaaz hai; uski apni
  koi kahani nahi hai aur wo kabhi ye nahi kahegi ki uska rishta yahan se hua.
- AI se bani tasveerein hain — Meta Ads me AI-generated toggle on.
