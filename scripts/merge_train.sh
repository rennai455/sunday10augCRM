#!/usr/bin/env bash
set -euo pipefail

PHASE_A_PRS=(67 66 68 69 72 73 75 74 76 60 65)
PHASE_B_PRS=(70 71)
SNAPSHOT_BRANCH="local-copy-20250822"
SNAPSHOT_FILES=(overview.md changes.diff)
MERGE_DRY_RUN="${MERGE_DRY_RUN:-0}"
ALLOW_UNAPPROVED="${ALLOW_UNAPPROVED:-0}"
TRAIN_INCLUDE="${TRAIN_INCLUDE:-}"
TRAIN_EXCLUDE="${TRAIN_EXCLUDE:-}"
APP_PATH="${APP_PATH:-.}"
VAL_PORT="${VAL_PORT:-3002}"
TS="$(date -u +%Y%m%d-%H%M)"
DRAFT_BRANCH="draft/railway-train-$TS"
TRAIN_BRANCH="merge-train/railway-ready-$TS"
LOG_DIR=".codex/logs"
SUMMARY_FILE=".codex/merge_train_summary.json"

log(){ printf '%s\n' "$*" >&2; }
need(){ command -v "$1" >/dev/null || { log "Missing tool: $1"; exit 1; }; }

run_validation() {
  pushd "$APP_PATH" >/dev/null
  npm ci
  npm run css:lint || true
  npm run build
  local port base pid
  base="${VAL_PORT:-3002}"
  port="$base"
  for _ in $(seq 0 20); do
    if ! lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then break; fi
    port="$((port+1))"
  done
  PORT="$port" NODE_ENV=production node Server.js &
  pid=$!
  trap 'kill '"$pid"' 2>/dev/null || true' RETURN
  for i in $(seq 1 10); do
    if curl -sSf "http://localhost:${port}/healthz" >/dev/null 2>&1; then break; fi
    sleep 0.3
    [[ $i -eq 10 ]] && { echo "healthz failed"; return 1; }
  done
  curl -sSf "http://localhost:${port}/readyz" >/dev/null 2>&1 || true
  curl -sSI "http://localhost:${port}/static/dashboard.html" | grep -i "content-security-policy" | grep -i "nonce-" >/dev/null
  curl -sSI -H "Origin: http://localhost:3000" "http://localhost:${port}/healthz" | grep -i "access-control-allow-origin" >/dev/null || true
  popd >/dev/null
}

run_static_checks() {
  git grep -n -F "new Pool(" -- ':!db/index.js' >/dev/null && { log "Multiple Pool instances found"; return 1; }
  git grep -n "process\\.env\\.JWT_SECRET\\s*||" >/dev/null && { log "JWT_SECRET fallback detected"; return 1; }
  git grep -n "<script[^>]*>" public/ | grep -v "nonce=" >/dev/null 2>&1 && { log "Inline <script> without nonce"; return 1; }
  git grep -n "unsafe-inline" -- Server.js middleware/ config/ 2>/dev/null | grep -q . && { log "CSP contains 'unsafe-inline'"; return 1; }
}

preflight(){
  need git; need gh; need jq; need npm; need node; need curl
  local major; major="$(node -p 'process.versions.node.split(".")[0]')"
  [[ "$major" -ge 20 ]] || { log "Node 20+ required"; exit 1; }
  gh auth status >/dev/null || { log "gh CLI not authenticated"; exit 1; }
  git remote get-url origin | grep -qi github.com || { log "Origin must be GitHub"; exit 1; }
  git fetch origin
  [[ -z "$(git status --porcelain)" ]] || { log "Worktree not clean"; exit 1; }
  if git ls-files | grep -E '(^|/)\.env($|\.)|\.pem$|\.key$|\.crt$' | grep -vE '(^|/)\.env\.example$' >/dev/null; then
    log "Secret-like file is tracked in git"; exit 1
  fi
  if ! ( grep -Eq '^\.env(\..*)?$' .gitignore && grep -q '!\.env\.example' .gitignore ); then
    log "Warning: .gitignore should ignore .env / .env.* but keep .env.example"
  fi
  mkdir -p .codex "$LOG_DIR"
}

