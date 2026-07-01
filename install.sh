#!/usr/bin/env bash
# Install workflow-kit into the current repo root.
# Usage: from target repo root: bash workflow-kit/install.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KIT="$(cd "$(dirname "$0")" && pwd)"

# Optional: install into another repo — bash install.sh /path/to/product-repo
TARGET="${1:-}"
if [[ -n "$TARGET" ]]; then
  ROOT="$(cd "$TARGET" && pwd)"
fi

echo "Installing workflow kit into: $ROOT"

# Skills
mkdir -p "$ROOT/.cursor/skills"
rsync -a --delete "$KIT/cursor/skills/" "$ROOT/.cursor/skills/"

# Rules
mkdir -p "$ROOT/.cursor/rules"
for f in "$KIT/cursor/rules/"*.mdc; do
  cp "$f" "$ROOT/.cursor/rules/"
done

# Scripts
mkdir -p "$ROOT/scripts"
for f in "$KIT/scripts/"*.mjs; do
  cp "$f" "$ROOT/scripts/"
done

# GitHub Actions
mkdir -p "$ROOT/.github/workflows"
for f in "$KIT/.github/workflows/"*.yml; do
  cp "$f" "$ROOT/.github/workflows/"
done

# Templates → docs (do not overwrite existing program masters)
mkdir -p "$ROOT/docs/projects"
for f in "$KIT/templates/"*.md; do
  base="$(basename "$f")"
  if [[ "$base" == "program-master-stub.md" ]]; then
    dest="$ROOT/docs/projects/my-program-master.md"
    if [[ ! -f "$dest" ]]; then
      cp "$f" "$dest"
      echo "Created $dest (rename for your program)"
    else
      echo "Skip $dest (already exists)"
    fi
  elif [[ ! -f "$ROOT/docs/projects/$base" ]]; then
    cp "$f" "$ROOT/docs/projects/"
    echo "Copied docs/projects/$base"
  else
    echo "Skip docs/projects/$base (already exists)"
  fi
done

# Mirror skills for Cursor discovery
if [[ -f "$ROOT/package.json" ]] && grep -q '"sync:agent-skills"' "$ROOT/package.json" 2>/dev/null; then
  (cd "$ROOT" && npm run sync:agent-skills)
elif command -v node >/dev/null 2>&1; then
  node "$ROOT/scripts/sync-agent-skills.mjs"
else
  echo "WARN: run 'npm run sync:agent-skills' after adding package.json scripts"
fi

echo ""
echo "Done. Next steps:"
echo "  1. Merge templates/package-scripts.json into package.json"
echo "  2. Paste User Rule from docs/projects/workflow-user-rules-canonical.md"
echo "  3. Rename docs/projects/my-program-master.md → your-program-master.md"
echo "  4. Trim scripts/ralph-chain-config.mjs for your slice ids"
echo "  5. GitHub secrets: CURSOR_API_KEY (+ GITHUB_TOKEN on Cloud VM)"
