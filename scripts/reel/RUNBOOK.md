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
| *(optional)* **NVIDIA GPU** | narrator ke honth hilane ho to tez chalta hai (§5); bina GPU CPU par dheema chalta hai |

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

## 5. Narrator ke honth hilane hain? (optional — GPU ho to tez)

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

**Story ad me take kaise lagta hai.** `build-story-ad.py` ko `talk/story0.mp4`
aur `talk/story4.mp4` mil jaayein to narrator ke dono shot usi clip par bante
hain, warna tasveer par. Take ki teen shartein hain:

1. line se pehle **0.25s chuppi** — wahi beat jo awaaz ka cue chhodta hai,
2. wahi framing — `art/narrator.png` 1080×1920 par, bina crop,
3. **koi chaal nahi** — camera ki chaal build khud lagata hai.

`lipsync.py run` abhi pehli aur teesri shart todta hai (lead nahi deta, motion
pass lagata hai), isliye uska output seedha story ad me mat daaliye.

**GPU nahi hai to MuseTalk 1.5 CPU par bhi chalta hai** — dheema, par chalta
hai. Laptop (i7 11th gen, 32 GB, WSL Ubuntu) par dono takes ~17 minute.
Nuskha jo chala:

- Python **3.10** (uv se), `torch==2.0.1` CPU wheel
- `mmcv==2.0.1` OpenMMLab ke `cpu/torch2.0` wheel index se — source build nahi
- `mmpose==1.1.0` `--no-deps` ke saath (uski `chumpy` dependency build nahi hoti)
- `setuptools==69.5.1` — venv me `pkg_resources` na ho to mmengine import par gir jaata hai
- weights sirf v1.5 inference ke: `musetalkV15/unet.pth`, `sd-vae`, `whisper-tiny`, DWPose, face-parse
- input: 16 kHz mono wav (`adelay=250:all=1,apad=pad_dur=0.6`) aur 1080×1920 portrait —
  art 941px chaudi hai, aur odd chaudai H.264 (yuv420p) me encode nahi hoti

Image input par MuseTalk take save karne ke baad `save_dir_full` wala error
chhapta hai; take sahi hota hai. **Wav2Lip mat lijiye** — uske weights
non-commercial hain, aur ye ad commercial hai. **Awaaz badli to take dobara
banana padega.**

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

**2026-09-15 ko laptop par (Windows 11 + WSL, bina GPU) bhi chalaya:** Sarvam
ki asli call (paanchon line + audition), poori ad, aur MuseTalk 1.5 se CPU par
lip-sync. Scripts Windows par bina badle chale — bas `HEADLESS_SHELL` Playwright
ke `chrome-headless-shell.exe` par, aur `PYTHONUTF8=1`. Us run ne ek bug pakda:
awaaz se khinche shots par xfade film ko 5.3s par kaat deta tha, jabki file
awaaz ki wajah se 20.9s batati thi. Theek ho gaya, aur build ab picture ki
lambai alag se jaanchta hai.

**Ab bhi kahin nahi chalaya gaya:** ElevenLabs ki asli call, aur GPU wala
raasta — `lipsync-setup.sh` aur `lipsync.py run`.

Iska matlab: **§5 ka GPU raasta pehli baar chalane par ek-do sudhaar maang
sakta hai.** Jo error aaye, wo bhej dijiye — theek kar diya jayega. §2, §3, §4
aur §6 chal chuke hain.