snapshot_context(){
  git checkout -B "$DRAFT_BRANCH" origin/main
  if git show-ref --verify --quiet "refs/heads/$SNAPSHOT_BRANCH"; then
    git checkout "$SNAPSHOT_BRANCH" -- "${SNAPSHOT_FILES[@]}" 2>/dev/null || true
    git add "${SNAPSHOT_FILES[@]}" 2>/dev/null || true
    git commit -m "chore: include local snapshot context (overview.md, changes.diff)" --allow-empty
  fi
}

filter_prs() {
  local arr=("$@") out=()
  for pr in "${arr[@]}"; do
    [[ -n "$TRAIN_INCLUDE" && ! ",$TRAIN_INCLUDE," =~ ",$pr," ]] && continue
    [[ -n "$TRAIN_EXCLUDE" &&  ",$TRAIN_EXCLUDE," =~ ",$pr," ]] && continue
    out+=("$pr")
  done
  printf '%s\n' "${out[@]}"
}

merge_phase(){
  local phase_branch="$1"; shift
  local prs=( "$@" )
  local merged=() skipped=() failed_validation=()
  git checkout "$phase_branch"
  git merge --ff-only origin/main || true
  for pr in "${prs[@]}"; do
    local logf=".codex/logs/pr-$pr.log"
    log "== PR #$pr =="
    local meta
    if ! meta="$(gh pr view "$pr" --json number,title,mergeable,isDraft,reviewDecision,baseRefName,url,statusCheckRollup 2>"$logf")"; then
      skipped+=("{\"number\":$pr,\"title\":\"\",\"reason\":\"metadata\"}"); continue
    fi
    local number title mergeable isDraft baseRefName url reviewDecision
    number="$(jq -r .number <<<"$meta")"
    title="$(jq -r .title <<<"$meta")"
    mergeable="$(jq -r .mergeable <<<"$meta")"
    isDraft="$(jq -r .isDraft <<<"$meta")"
    baseRefName="$(jq -r .baseRefName <<<"$meta")"
    url="$(jq -r .url <<<"$meta")"
    reviewDecision="$(jq -r .reviewDecision <<<"$meta")"
    if [[ "$baseRefName" != "main" || "$mergeable" != "MERGEABLE" || "$isDraft" == "true" ]]; then
      skipped+=("{\"number\":$number,\"title\":\"$title\",\"reason\":\"not mergeable or wrong base\"}"); continue
    fi
    if [[ "$ALLOW_UNAPPROVED" != "1" && "$reviewDecision" != "APPROVED" ]]; then
      skipped+=("{\"number\":$number,\"title\":\"$title\",\"reason\":\"unapproved\"}"); continue
    fi
    local checks_json; checks_json="$(jq -c '.statusCheckRollup // []' <<<"$meta")"
    if echo "$checks_json" | jq -e 'map((.conclusion // .status // .state // "SUCCESS") | ascii_upcase)
       | any(.=="FAILURE" or .=="CANCELLED" or .=="TIMED_OUT" or .=="ACTION_REQUIRED")' >/dev/null; then
      skipped+=("{\"number\":$number,\"title\":\"$title\",\"reason\":\"checks failing\"}"); continue
    fi
    if echo "$checks_json" | jq -e 'map((.status // .state // "COMPLETED") | ascii_upcase)
       | any(.=="PENDING" or .=="IN_PROGRESS")' >/dev/null; then
      skipped+=("{\"number\":$number,\"title\":\"$title\",\"reason\":\"checks pending\"}"); continue
    fi
    git merge --ff-only origin/main || true
    gh pr checkout "$pr" --branch "tmp/pr-$pr" >>"$logf" 2>&1 || { skipped+=("{\"number\":$number,\"title\":\"$title\",\"reason\":\"checkout\"}"); continue; }
    git checkout "$phase_branch" >>"$logf" 2>&1
    if ! git merge --squash --no-commit "tmp/pr-$pr" >>"$logf" 2>&1; then
      git reset --hard >>"$logf" 2>&1
      git branch -D "tmp/pr-$pr" >>"$logf" 2>&1 || true
      skipped+=("{\"number\":$number,\"title\":\"$title\",\"reason\":\"conflict\"}"); continue
    fi
    if run_validation >>"$logf" 2>&1; then
      git commit -m "Merge PR #$pr: $title (squash into train)" >>"$logf" 2>&1
      sha="$(git rev-parse HEAD)"
      merged+=("{\"number\":$number,\"title\":\"$title\",\"sha\":\"$sha\"}")
    else
      excerpt="$(tail -n 40 "$logf" | sed 's/"/\\"/g')"
      git reset --hard >>"$logf" 2>&1
      failed_validation+=("{\"number\":$number,\"title\":\"$title\",\"stage\":\"validation\",\"error_excerpt\":\"$excerpt\"}")
    fi
    git branch -D "tmp/pr-$pr" >>"$logf" 2>&1 || true
  done
  run_static_checks || log "static checks: warning/failed (review needed)"
  if git ls-files | grep -E '(^|/)\.env($|\.)|\.pem$|\.key$|\.crt$' | grep -vE '(^|/)\.env\.example$' >/dev/null; then
    log "Secret-like file tracked after merges"; exit 1
  fi
  if git diff --cached | grep -E 'JWT_SECRET|WEBHOOK_SECRET|DATABASE_URL|N8N_ENCRYPTION_KEY' >/dev/null; then
    log "Secret-like string found in staged diff"; exit 1
  fi
  if git diff --cached | grep -E '[A-Za-z0-9+/]{32,}={0,2}' >/dev/null; then
    log "High-entropy string found in staged diff"; exit 1
  fi
  if [[ -f "$SUMMARY_FILE" ]]; then
    tmp="$(mktemp)"
    echo "{\"merged\":[${merged[*]:-}],\"skipped\":[${skipped[*]:-}],\"failed_validation\":[${failed_validation[*]:-}]}" > "$tmp"
    jq -s 'reduce .[] as $x ({"merged":[],"skipped":[],"failed_validation":[]};
         .merged += ($x.merged // []) |
         .skipped += ($x.skipped // []) |
         .failed_validation += ($x.failed_validation // []))' "$SUMMARY_FILE" "$tmp" > "$SUMMARY_FILE.tmp"
    mv "$SUMMARY_FILE.tmp" "$SUMMARY_FILE"; rm -f "$tmp"
  else
    echo "{\"merged\":[${merged[*]:-}],\"skipped\":[${skipped[*]:-}],\"failed_validation\":[${failed_validation[*]:-}]}" > "$SUMMARY_FILE"
  fi
}

main(){
  need mkdir
  mkdir -p .codex "$LOG_DIR"
  preflight
  snapshot_context
  mapfile -t PHASE_A < <(filter_prs "${PHASE_A_PRS[@]}")
  mapfile -t PHASE_B < <(filter_prs "${PHASE_B_PRS[@]}")
  merge_phase "$DRAFT_BRANCH" "${PHASE_A[@]}"
  git branch -f "$TRAIN_BRANCH" "$DRAFT_BRANCH"
  merge_phase "$TRAIN_BRANCH" "${PHASE_B[@]}"
  if [[ "$MERGE_DRY_RUN" == "1" ]]; then
    log "Dry run complete. See $SUMMARY_FILE and $LOG_DIR/"; exit 0
  fi
  git push -u origin "$DRAFT_BRANCH" "$TRAIN_BRANCH"
  merged_list="$(jq -r '.merged[] | "- #\(.number): \(.title)"' "$SUMMARY_FILE" 2>/dev/null || true)"
  skipped_list="$(jq -r '.skipped[] | "- #\(.number): \(.title) — \(.reason)"' "$SUMMARY_FILE" 2>/dev/null || true)"
  failed_list="$(jq -r '.failed_validation[] | "- #\(.number): \(.title) — \(.stage): \(.error_excerpt | tostring | .[0:300])…"' "$SUMMARY_FILE" 2>/dev/null || true)"
  body=$'### Merged PRs\n'"${merged_list:-"(none)"}"$'\n\n### Skipped\n'"${skipped_list:-"(none)"}"$'\n\n### Failed validation\n'"${failed_list:-"(none)"}"$'\n'
  if jq -e '.failed_validation|length>0' "$SUMMARY_FILE" >/dev/null; then
    gh pr create --base main --head "$TRAIN_BRANCH" --title "Merge train: infra/security + Railway prep" --body "$body" --label merge-train --label infra --label security --draft
  else
    gh pr create --base main --head "$TRAIN_BRANCH" --title "Merge train: infra/security + Railway prep" --body "$body" --label merge-train --label infra --label security
  fi
  log "Merge train complete."
}
main "$@"
