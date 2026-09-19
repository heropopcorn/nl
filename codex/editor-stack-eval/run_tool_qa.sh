#!/usr/bin/env bash
set -u
DIR=/workspace/yuanli-game-video/codex/editor-stack-eval
cd /workspace/yuanli-game-video
echo RUNNING > "$DIR/status.txt"
date -Iseconds > "$DIR/started_at.txt"
: > "$DIR/lastmsg.txt"
PROMPT=$(cat <<'P'
继续同一会话。用户要你回答工具栏问题（原话见 codex/editor-stack-eval/USER_TOOL_QUESTIONS.md）。

请对照当前 main / Layout V3 已合并代码（尤其 video_game/scripts/director/director_desk.gd 及相关控制器）用中文直接回答，不要改代码、不要开 PR。

必须逐条说清：
1. 套索工具 vs 水域工具（矩形/套索水域）分别做什么，为何点套索却感觉还是水域
2. 套索闭环后为何自动回到「移动」
3. 缩放工具应如何用；为何点了无选中、无反应（是未实现、半实现，还是用法不对）
4. 旋转为何灰色不可点

最后把完整回答写入 codex/editor-stack-eval/TOOL_QA.md，并在 -o lastmsg 给出可直接转给用户的完整中文答复。
P
)
codex -a never exec resume \
  01a0b813-16f8-7163-bf5a-d15f979a64ae \
  --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  -m gpt-5.6-sol \
  -c model_reasoning_effort="high" \
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
