class_name DirectorUndoStack
extends RefCounted

## Snapshot undo/redo. Current state lives on the desk; this stores past/future.

const LIMIT := 50

var _past: Array[Dictionary] = []
var _future: Array[Dictionary] = []


func clear() -> void:
	_past.clear()
	_future.clear()


func can_undo() -> bool:
	return not _past.is_empty()


func can_redo() -> bool:
	return not _future.is_empty()


func record_past(previous: Dictionary) -> void:
	_past.append(previous.duplicate(true))
	while _past.size() > LIMIT:
		_past.pop_front()
	_future.clear()


func undo(current: Dictionary) -> Dictionary:
	if _past.is_empty():
		return {}
	_future.append(current.duplicate(true))
	return _past.pop_back()


func redo(current: Dictionary) -> Dictionary:
	if _future.is_empty():
		return {}
	_past.append(current.duplicate(true))
	while _past.size() > LIMIT:
		_past.pop_front()
	return _future.pop_back()
