#!/usr/bin/env bash
set -u
DIR=/workspace/yuanli-game-video/codex/water-effect-fixup
cd /workspace/yuanli-game-video
echo RUNNING > "$DIR/status.txt"
date -Iseconds > "$DIR/started_at.txt"
: > "$DIR/lastmsg.txt"
# resume previous session; stdin is ONLY user verbatim text
codex -a never exec resume \
  01a0b918-6646-7a00-ad0d-69a2f1eb42ae \
  --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  -m gpt-5.6-sol \
  -c model_reasoning_effort="high" \
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
exit "$EC"
