class_name PreviewController
extends RefCounted

## Unified play / pause / stop clock. Playback state is runtime-only.

enum State { STOPPED, PLAYING, PAUSED }

var state: State = State.STOPPED
var clock: float = 0.0
var director_time: float = 0.0
var loop_preview := false
var previous_mode: int = 0
var entered_preview := false


func is_playing() -> bool:
	return state == State.PLAYING


func is_paused() -> bool:
	return state == State.PAUSED


func is_stopped() -> bool:
	return state == State.STOPPED


func is_preview_locked() -> bool:
	return state == State.PLAYING or state == State.PAUSED or entered_preview


func status_text() -> String:
	match state:
		State.PLAYING:
			return "播放中  %.1fs" % clock
		State.PAUSED:
			return "已暂停  %.1fs" % clock
		_:
			return "已停止  %.1fs" % clock


func tick(delta: float, freeze_fx: bool) -> void:
	if not freeze_fx:
		director_time += delta
	if state == State.PLAYING:
		clock += delta


func mark_enter_preview(mode_before: int) -> void:
	if not entered_preview:
		previous_mode = mode_before
		entered_preview = true


func mark_leave_preview() -> int:
	entered_preview = false
	state = State.STOPPED
	return previous_mode
