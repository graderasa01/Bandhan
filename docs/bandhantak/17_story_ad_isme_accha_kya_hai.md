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
| `art/reasons.png` | Phone, jisme match ke neeche teen wajah likhi hain | **Jawab** — ad ka dil |
| `art/family.png` | Maa aur beti sofa par, ek screen dekhte hue | Jawab ka matlab — samajh kar aage badhna |
| `art/trust.png` | Trust score, 7 level, aur "Government ID — Not verified yet" | Sabse bold hissa: jo pata nahi wo bhi likha |

### Teenon poster poore istemaal hote hain

`reasons.png`, `trust.png` aur `family.png` — teenon me apni headline pehle se
hai, apne type me, apne rang me. Isliye builder unhe **bina kaate** use karta
hai aur unke upar apni koi line nahi lagata: ek hi baat do typeface me do baar
kehna sabse aam galti hai.

Caption sirf narrator ke do frames par aate hain, kyunki unme koi text hai hi
nahi.

> **"Roz 5 rishtey" par faisla:** ye rehne diya gaya hai. Ye daawa **Basic
> (₹999)** plan ke liye sach hai — `lib/constants/plans.ts` me us plan ka
> `reelPerDay` 5 hai, aur aapke apne pricing page par Basic ke neeche yahi
> likha hai. Dhyan sirf itna rakhein ki ad kahin ye na kehti ho ki ye free
> plan par milta hai (FREE par 3 hai).

---

## 2. Shot by shot

**Format:** 1080×1920 · 26 second · Hindi VO + Roman Hinglish captions

| # | Time | Tasveer | Framing | Camera | Screen par | Voiceover |
|---|---|---|---|---|---|---|
| 1 | 0.0–2.6 | narrator | sar aur kandhe | push in | **Isme accha kya hai?** | "Har ghar me ek sawaal poocha jaata hai… isme accha kya hai? Aur jawab milta hai — accha rishta hai. Bas itna." |
| 2 | 2.6–5.2 | reasons | poora poster | khulta hua | Roz 5 rishtey. Hazaaron nahi. | "BandhanTak roz paanch rishtey bhejta hai, hazaaron nahi — aur har ek ke saath wajah." |
| 3 | 5.2–7.6 | reasons | **sirf phone** | halki chaal | teeno wajah — narangi wali sameet | *(upar wali line yahan tak chalti hai)* |
| 4 | 7.6–10.0 | trust | poora poster | pull back | AI guided. Bharosa verified. | "Saat level verification." |
| 5 | 10.0–12.4 | trust | **82% aur badges** | push in | Government ID — Not verified yet | "Aur jo verify nahi hua, wo bhi chhupaya nahi jaata." |
| 6 | 12.4–14.6 | family | **dono chehre** | halki chaal | — | "Isiliye rishta sirf dekha nahi jaata." |
| 7 | 14.6–16.8 | family | poora poster | pull back | Rishta sirf dekho nahi. | *(upar wali line yahan tak)* |
| 8 | 16.8–19.6 | narrator | poora | lagbhag sthir | **bandhantak.com · Registration free hai** | "BandhanTak. Samajh kar aage badhaya jaata hai. Profile banana free hai." |

**Kul 18.9 second.** Foil sweep sirf do act-break par: shot 3→4 aur 5→6.

**Cuts:** 3→4 aur 4→5 par **dissolve** (bhaav wale jod), 1→2 aur 2→3 par
**hard cut** (jankari wale jod). Ye farq hi ad ko ad jaisa banata hai.

**VO:** aurat, 30–38, garm aur theheri hui — jaldi me nahi. Shot 3 me thoda
ruk kar, kyunki wahi ad ka matlab hai. Kul ~62 shabd / 26 second.

---

### Poster ko drishya maano, shot nahi

Pehla version paanch poore poster ek ke baad ek dikhata tha. Wo carousel thi,
kahani nahi: har poster apne aap me poori rachna hai, to ad me **paanch ant**
the aur ek bhi arc nahi. Ab har poster **do baar** aata hai — ek baar poora
(headline padhne ke liye), ek baar andar se (sabooot dekhne ke liye). Wahi
sabse bada farq hai.

Close-up 60% se zyada tang nahi hain: 941px chaudi tasveer ko 2x se zyada
kheenchne par phone par dhundhlapan dikhne lagta hai — tab close-up jitna deta
hai usse zyada le leta hai.

Aur har crop ka kinara **saaf jagah par** girta hai. Pehle teenon close-up
kisi na kisi line ke beech se kat rahe the, jisse upar aadha vaakya latka rehta
tha — wo galti lagti hai, chahe peeche ka shot kitna hi achha ho.

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

Tasveer ka naam, shot ki lambai, camera ki chaal, caption aur uski jagah —
sab `SHOTS` me hai, `build-story-ad.py` ke upar. Kisi image ka koi hissa
kaatna ho to `crop` wahin hai (abhi sab `(0,0,0,0)` — kuch nahi kata).

---

## 5. Daawon ki hadd — is ad par bhi wahi

- Jo ginti bolein wo kisi plan par sach honi chahiye — "roz 5" Basic par sach hai.
- Koi shaadi ki guarantee nahi.
- Tasveeron ke log **member nahi hain**. Narrator brand ki awaaz hai; uski apni
  koi kahani nahi hai aur wo kabhi ye nahi kahegi ki uska rishta yahan se hua.
- AI se bani tasveerein hain — Meta Ads me AI-generated toggle on.
