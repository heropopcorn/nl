#!/usr/bin/env bash
set -u
DIR=/workspace/yuanli-game-video/codex/editor-stack-eval
cd /workspace/yuanli-game-video
echo RUNNING > "$DIR/status.txt"
date -Iseconds > "$DIR/started_at.txt"
: > "$DIR/lastmsg.txt"
PROMPT=$(cat <<'P'
继续上一轮评估会话。用户发来最新 UI 布局需求 + 线框图，请严格执行：
codex/editor-stack-eval/RESUME_JOB.md
用户原话：codex/editor-stack-eval/USER_LAYOUT_V3.md
线框图已用 -i 附上（同目录 layout-wireframe.png）。
先写 LAYOUT_V3_REQUIREMENTS.md，再按图实现 Layout V3 并开 PR。
P
)
codex -a never exec resume \
  01a0b813-16f8-7163-bf5a-d15f979a64ae \
  --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  -m gpt-5.6-sol \
  -c model_reasoning_effort="high" \
  -i "$DIR/layout-wireframe.png" \
  -o "$DIR/lastmsg.txt" \
  "$PROMPT" \
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
