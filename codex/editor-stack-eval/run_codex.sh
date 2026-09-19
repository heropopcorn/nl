#!/usr/bin/env bash
set -u
DIR=/workspace/yuanli-game-video/codex/editor-stack-eval
cd /workspace/yuanli-game-video
echo RUNNING > "$DIR/status.txt"
date -Iseconds > "$DIR/started_at.txt"
: > "$DIR/lastmsg.txt"
PROMPT=$(cat <<'P'
你是在评估 heropopcorn/nl 导演台技术方案。请先阅读：
- codex/editor-stack-eval/CODEX_JOB.md
- codex/editor-stack-eval/USER_QUESTION.md（用户原话，原样理解）
然后按 CODEX_JOB 写出 codex/editor-stack-eval/EVALUATION.md，并在最终回复给出给用户看的中文结论摘要。不要改业务代码，不要开 PR。
P
)
codex -a never exec \
  --skip-git-repo-check \
  -C /workspace/yuanli-game-video \
  -s danger-full-access \
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
