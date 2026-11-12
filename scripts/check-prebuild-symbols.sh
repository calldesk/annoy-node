#!/usr/bin/env bash
# Fails if a Linux prebuild requires a glibc or libstdc++ symbol version newer
# than what the AWS Lambda nodejs:22 runtime (Amazon Linux 2023) provides.
#
# usage: scripts/check-prebuild-symbols.sh [file.node ...]
#        (default: every prebuilds/linux-*/**/*.node)
set -euo pipefail

MAX_GLIBC=${MAX_GLIBC:-2.34}
MAX_GLIBCXX=${MAX_GLIBCXX:-3.4.33}

if [ "$#" -gt 0 ]; then
  files=("$@")
else
  cd "$(dirname "$0")/.."
  mapfile -t files < <(find prebuilds -path 'prebuilds/linux-*' -name '*.node' | sort)
fi

if [ "${#files[@]}" -eq 0 ]; then
  echo "no Linux prebuilds found" >&2
  exit 1
fi

# version_gt A B: true if version A > version B
version_gt() {
  [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n1)" = "$1" ]
}

status=0
for f in "${files[@]}"; do
  # objdump -T: dynamic symbol table; the version column holds e.g. GLIBC_2.14
  versions=$(objdump -T "$f" | grep -oE '\b(GLIBC|GLIBCXX|CXXABI)_[0-9][0-9.]*' | sort -u -V || true)
  max_glibc=$(grep '^GLIBC_' <<<"$versions" | sed 's/^GLIBC_//' | sort -V | tail -n1)
  max_glibcxx=$(grep '^GLIBCXX_' <<<"$versions" | sed 's/^GLIBCXX_//' | sort -V | tail -n1)
  bad=()
  if [ -n "$max_glibc" ] && version_gt "$max_glibc" "$MAX_GLIBC"; then
    bad+=("GLIBC_$max_glibc > GLIBC_$MAX_GLIBC")
  fi
  if [ -n "$max_glibcxx" ] && version_gt "$max_glibcxx" "$MAX_GLIBCXX"; then
    bad+=("GLIBCXX_$max_glibcxx > GLIBCXX_$MAX_GLIBCXX")
  fi
  if [ "${#bad[@]}" -gt 0 ]; then
    echo "FAIL $f: ${bad[*]}"
    objdump -T "$f" | grep -E "GLIBC_|GLIBCXX_" | while read -r line; do
      v=$(grep -oE '(GLIBC|GLIBCXX)_[0-9.]+' <<<"$line" | head -n1)
      case "$v" in
        GLIBC_*) version_gt "${v#GLIBC_}" "$MAX_GLIBC" && echo "    $line" ;;
        GLIBCXX_*) version_gt "${v#GLIBCXX_}" "$MAX_GLIBCXX" && echo "    $line" ;;
      esac
    done || true
    status=1
  else
    echo "ok   $f: max GLIBC_${max_glibc:-none}, GLIBCXX_${max_glibcxx:-none} (limits GLIBC_$MAX_GLIBC, GLIBCXX_$MAX_GLIBCXX)"
  fi
done
exit $status
