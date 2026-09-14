#!/usr/bin/env bash
# Install one local lip-sync backend and register it for lipsync.py.
#
#   ./lipsync-setup.sh musetalk      # fastest, ~8 GB VRAM
#   ./lipsync-setup.sh latentsync    # best quality, ~20 GB VRAM
#   ./lipsync-setup.sh wav2lip       # lightest, ~4 GB VRAM
#
# Clones the repo, builds it a venv, installs its requirements, and writes its
# path into lipsync.json. Model weights are NOT fetched here: each project
# documents its own source and those move often enough that a copied URL rots.
# The script prints exactly where to put them and then checks whether they
# arrived, so `lipsync.py doctor` tells you the truth either way.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="${1:-}"
ROOT="${LIPSYNC_ROOT:-$HERE/backends}"

case "$BACKEND" in
  musetalk)   REPO=https://github.com/TMElyralab/MuseTalk ;;
  latentsync) REPO=https://github.com/bytedance/LatentSync ;;
  wav2lip)    REPO=https://github.com/Rudrabha/Wav2Lip ;;
  *) echo "usage: $0 {musetalk|latentsync|wav2lip}" >&2; exit 2 ;;
esac

command -v git    >/dev/null || { echo "git is required" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 1; }
if ! command -v nvidia-smi >/dev/null; then
  echo "WARNING: no nvidia-smi — these run on CPU only in theory, not in practice." >&2
fi

DIR="$ROOT/$BACKEND"
mkdir -p "$ROOT"

if [ -d "$DIR/.git" ]; then
  echo "==> $BACKEND already cloned at $DIR"
else
  echo "==> cloning $REPO"
  git clone --depth 1 "$REPO" "$DIR"
fi

echo "==> venv"
python3 -m venv "$DIR/.venv"
# shellcheck disable=SC1091
source "$DIR/.venv/bin/activate"
python3 -m pip install --quiet --upgrade pip wheel

echo "==> requirements (this is the slow part)"
if [ -f "$DIR/requirements.txt" ]; then
  pip install -r "$DIR/requirements.txt"
else
  echo "    no requirements.txt — follow $REPO's README for its install step" >&2
fi

echo "==> registering in lipsync.json"
# The config path comes from bash, not from __file__ — this runs as a heredoc on
# stdin, and deriving it from $DIR breaks the moment LIPSYNC_ROOT points away.
python3 - "$BACKEND" "$DIR" "$HERE/lipsync.json" <<'PY'
import json, pathlib, sys
backend, d, conf_path = sys.argv[1], sys.argv[2], pathlib.Path(sys.argv[3])
conf = json.loads(conf_path.read_text()) if conf_path.exists() else {}
conf.setdefault(backend, {})["dir"] = d
conf[backend].setdefault("python", f"{d}/.venv/bin/python3")
conf_path.write_text(json.dumps(conf, indent=2) + "\n")
print(f"    {conf_path}")
PY

cat <<EOF

==> weights
    Fetch them the way $REPO documents, into:
        $DIR
    Then:  python3 lipsync.py doctor

    Its inference entrypoint and flags are in lipsync.json under "$BACKEND".
    If that repo has renamed them since this was written, fix the "cmd" there
    once — lipsync.py reads it, so nothing else needs touching.
EOF

if find "$DIR" -name '*.pth' -o -name '*.safetensors' -o -name '*.ckpt' 2>/dev/null | grep -q .; then
  echo "    weights: found some already."
else
  echo "    weights: none present yet — lip-sync will fail until they are."
fi
