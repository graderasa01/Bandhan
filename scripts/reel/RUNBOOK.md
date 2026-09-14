# Local runbook — BandhanTak ad banane ka poora tareeka

Ye file akeli kaafi hai. Isme jo likha hai wo kar lene par ad ban jaati hai.
Har command apne local computer par chalani hai — **Claude Code ka cloud sandbox
ye nahi chala sakta**, aur kyun nahi, wo §7 me hai.

Ad ka script aur shot table: `docs/bandhantak/17_story_ad_isme_accha_kya_hai.md`

---

## 0. Kya chahiye

| | Kyun |
|---|---|
| **Python 3.9+** | saare build script Python me hain |
| **Node 18+** | sirf `ffmpeg-static` aur fonts laane ke liye |
| **Git** | repo aur usme padi art/ |
| **Sarvam API key** | awaaz ke liye — dashboard.sarvam.ai |
| *(optional)* **NVIDIA GPU** | sirf tab jab narrator ke honth hilane hain (§5) |

macOS, Linux, ya Windows par WSL — teenon chalte hain. Bina WSL wale Windows
par headless Chromium ka path alag hota hai; `HEADLESS_SHELL` set karke
chalayein (§7).

---

## 1. Repo aur deps

```bash
git clone https://github.com/graderasa01/Bandhan.git
cd Bandhan/scripts/reel
npm i ffmpeg-static @fontsource/poppins @fontsource/inter
```

Teen cheezein aati hain: poora ffmpeg (H.264 ke saath), aur Poppins + Inter —
wahi do typeface jo app khud load karti hai (`app/layout.tsx`), taaki ad aur
site ek jaisi dikhein.

npm inhe kahan rakhta hai isse farak nahi padta. Is folder me `package.json`
nahi hai, isliye npm upar chadh kar repo ki jad me install karega — aur script
`node_modules` ko yahan se shuru karke upar tak dhoondhti hai. Dono soorat me
chalega.

> **Bundled ffmpeg kaam nahi karega.** Playwright ke saath jo ffmpeg aata hai wo
> `--disable-everything` se bana hai: na libx264, na audio. Isiliye
> `ffmpeg-static`. Apna ffmpeg use karna ho to `export FFMPEG=/usr/bin/ffmpeg`.

Chaaron tasveerein `art/` me pehle se repo me hain — `narrator.png`,
`reasons.png`, `trust.png`, `family.png`. Kuch download nahi karna.

---

## 2. Awaaz — Sarvam

```bash
export SARVAM_API_KEY=<apni key>
```

**Pehle awaaz chun lijiye** (chaahein to; default `shreya` hai):

```bash
python3 make-vo-clips.py --audition
```

Sabse lambi line chhe awaazon me ban kar `vo/audition/` me aa jaayegi —
`shreya, priya, neha, kavya, ritu, ishita`. **Sun kar** chuniye.

> Default `shreya` isliye hai ki `lib/speech/voiceCatalog.ts` me likha hai ki
> aapki team ne priya/neha/kavya/shreya sun kar usay chuna tha, aur wahi app ki
> assistant awaaz hai. Ad aur app ek jaisi sunai dein — ye kisi nayi raay se
> zyada keemti hai.

**Phir paanchon line banaiye:**

```bash
python3 make-vo-clips.py --set story                  # shreya
python3 make-vo-clips.py --set story --voice priya    # ya koi aur
```

`vo/story0.mp3` se `story4.mp3` ban jaayengi, aur har ek ki lambai chhap kar
aayegi.

---

## 3. Ad banaiye

```bash
python3 build-story-ad.py                 # bina music
python3 build-story-ad.py music.mp3       # music ke saath
```

`bandhantak-story-ad.mp4` — 1080×1920, ~21 second, Instagram par seedha upload
hone laayak.

**Jo chhap kar aaye usay padhiye.** Agar ye dikhe:

```
story2: take is 6.32s — segment stretched 4.80s -> 6.92s
```

matlab wo line apni tasveeron se lambi thi, aur film uske liye khinch gayi.
**Ek-do baar theek hai. Teen-chaar baar aaye to script badh gayi hai, film
nahi** — line chhoti kijiye (`make-vo-clips.py` me `STORY`), film ko mat
badhne dijiye. ~41 shabd par film 21 second par baithti hai; usse zyada shabd
matlab lamba reel, aur lamba reel matlab scroll.

---

## 4. Kuch badalna ho

Sab kuch do file me hai. Kahin aur haath lagane ki zaroorat nahi.

| Kya badalna hai | Kahan |
|---|---|
| Bolne wali lines | `make-vo-clips.py` → `STORY` |
| Shot ki lambai | `build-story-ad.py` → `SHOTS` → `secs` |
| Camera ki chaal | `SHOTS` → `move` (`push` / `pull` / `drift` / `read` / `hold`) |
| Tasveer ka kaunsa hissa | `SHOTS` → `crop` = (baayen, upar, daayen, neeche) katne ke hisse |
| Screen par likha text | `SHOTS` → `cap`, `cap_top`, `cap_size` |
| Sona chamakne ki jagah | `FOIL_AFTER` |
| Nayi tasveer | `art/` me daal kar `SHOTS` me naam likh dijiye |

**Crop ke do niyam** (dono galtiyan ho chuki hain, isliye likhe hain):

1. **Kinara hamesha khaali jagah par giraiye, kisi line ke beech se nahi.**
   Warna upar aadha vaakya latka reh jaata hai — wo galti lagti hai chahe
   peeche ka shot kitna hi achha ho.
