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

# Skills (Cursor)
mkdir -p "$ROOT/.cursor/skills"
rsync -a --delete "$KIT/cursor/skills/" "$ROOT/.cursor/skills/"

# Rules (Cursor)
mkdir -p "$ROOT/.cursor/rules"
for f in "$KIT/cursor/rules/"*.mdc; do
  cp "$f" "$ROOT/.cursor/rules/"
done

# Skills (Claude Code) — same Agent Skills format as Cursor, own folder for native discovery
mkdir -p "$ROOT/.claude/skills"
rsync -a --delete "$KIT/claude/skills/" "$ROOT/.claude/skills/"

# Rules (Claude Code) — plain markdown, imported from CLAUDE.md instead of Cursor's alwaysApply
mkdir -p "$ROOT/.claude/rules"
for f in "$KIT/claude/rules/"*.md; do
  cp "$f" "$ROOT/.claude/rules/"
done

# CLAUDE.md — only create if the repo doesn't already have one; never overwrite
if [[ ! -f "$ROOT/CLAUDE.md" ]]; then
  cp "$KIT/claude/CLAUDE.md" "$ROOT/CLAUDE.md"
  echo "Created $ROOT/CLAUDE.md"
else
  echo "Skip CLAUDE.md (already exists) — merge docs/projects/CLAUDE-workflow-snippet.md into it by hand"
fi

# Scripts
mkdir -p "$ROOT/scripts"
for f in "$KIT/scripts/"*.mjs; do
  cp "$f" "$ROOT/scripts/"
done

# GitHub Actions (optional Tier 3 — Ralph chain, Cursor Cloud Agent specific)
mkdir -p "$ROOT/.github/workflows"
for f in "$KIT/optional/github-workflows/"*.yml; do
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
echo "  2. Cursor: paste User Rule from docs/projects/workflow-user-rules-canonical.md"
echo "  3. Claude Code: CLAUDE.md was created fresh, or merge docs/projects/CLAUDE-workflow-snippet.md if you already had one"
echo "  4. Rename docs/projects/my-program-master.md → your-program-master.md"
echo "  5. Trim scripts/ralph-chain-config.mjs for your slice ids"
echo "  6. GitHub secrets: CURSOR_API_KEY (+ GITHUB_TOKEN on Cloud VM) — Claude Code chaining is manual by default, see claude/skills/ralph-loop/SKILL.md"
