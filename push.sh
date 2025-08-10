#!/usr/bin/env bash
set -euo pipefail
REPO_URL="${1:-git@github.com:rennai455/sunday10augCRM.git}"

if [ ! -d .git ]; then
  git init
fi

git add .
git commit -m "chore: initial import" || true
git branch -M main || true
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"
git push -u origin main
echo "Pushed to $REPO_URL"
