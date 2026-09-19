#!/usr/bin/env bash
set -u
DIR=/workspace/yuanli-game-video/codex/layout-v3-fixup
cd /workspace/yuanli-game-video
echo RUNNING > "$DIR/status.txt"
date -Iseconds > "$DIR/started_at.txt"
: > "$DIR/lastmsg.txt"
# NEW session; prompt is ONLY the user's verbatim file via stdin
codex -a never exec \
  --skip-git-repo-check \
  -C /workspace/yuanli-game-video \
  -s danger-full-access \
  -m gpt-5.6-sol \
  -c model_reasoning_effort="high" \
  -i "$DIR/layout-wireframe.png" \
  -o "$DIR/lastmsg.txt" \
  - < "$DIR/USER_PROMPT.md" \
  > "$DIR/codex-stdout.txt" 2> "$DIR/codex-stderr.txt"
EC=$?
echo "EXIT:$EC" >> "$DIR/codex-stderr.txt"
if rg -qi 'rate.?limit|usage.?limit|quota|5.?hour|exhausted|too many requests|billing|insufficient' "$DIR/codex-stderr.txt" "$DIR/lastmsg.txt" 2>/dev/null; then
  echo QUOTA_EXHAUSTED > "$DIR/status.txt"
elif [ "$EC" -eq 0 ]; then
  echo DONE > "$DIR/status.txt"
else
  echo FAILED > "$DIR/status.txt"
fi
echo "$EC" > "$DIR/exit_code.txt"
date -Iseconds > "$DIR/ended_at.txt"
# capture session id for user
rg -n 'session id:' "$DIR/codex-stderr.txt" | head -3 >> "$DIR/lastmsg.txt" || true
exit "$EC"
