#!/usr/bin/env bash
# Multi-agent issue claim helpers for Walking Thoughts.
# See docs/agents/issue-workflow.md.
set -euo pipefail

LABEL_IN_PROGRESS="in-progress"
LABEL_READY="ready-for-agent"

usage() {
  cat <<'EOF'
Usage:
  scripts/issue.sh ensure-labels
  scripts/issue.sh frontier
  scripts/issue.sh claim <issue-number>
  scripts/issue.sh release <issue-number>
  scripts/issue.sh status <issue-number>
EOF
}

require_gh() {
  command -v gh >/dev/null 2>&1 || {
    echo "gh is required (install via mise)" >&2
    exit 2
  }
  command -v jq >/dev/null 2>&1 || {
    echo "jq is required (install via mise)" >&2
    exit 2
  }
}

label_names() {
  local issue="$1"
  gh issue view "$issue" --json labels --jq '[.labels[].name] | join("\n")'
}

has_label() {
  local issue="$1"
  local want="$2"
  label_names "$issue" | grep -Fxq "$want"
}

blocked_by_open() {
  local issue="$1"
  local summary
  summary="$(gh api "repos/{owner}/{repo}/issues/${issue}" --jq '.issue_dependencies_summary.blocked_by // 0' 2>/dev/null || echo 0)"
  if [[ "$summary" =~ ^[0-9]+$ ]] && [[ "$summary" -gt 0 ]]; then
    return 0
  fi
  local body
  body="$(gh issue view "$issue" --json body --jq '.body // ""')"
  local refs
  refs="$(printf '%s\n' "$body" | sed -nE 's/^[Bb]locked by:[[:space:]]*(.*)$/\1/p' | head -n 1)"
  [[ -z "$refs" ]] && return 1
  local n
  for n in $(printf '%s' "$refs" | grep -oE '#[0-9]+' | tr -d '#'); do
    local state
    state="$(gh issue view "$n" --json state --jq '.state' 2>/dev/null || echo OPEN)"
    if [[ "$state" == "OPEN" ]]; then
      return 0
    fi
  done
  return 1
}

ensure_labels() {
  require_gh
  local -a labels=(
    "needs-triage|Maintainer needs to evaluate|D4C5F9"
    "needs-info|Waiting on reporter for more information|FBCA04"
    "ready-for-agent|Fully specified; available for an unblocked agent|0E8A16"
    "ready-for-human|Requires human implementation|1D76DB"
    "wontfix|Will not be actioned|ffffff"
    "in-progress|Claimed by an agent or human; not on the frontier|E4A820"
  )
  local entry name desc color
  for entry in "${labels[@]}"; do
    IFS='|' read -r name desc color <<<"$entry"
    if gh label list --limit 200 --json name --jq '.[].name' | grep -Fxq "$name"; then
      echo "label exists: $name"
      continue
    fi
    if gh label create "$name" --description "$desc" --color "$color"; then
      echo "label created: $name"
    else
      echo "WARN: could not create label '$name' (need issues:write). Create it in GitHub settings or merge a PR that runs ensure-issue-labels.yml." >&2
    fi
  done
}

frontier() {
  require_gh
  # Some GitHub App tokens ignore --label filters; filter client-side instead.
  local json
  json="$(gh issue list --state open --limit 200 --json number,title,labels,assignees)"
  printf '%s' "$json" | jq -c --arg ready "$LABEL_READY" --arg progress "$LABEL_IN_PROGRESS" '
    .[]
    | select([.labels[].name] | index($ready))
    | select([.labels[].name] | index($progress) | not)
    | {number, title}
  ' | while read -r row; do
    local number title
    number="$(printf '%s' "$row" | jq -r '.number')"
    title="$(printf '%s' "$row" | jq -r '.title')"
    if blocked_by_open "$number"; then
      continue
    fi
    printf '#%s\t%s\n' "$number" "$title"
  done
}

claim() {
  require_gh
  local issue="${1:-}"
  [[ -n "$issue" ]] || {
    usage
    exit 2
  }

  local state
  state="$(gh issue view "$issue" --json state --jq '.state')"
  if [[ "$state" != "OPEN" ]]; then
    echo "Issue #$issue is $state; cannot claim." >&2
    exit 1
  fi

  if has_label "$issue" "$LABEL_IN_PROGRESS"; then
    echo "Issue #$issue already has $LABEL_IN_PROGRESS (claimed)."
    gh issue view "$issue" --json number,title,labels,assignees \
      --jq '"#" + (.number|tostring) + " " + .title + "\nlabels: " + ([.labels[].name] | join(", "))'
    exit 0
  fi

  if ! has_label "$issue" "$LABEL_READY"; then
    echo "Issue #$issue is not $LABEL_READY; refuse to claim." >&2
    exit 1
  fi

  if blocked_by_open "$issue"; then
    echo "Issue #$issue still has open blockers; refuse to claim." >&2
    exit 1
  fi

  if ! gh issue edit "$issue" --add-label "$LABEL_IN_PROGRESS"; then
    cat >&2 <<EOF
ERROR: could not add label '$LABEL_IN_PROGRESS' on #$issue.
Grant the GitHub App/token permission to write issues, or create the label and
apply it manually, then re-run. Until then, open a cursor/* PR that references
#$issue so .github/workflows/agent-ticket-claim.yml can claim it in CI.
EOF
    exit 1
  fi

  gh issue edit "$issue" --add-assignee "@me" >/dev/null 2>&1 || true

  if ! has_label "$issue" "$LABEL_IN_PROGRESS"; then
    echo "ERROR: claim write did not stick on #$issue" >&2
    exit 1
  fi

  echo "Claimed #$issue ($LABEL_IN_PROGRESS)."
  gh issue view "$issue" --json number,title,labels,assignees \
    --jq '"#" + (.number|tostring) + " " + .title + "\nlabels: " + ([.labels[].name] | join(", "))'
}

release() {
  require_gh
  local issue="${1:-}"
  [[ -n "$issue" ]] || {
    usage
    exit 2
  }

  if has_label "$issue" "$LABEL_IN_PROGRESS"; then
    gh issue edit "$issue" --remove-label "$LABEL_IN_PROGRESS"
  else
    echo "Issue #$issue did not have $LABEL_IN_PROGRESS."
  fi
  gh issue edit "$issue" --remove-assignee "@me" >/dev/null 2>&1 || true
  echo "Released #$issue."
}

status() {
  require_gh
  local issue="${1:-}"
  [[ -n "$issue" ]] || {
    usage
    exit 2
  }
  gh issue view "$issue" --json number,title,state,labels,assignees \
    --jq '
      "#" + (.number|tostring) + " [" + .state + "] " + .title,
      "labels: " + ([.labels[].name] | join(", ")),
      "assignees: " + (if (.assignees|length)==0 then "(none)" else ([.assignees[].login] | join(", ")) end)
    '
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    ensure-labels) ensure_labels ;;
    frontier) frontier ;;
    claim) claim "${1:-}" ;;
    release) release "${1:-}" ;;
    status) status "${1:-}" ;;
    -h | --help | help | "") usage ;;
    *)
      usage
      exit 2
      ;;
  esac
}

main "$@"
