#!/usr/bin/env bash
# extract.sh — Pull git + GitHub data into data/*.json
# Usage:
#   bash scripts/extract.sh @me               # your personal contribution history across all repos
#   bash scripts/extract.sh owner/repo        # a single specific repo
#
# Requires: gh (authenticated), jq, python3

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../public/data"
mkdir -p "$DATA_DIR"

MODE="${1:-@me}"

if [ "$MODE" = "@me" ] || [ "$MODE" = "me" ]; then
  # ─── Personal contribution mode ────────────────────────────────────────────
  echo "Extracting YOUR contribution history across all GitHub repos…"

  ME=$(gh api /user --jq '.login')
  echo "  GitHub user: $ME"

  # 1. Commits
  echo "  → commits (searching across all repos)…"
  gh search commits \
    --author "$ME" \
    --limit 1000 \
    --json sha,commit,repository,committer \
    | jq '[.[] | {
        hash:         .sha,
        dateStr:      .commit.author.date,
        author:       .committer.login,
        repo:         .repository.fullName,
        linesAdded:   0,
        linesDeleted: 0,
        files:        []
      }]' \
    | python3 -c "
import sys, json
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

data = json.load(sys.stdin)
for item in data:
    ds = item.pop('dateStr', '')
    try:
        dt = datetime.fromisoformat(ds)
        item['timestamp'] = int(dt.timestamp())
    except Exception:
        item['timestamp'] = 0
print(json.dumps(data, indent=2))
" \
    > "$DATA_DIR/commits.json"
  echo "    $(jq length "$DATA_DIR/commits.json") commits"

  # 2. Contributors → re-use as "repos": each repo = a voice
  #    Group commit counts by repo and fake the contributors shape.
  echo "  → repos (for polyphony layer)…"
  jq '
    group_by(.repo) |
    map({
      author: .[0].repo,
      total:  length,
      weeks: (
        group_by((.timestamp / 604800 | floor)) |
        map({
          w: (.[0].timestamp / 604800 | floor) * 604800,
          a: 0,
          d: 0,
          c: length
        })
      )
    }) | sort_by(-.total)
  ' "$DATA_DIR/commits.json" > "$DATA_DIR/contributors.json"
  echo "    $(jq length "$DATA_DIR/contributors.json") repos"

  # 3. Pull Requests authored by me (merged)
  echo "  → pull requests…"
  gh search prs \
    --author "$ME" \
    --merged \
    --limit 500 \
    --json number,title,createdAt,closedAt,repository \
    | jq '[.[] | {
        number:         .number,
        title:          .title,
        createdAt:      .createdAt,
        mergedAt:       .closedAt,
        additions:      0,
        deletions:      0,
        repo:           .repository.nameWithOwner,
        reviewDecision: null
      }]' \
    > "$DATA_DIR/pulls.json"
  echo "    $(jq length "$DATA_DIR/pulls.json") merged PRs"

  # 4. CI runs — top 5 repos by commit count, merged and deduplicated
  echo "  -> CI runs (top 5 repos)..."
  echo '[]' > "$DATA_DIR/runs.json"
  jq -r '[group_by(.repo)[] | {repo: .[0].repo, n: length}] | sort_by(-.n) | .[0:10] | .[].repo' \
    "$DATA_DIR/commits.json" | while IFS= read -r TOP_REPO; do
    echo "    fetching runs for $TOP_REPO..."
    REPO_RUNS=$(gh run list \
      --repo "$TOP_REPO" \
      --limit 200 \
      --json databaseId,name,status,conclusion,createdAt,updatedAt,event \
      2>/dev/null || echo '[]')
    jq -s '
      (.[0] + .[1])
      | group_by(.databaseId)
      | map(.[0])
      | sort_by(.createdAt)
    ' "$DATA_DIR/runs.json" <(echo "$REPO_RUNS") > "$DATA_DIR/runs.tmp.json"
    mv "$DATA_DIR/runs.tmp.json" "$DATA_DIR/runs.json"
  done
  echo "    $(jq length "$DATA_DIR/runs.json") runs"

  # Meta
  gh api "/users/$ME" \
    --jq '{repo: ("@" + .login + " — all contributions"), description: .bio,
           stars: .public_repos, language: null, createdAt: .created_at}' \
    > "$DATA_DIR/meta.json"

