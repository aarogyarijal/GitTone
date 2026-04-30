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

  # ─── GitLab augment (optional) ────────────────────────────────────────────
  if command -v glab >/dev/null 2>&1 && glab auth status >/dev/null 2>&1; then
    echo "  → augmenting with GitLab…"
    GL_USER=$(glab api user 2>/dev/null | jq -r '.username // empty')
    GL_EMAIL=$(glab api user 2>/dev/null | jq -r '.commit_email // .email // empty')
    GL_NAME=$(glab api user 2>/dev/null | jq -r '.name // empty')
    if [ -n "$GL_USER" ]; then
      echo "    GitLab user: $GL_USER (commits by: ${GL_NAME} <${GL_EMAIL}>)"

      # Contributed projects → "id|path_with_namespace"
      # --paginate emits one JSON array per page; jq -s slurps then add concatenates them.
      PROJECTS=$(glab api --paginate "users/$GL_USER/contributed_projects?per_page=100" 2>/dev/null \
        | jq -rs 'add | .[] | "\(.id)|\(.path_with_namespace)"')

      # 1. Commits per GitLab project
      ALL_GL_COMMITS='[]'
      while IFS='|' read -r PID PATH_NS; do
        [ -z "$PID" ] && continue
        echo "    fetching commits for ${PATH_NS}…"
        # Don't use ?author= — GitLab matches commit author_name verbatim (case-sensitive,
        # whitespace-sensitive). Filter client-side by author_email instead, which is stable.
        # Some commit messages contain raw control bytes inside JSON strings that jq refuses
        # to parse. Re-encode through Python to escape them properly.
        RAW=$(glab api --paginate "projects/$PID/repository/commits?per_page=100" 2>/dev/null \
          | python3 -c "
import sys, json
text = sys.stdin.read()
dec = json.JSONDecoder(strict=False)
flat, i, n = [], 0, len(text)
while i < n:
    while i < n and text[i] in ' \t\r\n': i += 1
    if i >= n: break
    try:
        val, end = dec.raw_decode(text, i)
        if isinstance(val, list): flat.extend(val)
        i = end
    except Exception:
        break
print(json.dumps(flat))
" || echo "[]")
        MAPPED=$(echo "$RAW" | jq --arg repo "gitlab:${PATH_NS}" --arg email "$GL_EMAIL" --arg name "$GL_NAME" '
          map(select(.author_email == $email or .committer_email == $email or .author_name == $name))
          | [.[] | {
          hash: .id,
          timestamp: (.created_at | sub("\\.[0-9]+"; "") | sub("[+-][0-9]{2}:[0-9]{2}$"; "Z") | fromdateiso8601),
          author: .author_name,
          repo: $repo,
          linesAdded: 0,
          linesDeleted: 0,
          files: []
        }]' 2>/dev/null || echo "[]")
        ALL_GL_COMMITS=$(jq -s 'add' <(echo "$ALL_GL_COMMITS") <(echo "$MAPPED"))
      done <<< "$PROJECTS"

      GL_COMMIT_COUNT=$(echo "$ALL_GL_COMMITS" | jq length)
      echo "    $GL_COMMIT_COUNT GitLab commits"

      if [ "$GL_COMMIT_COUNT" -gt 0 ]; then
        # Merge into commits.json, sort chronologically
        jq -s 'add | sort_by(.timestamp)' "$DATA_DIR/commits.json" <(echo "$ALL_GL_COMMITS") \
          > "$DATA_DIR/commits.tmp.json"
        mv "$DATA_DIR/commits.tmp.json" "$DATA_DIR/commits.json"

        # Regenerate contributors (each repo = one voice) from combined commits
        jq '
          group_by(.repo) |
          map({
            author: .[0].repo,
            total:  length,
            weeks: (
              group_by((.timestamp / 604800 | floor)) |
              map({
                w: (.[0].timestamp / 604800 | floor) * 604800,
                a: 0, d: 0, c: length
              })
            )
          }) | sort_by(-.total)
        ' "$DATA_DIR/commits.json" > "$DATA_DIR/contributors.json"
      fi

      # 2. Merged MRs
      echo "    fetching merged MRs…"
      GL_MRS=$(glab api --paginate "merge_requests?scope=all&author_username=$GL_USER&state=merged&per_page=100" 2>/dev/null \
        | jq -s 'add | [.[] | {
            number: .iid,
            title: .title,
            createdAt: .created_at,
            mergedAt: .merged_at,
            additions: 0,
            deletions: 0,
            repo: ("gitlab:" + (.references.full | split("!")[0])),
            reviewDecision: null
          }]')
      GL_MR_COUNT=$(echo "$GL_MRS" | jq length)
      echo "    $GL_MR_COUNT merged GitLab MRs"
      if [ "$GL_MR_COUNT" -gt 0 ]; then
        jq -s 'add' "$DATA_DIR/pulls.json" <(echo "$GL_MRS") > "$DATA_DIR/pulls.tmp.json"
        mv "$DATA_DIR/pulls.tmp.json" "$DATA_DIR/pulls.json"
      fi

      # 3. Pipelines from top 5 GitLab projects by commit count
      echo "    fetching pipelines (top 5 GitLab projects)…"
      TOP_GL=$(while IFS='|' read -r PID PATH_NS; do
        [ -z "$PID" ] && continue
        N=$(jq --arg r "gitlab:${PATH_NS}" '[.[] | select(.repo == $r)] | length' "$DATA_DIR/commits.json")
        printf '%s\t%s\t%s\n' "$N" "$PID" "${PATH_NS}"
      done <<< "$PROJECTS" | sort -k1,1 -nr | head -5)

      while IFS=$'\t' read -r N PID PATH_NS; do
        [ -z "$PID" ] && continue
        echo "    fetching pipelines for ${PATH_NS}…"
        # Cap to most-recent 200 pipelines per project (no --paginate). Big projects
        # can have tens of thousands of pipelines, which would drown out commits/MRs.
        RAW=$(glab api "projects/$PID/pipelines?per_page=100&page=1" 2>/dev/null || echo "[]")
        RAW2=$(glab api "projects/$PID/pipelines?per_page=100&page=2" 2>/dev/null || echo "[]")
        MAPPED=$(jq -s 'add | [.[] | {
          databaseId: .id,
          name: "pipeline",
          status: .status,
          conclusion: (if .status == "success" then "success" elif .status == "failed" then "failure" else "skipped" end),
          createdAt: .created_at,
          updatedAt: (.updated_at // .created_at),
          event: "pipeline"
        }]' <(echo "$RAW") <(echo "$RAW2"))
        # Append + dedupe by databaseId so re-runs don't double up.
        jq -s 'add | group_by(.databaseId) | map(.[0]) | sort_by(.createdAt)' \
          "$DATA_DIR/runs.json" <(echo "$MAPPED") > "$DATA_DIR/runs.tmp.json"
        mv "$DATA_DIR/runs.tmp.json" "$DATA_DIR/runs.json"
      done <<< "$TOP_GL"
      echo "    $(jq length "$DATA_DIR/runs.json") total runs (GitHub + GitLab)"
    fi
  else
    echo "  → skipping GitLab (glab not installed/authenticated)"
  fi

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
