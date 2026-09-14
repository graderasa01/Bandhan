# -*- coding: utf-8 -*-
"""Render the product's own Rishta Reel card as a transparent PNG overlay.

Mirrors components/public/home/ReelPreview.tsx: the counter, the consent-gated
photo, the trust pills, the score ring, and — the point of the whole ad — the
reasons under the match, including the orange one that says what is NOT known.
Rendered at final size and never zoomed, so the small type stays legible.
"""
import base64, os, pathlib, subprocess

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "frames"; OUT.mkdir(exist_ok=True)
SHELL = os.environ.get("HEADLESS_SHELL",
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell")
W, H = 1080, 1920

fdir = HERE / "node_modules/@fontsource/mukta/files"
F8 = base64.b64encode((fdir / "mukta-devanagari-800-normal.woff2").read_bytes()).decode()
F7 = base64.b64encode((fdir / "mukta-devanagari-700-normal.woff2").read_bytes()).decode()
F4 = base64.b64encode((fdir / "mukta-devanagari-400-normal.woff2").read_bytes()).decode()

def ic(path, color, size=30, sw=2.6):
    return (f'<svg viewBox="0 0 24 24" width="{size}" height="{size}" fill="none" '
            f'stroke="{color}" stroke-width="{sw}" stroke-linecap="round" '
            f'stroke-linejoin="round">{path}</svg>')

CHECK = '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.77 4 4 0 0 1 0 6.76 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.77Z"/><path d="m9 12 2 2 4-4"/>'
ALERT = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
LOCK  = '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
CAP   = '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>'
HEART = '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'
XMARK = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
CHAT  = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M13 8H7"/><path d="M17 12H7"/>'
MARK  = '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>'

INK, MUTED, LINE = "#1a1512", "#6d5f50", "#e0d4c0"
GOLD, GOLDT, TRUST, WARN = "#c9a96e", "#806634", "#1f7a5a", "#96551a"

dots = "".join(
    f'<span style="width:11px;height:11px;border-radius:50%;background:{GOLD if i<2 else "#d9ccb6"}"></span>'
    for i in range(5))

pill = lambda icon, label: (
    f'<span style="display:inline-flex;align-items:center;gap:7px;background:rgba(255,253,248,.94);'
    f'border:1px solid rgba(31,122,90,.28);color:{TRUST};border-radius:999px;padding:7px 15px 8px;'
    f'font-size:19px;font-weight:700">{icon}{label}</span>')

reason = lambda icon, text, color: (
    f'<p style="display:flex;align-items:flex-start;gap:12px;margin:0;font-size:24px;'
    f'line-height:1.35;color:{color};font-weight:600"><span style="flex:0 0 auto;margin-top:2px">{icon}</span>'
    f'<span>{text}</span></p>')

action = lambda icon, label, bg, fg: (
    f'<div style="display:flex;flex-direction:column;align-items:center;gap:9px">'
    f'<span style="width:66px;height:66px;border-radius:50%;background:{bg};display:flex;'
    f'align-items:center;justify-content:center">{icon}</span>'
    f'<span style="font-size:17px;color:{MUTED};font-weight:600">{label}</span></div>')

# score ring: three arcs on one circle, as ProgressRing draws it
R, C = 62, 2 * 3.14159 * 62
ring = f'''<svg width="150" height="150" viewBox="0 0 150 150">
 <circle cx="75" cy="75" r="{R}" fill="none" stroke="#eee3d0" stroke-width="13"/>
 <circle cx="75" cy="75" r="{R}" fill="none" stroke="{TRUST}" stroke-width="13" stroke-linecap="round"
   stroke-dasharray="{C*0.91*0.33:.0f} {C:.0f}" transform="rotate(-90 75 75)"/>
 <circle cx="75" cy="75" r="{R}" fill="none" stroke="{GOLD}" stroke-width="13" stroke-linecap="round"
   stroke-dasharray="{C*0.88*0.33:.0f} {C:.0f}" transform="rotate({-90+120} 75 75)"/>
 <circle cx="75" cy="75" r="{R}" fill="none" stroke="#ddac51" stroke-width="13" stroke-linecap="round"
   stroke-dasharray="{C*0.79*0.33:.0f} {C:.0f}" transform="rotate({-90+240} 75 75)"/>
 <text x="75" y="86" text-anchor="middle" font-family="Georgia,serif" font-size="34" fill="{INK}">84%</text>
</svg>'''

html = f"""<!doctype html><meta charset="utf-8"><style>
@font-face{{font-family:'Mukta';font-weight:800;src:url(data:font/woff2;base64,{F8}) format('woff2')}}
@font-face{{font-family:'Mukta';font-weight:700;src:url(data:font/woff2;base64,{F7}) format('woff2')}}
@font-face{{font-family:'Mukta';font-weight:400;src:url(data:font/woff2;base64,{F4}) format('woff2')}}
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:transparent;
  font-family:'Mukta',sans-serif;-webkit-font-smoothing:antialiased}}
.card{{position:absolute;left:96px;right:96px;top:33%;background:#fffdf8;border:1px solid {LINE};
  border-radius:22px;overflow:hidden;box-shadow:0 40px 90px rgba(26,21,18,.34),0 8px 24px rgba(26,21,18,.18)}}
.stk{{position:absolute;background:rgba(255,253,248,.55);border:1px solid {LINE};border-radius:22px;height:120px}}
</style>
<div class="stk" style="left:132px;right:132px;top:calc(33% - 26px)"></div>
<div class="stk" style="left:114px;right:114px;top:calc(33% - 13px);background:rgba(255,253,248,.8)"></div>
<div class="card">
  <div style="display:flex;align-items:center;justify-content:space-between;
       padding:20px 26px;border-bottom:1px solid {LINE}">
    <span style="font-size:23px;font-weight:800;color:{INK}">आज के लिए 5 रिश्ते</span>
    <span style="display:flex;gap:7px">{dots}</span>
  </div>

  <div style="position:relative;height:300px;
       background:linear-gradient(135deg,#f3dfe0 0%,#f7e6c8 52%,#eadcc2 100%);
       display:flex;align-items:center;justify-content:center">
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center">
      <span style="width:70px;height:70px;border-radius:50%;background:rgba(255,253,248,.88);
        display:flex;align-items:center;justify-content:center">{ic(LOCK,MUTED,32)}</span>
      <span style="font-size:20px;line-height:1.35;color:#6b5340;max-width:330px;font-weight:600">
        फ़ोटो mutual interest के बाद दिखेगी</span>
    </div>
    <div style="position:absolute;left:20px;top:20px;display:flex;gap:10px">
      {pill(ic(CHECK,TRUST,20,2.4),'ID')}{pill(ic(CAP,TRUST,20,2.4),'Education')}
    </div>
  </div>

  <div style="padding:26px 26px 22px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px">
      <div>
        <p style="margin:0;font-size:38px;font-weight:800;color:{INK};line-height:1.1">प्रिया, 27</p>
        <p style="margin:4px 0 0;font-size:23px;color:{MUTED};font-weight:600">दिल्ली · MBA</p>
        <p style="margin:2px 0 0;font-size:23px;color:{MUTED};font-weight:600">Marketing Manager</p>
      </div>
      {ring}
    </div>
    <div style="margin-top:22px;padding-top:20px;border-top:1px solid {LINE};
         display:flex;flex-direction:column;gap:13px">
      {reason(ic(CHECK,TRUST,26,2.4),'City preference match करती है',INK)}
      {reason(ic(CHECK,TRUST,26,2.4),'दोनों ने family bonding को priority चुना',INK)}
      {reason(ic(ALERT,WARN,26,2.4),'Relocation preference अभी unanswered है',WARN)}
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:18px 14px;
       border-top:1px solid {LINE};background:#f7f1e6">
    {action(ic(XMARK,MUTED,26),'अभी नहीं','#fffdf8',MUTED)}
    {action(ic(CHAT,GOLDT,26),'AI से पूछो','#f3e6c9',GOLDT)}
    {action(ic(MARK,'#2b6cb0',26),'Shortlist','#e3eef8','#2b6cb0')}
    {action(ic(HEART,'#2e2413',26),'Interest',GOLD,'#2e2413')}
  </div>
</div>"""

src = OUT / "card4.html"; src.write_text(html, encoding="utf-8")
subprocess.run([SHELL, "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                "--force-device-scale-factor=1", f"--window-size={W},{H}",
                "--default-background-color=00000000", "--virtual-time-budget=5000",
                f"--screenshot={OUT / 'card4.png'}", "file://" + str(src)],
               capture_output=True)
p = OUT / "card4.png"
print("card4.png", p.stat().st_size if p.exists() else "MISSING")