else
  # ─── Single repo mode ──────────────────────────────────────────────────────
  REPO="$MODE"
  echo "Extracting data for: $REPO"

  # 1. Commits (via git log if inside the repo, else gh api)
  echo "  → commits…"
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git log --numstat --pretty=format:'COMMIT%x09%H%x09%at%x09%aN' \
      | python3 -c "
import sys, json, re
commits = []
current = None
for line in sys.stdin:
    line = line.rstrip('\n')
    if line.startswith('COMMIT\t'):
        if current: commits.append(current)
        parts = line.split('\t', 4)
        current = {'hash': parts[1], 'timestamp': int(parts[2]), 'author': parts[3],
                   'linesAdded': 0, 'linesDeleted': 0, 'files': []}
    elif current and re.match(r'^\d+\s+\d+\s+', line):
        parts = line.split('\t')
        try:
            current['linesAdded']   += int(parts[0])
            current['linesDeleted'] += int(parts[1])
        except ValueError: pass
        current['files'].append(parts[2] if len(parts) > 2 else '')
if current: commits.append(current)
print(json.dumps(commits, indent=2))
" > "$DATA_DIR/commits.json"
  else
    gh api --paginate "/repos/$REPO/commits" \
      --jq '[.[] | {hash: .sha,
                    timestamp: (.commit.author.date | fromdateiso8601 | floor),
                    author: .commit.author.name,
                    linesAdded: 0, linesDeleted: 0, files: []}]' \
      | jq -s 'add // []' > "$DATA_DIR/commits.json"
  fi
  echo "    $(jq length "$DATA_DIR/commits.json") commits"

  # 2. Contributor stats (retries: GitHub computes these lazily)
  echo "  → contributors…"
  for i in 1 2 3 4 5; do
    DATA=$(gh api "/repos/$REPO/stats/contributors" 2>/dev/null || echo "")
    if echo "$DATA" | jq -e 'type == "array" and length > 0' >/dev/null 2>&1; then
      echo "$DATA" | jq '[.[] | {author: .author.login, total: .total, weeks: .weeks}]' \
        > "$DATA_DIR/contributors.json"
      break
    fi
    echo "    GitHub still computing stats (attempt $i/5)…"; sleep 6
  done
  [ -f "$DATA_DIR/contributors.json" ] || echo '[]' > "$DATA_DIR/contributors.json"
  echo "    $(jq length "$DATA_DIR/contributors.json") contributors"

  # 3. Pull Requests
  echo "  → pull requests…"
  gh pr list --repo "$REPO" --state merged --limit 500 \
    --json number,title,createdAt,mergedAt,closedAt,additions,deletions,author,reviewDecision \
    > "$DATA_DIR/pulls.json"
  echo "    $(jq length "$DATA_DIR/pulls.json") merged PRs"

  # 4. CI Runs
  echo "  → CI runs…"
  gh run list --repo "$REPO" --limit 500 \
    --json databaseId,name,status,conclusion,createdAt,updatedAt,event \
    > "$DATA_DIR/runs.json"
  echo "    $(jq length "$DATA_DIR/runs.json") runs"

  # Meta
  gh api "/repos/$REPO" \
    --jq '{repo: .full_name, description: .description, stars: .stargazers_count,
           language: .language, createdAt: .created_at}' \
    > "$DATA_DIR/meta.json"
fi

echo ""
echo "Done. Data written to $DATA_DIR/"
ls -lh "$DATA_DIR/"
