#!/usr/bin/env bash
# Repeatable bundle + size baseline for performance inspection.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== perf:baseline $(date -u +"%Y-%m-%dT%H:%M:%SZ") ==="
echo ""

npm run build

echo ""
echo "=== Large route modules (line count) ==="
wc -l \
  src/pages/PositionDetailPage.tsx \
  src/pages/TasksPage.tsx \
  src/pages/CandidatesPage.tsx \
  src/pages/PositionsPage.tsx \
  src/components/layout/AppShell.tsx \
  src/App.tsx \
  2>/dev/null || true