2. **54% se zyada tang mat kijiye.** Tasveer 941px chaudi hai; usse zyada
   kheenchne par phone par dhundhlapan dikhta hai, aur close-up jitna deta hai
   usse zyada le leta hai.

Har shot ki apni chaal rakhiye. **Ek hi zoom sab par lagana — yahi sabse aam
nishani hai ki video AI ne banayi hai.**

---

## 5. Narrator ke honth hilane hain? (optional, GPU chahiye)

Ye tab hai jab aap chahte hain ki narrator camera me **bolti dikhe**. Iske bina
bhi ad poori hai — abhi wali ad me wo sirf dikhti hai, bolti nahi.

```bash
python3 lipsync.py doctor          # aapka GPU aur kaun sa model fit hai
./lipsync-setup.sh musetalk        # ~8 GB VRAM, sabse tez — yahin se shuru
```

Phir us repo ke apne README ke hisaab se uske weights laaiye, aur:

```bash
python3 lipsync.py run --image art/narrator.png \
    --audio vo/story0.mp3 --out talk/talk1.mp4
```

| Model | VRAM | |
|---|---|---|
| **musetalk** | ~8 GB | sabse tez, achhi detail — yahin se shuru |
| latentsync | ~20 GB | sabse achhi quality; ByteDance ki, Seedance wali lab se |
| wav2lip | ~4 GB | sabse halka, sabse maaf karne wala |

`lipsync.py run` teen kaam ek saath karta hai: sthir clip banata hai, model
chalata hai, phir chaal wapas lagata hai. **Ye kram maayne rakhta hai** — ye
model chehra track karte hain, to chaal pehle lagane par wo camera se ladte
rahenge aur fayda kuch nahi.

**Flag badal jaayein to** `lipsync.json` me ek line theek kijiye — sirf wahin
command likhi hai. Ye repos release ke beech apne entrypoint ka naam badalte
rehte hain.

> ⚠️ Narrator kabhi ye na kahe ki wo member hai. "Mujhe mera rishta yahan mila"
> ek jhooti gawaahi hai — Meta aur ASCI dono me galat, aur jis brand ka saamaan
> hi bharosa hai uske liye aatmghaati. Wo brand ki awaaz hai, uski apni kahani
> nahi. Meta Ads me "AI-generated content" toggle on rakhiye.

---

## 6. Doosri ad — asli site ke pages

Ye alag cut hai: aapki website ke asli page, phone ke andar scroll hote hue.

```bash
cd ../..            # repo ki jad
npm install
# .env me DATABASE_URL set kijiye, phir:
npx prisma migrate deploy && npm run db:seed
npm run dev                                  # dusre terminal me chhod dijiye

cd scripts/reel
python3 capture-pages.py        # asli page -> pages/
python3 build-pages-ad.py       # -> bandhantak-pages-ad.mp4
```

Sirf public page liye jaate hain. Login ke peeche kuch nahi — ad me kisi asli
member ka data kabhi nahi jaana chahiye.

---

## 7. Jo galat ho sakta hai

| Dikhega | Matlab |
|---|---|
| `No ffmpeg. npm i ffmpeg-static here` | §1 wala `npm i` is folder me nahi chala |
| `Could not reach api.sarvam.ai` | key galat nahi hai — wo host pahunch me nahi hai. Kisi proxy/firewall ke peeche ho to wahan se nahi chalega |
| `Sarvam 401` / `403` | key hi galat ya expire |
| `Missing …/art/narrator.png` | galat folder se chalaya — `scripts/reel` ke andar se chalaiye |
| Hindi ki jagah khaali dabbe | Poppins/Inter install nahi hue; `npm i` dobara |
| Chromium nahi mila | `export HEADLESS_SHELL=/path/to/headless_shell` (ya Chrome ka binary) |
| Video to bani par awaaz nahi | `vo/story0.mp3` … `story4.mp3` maujood nahi. §2 pehle chalaiye |
| ffmpeg bahut dhima | normal hai agar CPU kam hain. Intermediates pehle hi `veryfast` par hain |

**Sabse zaroori ek baat:** Claude Code ka cloud sandbox koi bhi hosted awaaz
nahi bana sakta — ElevenLabs, Sarvam, Google, Microsoft, HuggingFace, **sab 403
dete hain**. Wo network policy hai, key ki dikkat nahi. Isiliye awaaz wala
kadam hamesha aapke computer par hoga. Tasveer wala kadam wahan bhi chalta hai.

---

## 8. Kya chala kar dekha gaya hai, kya nahi

Seedhi baat, taaki pehli baar chalane par ummeed sahi rahe.

**Chala kar dekha gaya (asli art par, frame-by-frame):** tasveerein render
hona, saare camera move, crop, join ka hisaab, caption ki jagah, foil sweep,
awaaz ka shot se judna aur segment ka khinchna, aur poori file banna — 1080×1920
H.264 + AAC.

**Kahin nahi chalaya gaya:** Sarvam ki asli call, ElevenLabs ki asli call,
lip-sync setup ka clone/pip, aur lip-sync khud. In teenon ko wo host chahiye jo
sandbox nahi deta, aur GPU jo sandbox me hai hi nahi.

Iska matlab: **§2 aur §5 pehli baar chalane par ek-do sudhaar maang sakte
hain.** Jo error aaye, wo bhej dijiye — theek kar diya jayega. §3, §4 aur §6
chal chuke hain.
