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

# Skills — ONE tree. `.cursor/skills` and `.agents/skills` are symlinks to it, so Cursor and the
# `.agents` discovery path read the same files. Nothing is copied twice and nothing drifts.
mkdir -p "$ROOT/.claude/skills"
rsync -a --delete "$KIT/skills/" "$ROOT/.claude/skills/"

# Rules — ONE tree, tool-neutral, read on demand from the index in AGENTS.md §7.
mkdir -p "$ROOT/docs/rules"
for f in "$KIT/rules/"*.md; do
  base="$(basename "$f")"
  if [[ -f "$ROOT/docs/rules/$base" ]]; then
    cp "$f" "$ROOT/docs/rules/$base"
  else
    cp "$f" "$ROOT/docs/rules/"
    echo "Created docs/rules/$base"
  fi
done

# AGENTS.md — THE rulebook, read by Claude Code, Cursor and Codex. Never overwrite a real one:
# section 6 is repo-specific and the repo owns it.
if [[ ! -f "$ROOT/AGENTS.md" ]]; then
  cp "$KIT/templates/AGENTS.md" "$ROOT/AGENTS.md"
  echo "Created $ROOT/AGENTS.md — fill in section 6"
else
  echo "Skip AGENTS.md (already exists) — compare against templates/AGENTS.md by hand"
fi

# Cursor reads AGENTS.md natively; this is the belt-and-braces pointer.
mkdir -p "$ROOT/.cursor/rules"
cp "$KIT/templates/cursor/000-agents.mdc" "$ROOT/.cursor/rules/000-agents.mdc"

# CLAUDE.md — only create if the repo doesn't already have one; never overwrite
if [[ ! -f "$ROOT/CLAUDE.md" ]]; then
  cp "$KIT/templates/CLAUDE.md" "$ROOT/CLAUDE.md"
  echo "Created $ROOT/CLAUDE.md"
else
  echo "Skip CLAUDE.md (already exists) — it only needs to contain @AGENTS.md plus your Claude-only notes"
fi

# Scripts
# kit-manifest-build.mjs stays in the kit: it BUILDS the manifest from a live repo,
# which is the kit's job, not the repo's. Repos only ever CHECK against it.
mkdir -p "$ROOT/scripts"
for f in "$KIT/scripts/"*.mjs; do
  base="$(basename "$f")"
  [[ "$base" == "kit-manifest-build.mjs" ]] && continue
  cp "$f" "$ROOT/scripts/"
done

# Kit manifest — the contract the drift check reads. A path listed in it is owned
# by the kit; a path outside it belongs to the repo. Deploy steps are deliberately
# excluded and stay repo-local (AFKF-D24).
cp "$KIT/kit-manifest.json" "$ROOT/kit-manifest.json"

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

# Point Cursor and .agents at the one skills tree (symlinks, not copies)
if [[ -f "$ROOT/package.json" ]] && grep -q '"sync:agent-skills"' "$ROOT/package.json" 2>/dev/null; then
  (cd "$ROOT" && npm run sync:agent-skills)
elif command -v node >/dev/null 2>&1; then
  node "$ROOT/scripts/sync-agent-skills.mjs"
else
  echo "WARN: run 'npm run sync:agent-skills' to create the .cursor/skills and .agents/skills symlinks"
fi

echo ""
echo "Done. Next steps:"
echo "  1. Merge templates/package-scripts.json into package.json (includes kit:drift + preflight)"
echo "  2. Cursor: paste User Rule from docs/projects/workflow-user-rules-canonical.md"
echo "  3. Fill in section 6 of AGENTS.md — the repo-specific facts"
echo "  4. Rename docs/projects/my-program-master.md → your-program-master.md"
echo "  5. Trim scripts/ralph-chain-config.mjs for your slice ids"
echo "  6. Run 'npm run kit:drift' and 'npm run preflight' — both must be green before you start work"
echo "  7. GitHub secrets: CURSOR_API_KEY (+ GITHUB_TOKEN on a cloud VM) — see skills/ralph-loop/SKILL.md"
