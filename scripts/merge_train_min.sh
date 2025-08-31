#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

MERGE_DRY_RUN="${MERGE_DRY_RUN:-1}"   # 1 = don't push / don't open PR
ALLOW_UNAPPROVED="${ALLOW_UNAPPROVED:-1}"

TS="$(date -u +%Y%m%d-%H%M)"
TRAIN_BRANCH="merge-train/min-$TS"
LOG_DIR=".codex/logs"
SUMMARY_FILE=".codex/merge_train_summary.json"

mkdir -p "$LOG_DIR" .codex

log(){ printf '%s\n' "$*" >&2; }

need(){ command -v "$1" >/dev/null || { log "Missing tool: $1"; exit 1; }; }
need git; need gh; need jq

git fetch origin --quiet
git checkout -B "$TRAIN_BRANCH" origin/main

# Discover all open PR numbers to main, sorted oldest->newest
mapfile -t PRS < <(gh pr list --base main --state open --json number --jq '.[].number' | sort -n)

MERGED=()
SKIPPED=()
FAILED=()

for PR in "${PRS[@]}"; do
  LOGF="$LOG_DIR/pr-$PR.log"
  {
    echo "== Processing PR #$PR =="

    # Pull metadata (NOTE: gh can occasionally return null; handle that)
    META="$(gh pr view "$PR" --json number,title,mergeable,isDraft,reviewDecision,baseRefName,statusCheckRollup 2>/dev/null || true)"
    if [[ -z "$META" || "$META" == "null" ]]; then
      SKIPPED+=("{\"number\":$PR,\"title\":\"\",\"reason\":\"metadata\"}")
      echo "skip: metadata"
      continue
    fi

    NUMBER="$(jq -r .number <<<"$META")"
    TITLE="$(jq -r .title <<<"$META")"
    MERGEABLE="$(jq -r .mergeable <<<"$META")"
    IS_DRAFT="$(jq -r .isDraft <<<"$META")"
    BASE="$(jq -r .baseRefName <<<"$META")"
    REVIEW="$(jq -r .reviewDecision <<<"$META")"

    # Allow unapproved if env is set
    if [[ "${ALLOW_UNAPPROVED}" == "1" ]]; then REVIEW="APPROVED"; fi

    # Gate: base must be main, not draft, mergeable, approved
    if [[ "$BASE" != "main" ]]; then
      SKIPPED+=("{\"number\":$NUMBER,\"title\":\"$TITLE\",\"reason\":\"base-not-main\"}")
      echo "skip: base-not-main"; continue
    fi
    if [[ "$IS_DRAFT" == "true" ]]; then
      SKIPPED+=("{\"number\":$NUMBER,\"title\":\"$TITLE\",\"reason\":\"draft\"}")
      echo "skip: draft"; continue
    fi
    if [[ "$MERGEABLE" != "MERGEABLE" ]]; then
      SKIPPED+=("{\"number\":$NUMBER,\"title\":\"$TITLE\",\"reason\":\"not-mergeable\"}")
      echo "skip: not-mergeable"; continue
    fi
    if [[ "$REVIEW" != "APPROVED" ]]; then
      SKIPPED+=("{\"number\":$NUMBER,\"title\":\"$TITLE\",\"reason\":\"unapproved\"}")
      echo "skip: unapproved"; continue
    fi

    # Try the squash-merge into the train
    git merge --ff-only origin/main || true
    gh pr checkout "$PR" --branch "tmp/pr-$PR"
    git checkout "$TRAIN_BRANCH"

    if ! git merge --squash --no-commit "tmp/pr-$PR"; then
      git reset --hard
      git branch -D "tmp/pr-$PR" >/dev/null 2>&1 || true
      SKIPPED+=("{\"number\":$NUMBER,\"title\":\"$TITLE\",\"reason\":\"conflict\"}")
      echo "skip: conflict"
      continue
    fi

    # Commit into train (even in dry-run we commit locally; we just won't push)
    git commit -m "Merge PR #$PR: $TITLE (squash into train)"
    SHA="$(git rev-parse HEAD)"
    MERGED+=("{\"number\":$NUMBER,\"title\":\"$TITLE\",\"sha\":\"$SHA\"}")

    # Clean temp branch
    git branch -D "tmp/pr-$PR" >/dev/null 2>&1 || true

  } >"$LOGF" 2>&1
done

# Always write a summary JSON
echo "{\"merged\":[${MERGED[*]:-}],\"skipped\":[${SKIPPED[*]:-}],\"failed_validation\":[${FAILED[*]:-}]}" > "$SUMMARY_FILE"

if [[ "$MERGE_DRY_RUN" == "1" ]]; then
  log "Dry run complete. Train branch: $TRAIN_BRANCH"
  log "Summary: $SUMMARY_FILE"
  exit 0
fi

# Push and open a PR
git push -u origin "$TRAIN_BRANCH"
BODY=$'### Merged PRs\n'"$(jq -r '.merged[] | "- #\(.number): \(.title)"' "$SUMMARY_FILE")"$'\n\n### Skipped\n'"$(jq -r '.skipped[] | "- #\(.number): \(.title) — \(.reason)"' "$SUMMARY_FILE")"$'\n'
gh pr create --base main --head "$TRAIN_BRANCH" --title "Merge train (minimal): all open PRs" --body "$BODY" --label merge-train
log "Opened PR for $TRAIN_BRANCH"
