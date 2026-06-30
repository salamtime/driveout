#!/usr/bin/env bash
set -euo pipefail

expected_repo="salamtime/driveout"
remote_name="${1:-origin}"
remote_url="${2:-}"

if [[ -z "$remote_url" ]]; then
  remote_url="$(git remote get-url --push "$remote_name" 2>/dev/null || git remote get-url "$remote_name" 2>/dev/null || true)"
fi

normalize_remote() {
  local value="$1"
  value="${value#https://github.com/}"
  value="${value#git@github.com:}"
  value="${value%.git}"
  printf '%s' "$value"
}

actual_repo="$(normalize_remote "$remote_url")"

if [[ "$actual_repo" != "$expected_repo" ]]; then
  cat >&2 <<EOF
Blocked push: this workspace must publish to github.com/$expected_repo only.

Current remote "$remote_name" points to:
  ${remote_url:-missing}

Fix it with:
  git remote set-url origin https://github.com/$expected_repo.git
EOF
  exit 1
fi

echo "Repository verified: github.com/$expected_repo"
