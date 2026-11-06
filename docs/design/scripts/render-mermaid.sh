#!/usr/bin/env bash
# Renders every Mermaid block in docs/design/ with @mermaid-js/mermaid-cli and reports the ones that fail.
#   docs/design/scripts/render-mermaid.sh
# Dev-only: mmdc runs through npx from a temporary folder and is not a dependency of the project. It uses your installed
# Google Chrome, so nothing else is downloaded. Set CHROME to use another browser.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
printf '{"executablePath":"%s","args":["--no-sandbox"],"headless":"new"}\n' "$CHROME" > "$WORK/puppeteer.json"

python3 - "$ROOT/docs/design" "$WORK" <<'EOF'
import pathlib, re, sys
design, work = map(pathlib.Path, sys.argv[1:3])
for document in sorted(design.rglob("*.md")):
    blocks = re.findall(r"```mermaid\n(.*?)```", document.read_text(), re.S)
    for number, block in enumerate(blocks, 1):
        (work / f"{document.stem}-{number}.mmd").write_text(block)
EOF

total=0
failed=0
for source in "$WORK"/*.mmd; do
  total=$((total + 1))
  if ! PUPPETEER_SKIP_DOWNLOAD=1 npx --yes @mermaid-js/mermaid-cli@12.2.0 -q -p "$WORK/puppeteer.json" \
    -i "$source" -o "${source%.mmd}.svg" > "$WORK/out.log" 2>&1; then
    failed=$((failed + 1))
    echo "FAILED $(basename "$source")"
    head -5 "$WORK/out.log"
  fi
done
echo "$((total - failed)) of $total diagrams rendered"
[ "$failed" -eq 0 ]
