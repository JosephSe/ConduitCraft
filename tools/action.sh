#!/usr/bin/env bash
# The work of the ConduitCraft GitHub Action (E3), kept in a script so it can be run and tested without GitHub.
# Inputs are environment variables (action.yml sets them):
#   FILES       git pathspecs of the diagrams, space or newline separated   (default: *.blueprint.md)
#   OUT_DIR     where renders go                                            (default: conduitcraft-out)
#   CHECK       "true" to run the Review rules and fail on errors           (default: true)
#   STRICT      "true" to fail on warnings too                              (default: false)
#   COMMENT     "true" to post "2 components added, 1 wire removed" on a pull request (default: true)
#   DRIFT       lines of `diagram=source-file` (for example `shop.blueprint.md=docker-compose.yml`); fails when the source has
#               changed since the diagram was imported from it (default: none)
#   COMMIT_TO   a folder to commit the renders into (push events only)      (default: none)
#   BASE_REF    the pull request's base branch (GITHUB_BASE_REF)
# The CLI runs from ACTION_PATH (this repository's checkout), on the diagrams in the current directory.
set -uo pipefail

ACTION_PATH="${ACTION_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
FILES="${FILES:-*.blueprint.md}"
OUT_DIR="${OUT_DIR:-conduitcraft-out}"
CHECK="${CHECK:-true}"
STRICT="${STRICT:-false}"
COMMENT="${COMMENT:-true}"
COMMIT_TO="${COMMIT_TO:-}"
DRIFT="${DRIFT:-}"
WORKDIR="$(pwd)"

cc() {
  (cd "$ACTION_PATH" && node --experimental-strip-types --no-warnings --import ./tests/register-ts.mjs tools/conduitcraft.ts "$@")
}
# Paths given to the CLI must be absolute, because it runs from ACTION_PATH.
abs() { case "$1" in /*) printf '%s' "$1" ;; *) printf '%s/%s' "$WORKDIR" "$1" ;; esac; }

status=0

# Drift: has the file a diagram was imported from moved on? One `diagram=source` pair per line.
while IFS= read -r pair; do
  pair="${pair#"${pair%%[![:space:]]*}"}"
  [ -z "$pair" ] && continue
  cc drift "$(abs "${pair%%=*}")" "$(abs "${pair#*=}")" || status=1
done <<< "$DRIFT"

# The pathspecs go to git as written (no shell globbing), so `*.md` matches at any depth the way git means it.
set -f
DIAGRAMS=()
while IFS= read -r line; do [ -n "$line" ] && DIAGRAMS+=("$line"); done < <(git ls-files -- $FILES 2>/dev/null | sort)
set +f
if [ "${#DIAGRAMS[@]}" -eq 0 ]; then
  echo "No diagrams matched: $FILES"
  exit "$status"
fi
echo "ConduitCraft: ${#DIAGRAMS[@]} diagram(s)"


if [ "$CHECK" = "true" ]; then
  args=()
  for f in "${DIAGRAMS[@]}"; do args+=("$(abs "$f")"); done
  [ "$STRICT" = "true" ] && args+=(--strict)
  cc check "${args[@]}" || status=1
fi

mkdir -p "$OUT_DIR"
for f in "${DIAGRAMS[@]}"; do
  dest="$(abs "$OUT_DIR")/$(dirname "$f")"
  cc render "$(abs "$f")" --format svg --page all --out-dir "$dest" || status=1
  cc render "$(abs "$f")" --format html --out-dir "$dest" || status=1
done

if [ "$COMMENT" = "true" ] && [ -n "${BASE_REF:-}" ] && [ -n "${GH_TOKEN:-}" ] && [ -n "${PR_NUMBER:-}" ]; then
  git fetch --no-tags --depth=1 origin "$BASE_REF" >/dev/null 2>&1 || true
  : > "$OUT_DIR/.comment.md"
  tmp="$(mktemp -d)"
  rows=()
  for f in "${DIAGRAMS[@]}"; do
    git show "origin/$BASE_REF:$f" > "$tmp/base" 2>/dev/null || : > "$tmp/base"
    line="$(cc diff "$tmp/base" "$(abs "$f")" --name "$f")" || continue
    rows+=("$line")
  done
  {
    printf '### Diagram changes\n\n'
    changed=0
    for r in "${rows[@]}"; do
      case "$r" in *": no changes") ;; *) printf -- '- `%s`: %s\n' "${r%%: *}" "${r#*: }"; changed=1 ;; esac
    done
    [ "$changed" -eq 0 ] && printf 'No diagram changed in this pull request.\n'
  } > "$OUT_DIR/.comment.md"
  if gh pr comment "$PR_NUMBER" --edit-last --body-file "$OUT_DIR/.comment.md" >/dev/null 2>&1; then :; else
    gh pr comment "$PR_NUMBER" --body-file "$OUT_DIR/.comment.md" || true
  fi
  rm -f "$OUT_DIR/.comment.md"
fi

if [ -n "$COMMIT_TO" ] && [ -z "${BASE_REF:-}" ]; then
  mkdir -p "$COMMIT_TO"
  cp -R "$OUT_DIR"/. "$COMMIT_TO"/
  git add "$COMMIT_TO"
  if ! git diff --cached --quiet; then
    git -c user.name="conduitcraft[bot]" -c user.email="actions@users.noreply.github.com" commit -m "docs: update ConduitCraft diagram renders" >/dev/null
    git push || status=1
  fi
fi

exit "$status"
