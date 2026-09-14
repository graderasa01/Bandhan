# -*- coding: utf-8 -*-
"""Drive a local lip-sync model end to end: still portrait + voice -> talking shot.

    python3 lipsync.py doctor
    python3 lipsync.py run --image face.png --audio vo/talk1.mp3 --out talk/talk1.mp4

`run` does the whole thing: renders the portrait to the steady clip these models
want, calls whichever backend is installed, then puts the drift back on. The
backend command lives in BACKENDS below and in `lipsync.json` beside this file —
these repos rename their entrypoints between releases, so `doctor` prints what
it found and you correct the command once, in one place, rather than in a
pipeline that has it baked in.

Nothing here calls a paid API. On a GPU you own a shot costs nothing; the same
shot on OpenArt is 560 credits at 720p/8s, 1600 at 1080p/8s.
"""
import argparse, json, os, pathlib, shutil, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
CONF = HERE / "lipsync.json"
PREP = HERE / "prep-portrait.py"

# {tokens} are filled in by `run`. Treat every command as a starting point and
# check it against that repo's own README — they move, and this file cannot.
BACKENDS = {
    "musetalk": {
        "repo": "https://github.com/TMElyralab/MuseTalk",
        "detect": ["scripts/inference.py", "configs"],
        "vram_gb": 8,
        "note": "Fastest of the three. Good mouth detail, real-time-ish on a modern card.",
        "cmd": ["python3", "-m", "scripts.inference",
                "--inference_config", "configs/inference/test.yaml",
                "--video_path", "{video}", "--audio_path", "{audio}",
                "--result_dir", "{outdir}"],
    },
    "latentsync": {
        "repo": "https://github.com/bytedance/LatentSync",
        "detect": ["scripts/inference.py"],
        "vram_gb": 20,
        "note": "Best quality. ByteDance's own — the lab behind Seedance. Heaviest.",
        "cmd": ["python3", "-m", "scripts.inference",
                "--video_path", "{video}", "--audio_path", "{audio}",
                "--video_out_path", "{out}"],
    },
    "wav2lip": {
        "repo": "https://github.com/Rudrabha/Wav2Lip",
        "detect": ["inference.py"],
        "vram_gb": 4,
        "note": "Lightest and most forgiving. Softer around the mouth; pair with a face restorer.",
        "cmd": ["python3", "inference.py", "--checkpoint_path", "{checkpoint}",
                "--face", "{video}", "--audio", "{audio}", "--outfile", "{out}"],
    },
}

def conf():
    return json.loads(CONF.read_text(encoding="utf-8")) if CONF.exists() else {}

def gpu():
    """(name, total VRAM in GB) or None."""
    if not shutil.which("nvidia-smi"):
        return None
    r = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total",
                        "--format=csv,noheader,nounits"],
                       capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        return None
    name, mem = r.stdout.strip().splitlines()[0].split(",")
    return name.strip(), int(mem) / 1024

def ffmpeg():
    if os.environ.get("FFMPEG"):
        return os.environ["FFMPEG"]
    r = subprocess.run(["node", "-p", "require('ffmpeg-static')"],
                       cwd=HERE, capture_output=True, text=True)
    if r.returncode == 0 and r.stdout.strip():
        return r.stdout.strip()
    return shutil.which("ffmpeg")

def installed(c):
    """Backends whose directory is configured and actually looks like the repo."""
    found = {}
    for name, b in BACKENDS.items():
        root = c.get(name, {}).get("dir") or os.environ.get(f"{name.upper()}_DIR")
        if not root:
            continue
        root = pathlib.Path(root).expanduser()
        if root.is_dir() and all((root / p).exists() for p in b["detect"]):
            found[name] = root
    return found

