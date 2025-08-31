#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

TRAIN_DYNAMIC="${TRAIN_DYNAMIC:-1}"            # we want all open PRs
ALLOW_UNAPPROVED="${ALLOW_UNAPPROVED:-0}"      # set to 1 to bypass approvals
MERGE_DRY_RUN="${MERGE_DRY_RUN:-1}"            # default to dry-run for safety

TS="$(date -u +%Y%m%d-%H%M)"
DRAFT_BRANCH="draft/merge-all-$TS"
TRAIN_BRANCH="merge-train/all-open-$TS"

LOG_DIR=".codex/logs"
SUMMARY_FILE=".codex/merge_train_summary.json"
CENTRAL_LOG=".codex/run_min.out"

mkdir -p .codex "$LOG_DIR"

ts(){ while IFS= read -r line; do printf "[%s] %s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$line"; done; }
exec > >(ts | tee -a "$CENTRAL_LOG") 2>&1

need(){ command -v "$1" >/dev/null || { echo "Missing tool: $1" >&2; exit 10; }; }
need git; need gh; need jq

git fetch origin

# Start from origin/main
git checkout -B "$DRAFT_BRANCH" origin/main
git branch -f "$TRAIN_BRANCH" "$DRAFT_BRANCH"

# Discover PRs oldest → newest
mapfile -t PRS < <(gh pr list --base main --state open --json number --jq '.[].number' | sort -n)
if [ "${#PRS[@]}" -eq 0 ]; then
  echo "No open PRs targeting main."
  printf '%s' '{"merged":[],"skipped":[],"failed_validation":[]}' > "$SUMMARY_FILE"
  exit 0
fi

echo "PRs to attempt (oldest→newest): ${PRS[*]}"

merged=()
skipped=()

merge_one(){
  local pr="$1"
  local logf="$LOG_DIR/pr-$pr.log"
  : > "$logf"

  echo "== PR #$pr ==" | tee -a "$logf"

  local meta
  if ! meta="$(gh pr view "$pr" --json number,title,isDraft,baseRefName,mergeable,reviewDecision,url 2>>"$logf")"; then
    echo "metadata fetch failed" | tee -a "$logf"
    skipped+=("{\"number\":$pr,\"title\":\"\",\"reason\":\"metadata\"}")
    return 0
  fi

  local number title isDraft base mergeable reviewDecision url
  number="$(jq -r .number <<<"$meta")"
  title="$(jq -r .title <<<"$meta")"
  isDraft="$(jq -r .isDraft <<<"$meta")"
  base="$(jq -r .baseRefName <<<"$meta")"
  mergeable="$(jq -r .mergeable <<<"$meta")"
  reviewDecision="$(jq -r .reviewDecision <<<"$meta")"
  url="$(jq -r .url <<<"$meta")"

  if [[ "$base" != "main" || "$isDraft" == "true" ]]; then
    echo "skip: wrong base or draft" | tee -a "$logf"
    skipped+=("{\"number\":$number,\"title\":\"$title\",\"reason\":\"wrong-base-or-draft\"}")
    return 0
  fi

  if [[ "$ALLOW_UNAPPROVED" != "1" && "$reviewDecision" != "APPROVED" ]]; then
    echo "skip: unapproved (set ALLOW_UNAPPROVED=1 to bypass)" | tee -a "$logf"
    skipped+=("{\"number\":$number,\"title\":\"$title\",\"reason\":\"unapproved\"}")
    return 0
  fi

  # Try squash-merge into train
  git checkout "$TRAIN_BRANCH" >>"$logf" 2>&1
  git merge --ff-only origin/main >>"$logf" 2>&1 || true

  if ! gh pr checkout "$pr" --branch "tmp/pr-$pr" >>"$logf" 2>&1; then
    echo "skip: cannot checkout head" | tee -a "$logf"
    skipped+=("{\"number\":$number,\"title\":\"$title\",\"reason\":\"checkout\"}")
    return 0
  fi

  git checkout "$TRAIN_BRANCH" >>"$logf" 2>&1

  if ! git merge --squash --no-commit "tmp/pr-$pr" >>"$logf" 2>&1; then
    echo "skip: conflict" | tee -a "$logf"
    git reset --hard >>"$logf" 2>&1
    git branch -D "tmp/pr-$pr" >>"$logf" 2>&1 || true
    skipped+=("{\"number\":$number,\"title\":\"$title\",\"reason\":\"conflict\"}")
    return 0
  fi

  git commit -m "Merge PR #$pr: $title (squash into train)" >>"$logf" 2>&1
  sha="$(git rev-parse HEAD)"
  merged+=("{\"number\":$number,\"title\":\"$title\",\"sha\":\"$sha\",\"url\":\"$url\"}")

  git branch -D "tmp/pr-$pr" >>"$logf" 2>&1 || true
  echo "merged into $TRAIN_BRANCH" | tee -a "$logf"
}

for pr in "${PRS[@]}"; do
  merge_one "$pr"
done

# Write summary
echo "{\"merged\":[${merged[*]:-}],\"skipped\":[${skipped[*]:-}],\"failed_validation\":[]}" > "$SUMMARY_FILE"

if [[ "$MERGE_DRY_RUN" == "1" ]]; then
  echo "Dry-run complete. Branches created locally:"
  git branch --list "$DRAFT_BRANCH" "$TRAIN_BRANCH"
  exit 0
fi

git push -u origin "$DRAFT_BRANCH" "$TRAIN_BRANCH"

# Create PR that lists what actually merged
merged_list="$(jq -r '.merged[] | "- #\\(.number): \\(.title)"' "$SUMMARY_FILE" 2>/dev/null || true)"
skipped_list="$(jq -r '.skipped[] | "- #\\(.number): \\(.title) — \\(.reason)"' "$SUMMARY_FILE" 2>/dev/null || true)"
body=$'### Merged PRs\n'"${merged_list:-"(none)"}"$'\n\n### Skipped\n'"${skipped_list:-"(none)"}"$'\n'

gh pr create --base main --head "$TRAIN_BRANCH" \
  --title "Merge train (all open PRs, oldest→newest)" \
  --body "$body" --label merge-train