def doctor():
    print("== machine ==")
    g = gpu()
    print(f"GPU        : {g[0]} · {g[1]:.1f} GB VRAM" if g else
          "GPU        : none found (nvidia-smi missing or no device)")
    try:
        import torch
        print(f"torch      : {torch.__version__} · cuda={torch.cuda.is_available()}")
    except ImportError:
        print("torch      : not installed (each backend installs its own, in its venv)")
    ff = ffmpeg()
    print(f"ffmpeg     : {ff or 'MISSING — npm i ffmpeg-static here, or set $FFMPEG'}")
    print(f"python     : {sys.version.split()[0]}")

    c = conf()
    have = installed(c)
    print("\n== backends ==")
    for name, b in BACKENDS.items():
        where = have.get(name)
        mark = f"installed at {where}" if where else "not configured"
        print(f"{name:11}: {mark}")
        print(f"{'':11}  needs ~{b['vram_gb']} GB · {b['note']}")

    print("\n== verdict ==")
    if not g:
        print("No GPU here, so lip-sync cannot run on this machine. Everything else")
        print("in this folder (voice, page capture, assembly) runs fine without one.")
        return 1
    fits = [n for n, b in BACKENDS.items() if g[1] >= b["vram_gb"]]
    if have:
        print(f"Ready: {', '.join(have)}.  Run:  python3 lipsync.py run --image face.png "
              f"--audio vo/talk1.mp3 --out talk/talk1.mp4")
        return 0
    print(f"{g[1]:.0f} GB fits: {', '.join(fits) if fits else 'nothing here'}.")
    print("Install one with ./lipsync-setup.sh <backend>, then re-run doctor.")
    return 1

def run(args):
    c = conf()
    have = installed(c)
    if not have:
        raise SystemExit("No backend configured. Run `python3 lipsync.py doctor`.")
    name = args.backend or next(iter(have))
    if name not in have:
        raise SystemExit(f"{name} is not configured. Configured: {', '.join(have)}")
    root = have[name]

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    still = out.with_name(out.stem + "_still.mp4")
    raw = out.with_name(out.stem + "_raw.mp4")

    # 1. steady clip at exactly the take's length — these models track a face
    subprocess.run([sys.executable, str(PREP), "prep", args.image, args.audio, str(still)],
                   check=True)

    # 2. the backend, with its command from config so a renamed flag is a one-line fix
    tmpl = c.get(name, {}).get("cmd") or BACKENDS[name]["cmd"]
    outdir = raw.parent / f"{name}_out"; outdir.mkdir(parents=True, exist_ok=True)
    subs = {"video": str(still.resolve()), "audio": str(pathlib.Path(args.audio).resolve()),
            "out": str(raw.resolve()), "outdir": str(outdir.resolve()),
            "checkpoint": c.get(name, {}).get("checkpoint", "checkpoints/wav2lip_gan.pth")}
    cmd = [t.format(**subs) for t in tmpl]
    print("running:", " ".join(cmd), f"\n  (cwd {root})")
    r = subprocess.run(cmd, cwd=root)
    if r.returncode != 0:
        raise SystemExit(f"{name} exited {r.returncode}. Check its command in {CONF.name} "
                         f"against that repo's README — entrypoints and flags move.")

    # Backends that write into a directory rather than the path we asked for.
    if not raw.exists():
        made = sorted(outdir.rglob("*.mp4"), key=lambda p: p.stat().st_mtime)
        if not made:
            raise SystemExit(f"{name} produced no mp4 in {outdir}.")
        shutil.copy(made[-1], raw)

    # 3. drift back on, after the sync — never before
    subprocess.run([sys.executable, str(PREP), "motion", str(raw), str(out)], check=True)
    print(f"\n{out} — drop it in talk/ and run build-narrator-ad.py")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("doctor", help="what this machine has, and which backend fits")
    r = sub.add_parser("run", help="portrait + voice -> talking shot")
    r.add_argument("--image", required=True)
    r.add_argument("--audio", required=True)
    r.add_argument("--out", required=True)
    r.add_argument("--backend", choices=list(BACKENDS))
    a = ap.parse_args()
    sys.exit(doctor() if a.cmd == "doctor" else run(a) or 0)
