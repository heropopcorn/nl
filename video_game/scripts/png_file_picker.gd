extends Node

## Desktop FileDialog + Web <input type="file"> for PNG bytes.
## Does not write into res://.

signal png_picked(bytes: PackedByteArray, filename: String)
signal pick_failed(message: String)

const MAX_BYTES := 12 * 1024 * 1024

var _dialog: FileDialog
var _js_callback: JavaScriptObject
var _js_fail: JavaScriptObject


func _ready() -> void:
	_dialog = FileDialog.new()
	_dialog.access = FileDialog.ACCESS_FILESYSTEM
	_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	_dialog.use_native_dialog = true
	_dialog.title = "选择背景图片"
	_dialog.filters = PackedStringArray([
		"*.png,*.jpg,*.jpeg,*.webp ; Images",
		"*.png ; PNG",
		"*.jpg,*.jpeg ; JPEG",
		"*.webp ; WebP",
	])
	_dialog.min_size = Vector2i(720, 480)
	_dialog.file_selected.connect(_on_dialog_file)
	add_child(_dialog)
	if OS.has_feature("web"):
		_install_web_picker()


func pick() -> void:
	if OS.has_feature("web"):
		if _js_callback == null:
			pick_failed.emit("Web file picker is unavailable.")
			return
		JavaScriptBridge.eval("window._nlPickGroundPng && window._nlPickGroundPng();", true)
		return
	_dialog.popup_centered()


func _on_dialog_file(path: String) -> void:
	var ext := path.get_extension().to_lower()
	if ext not in ["png", "jpg", "jpeg", "webp"]:
		pick_failed.emit("请选择 PNG / JPEG / WebP 图片。")
		return
	if not FileAccess.file_exists(path):
		pick_failed.emit("找不到文件。")
		return
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		pick_failed.emit("无法读取图片。")
		return
	if file.get_length() > MAX_BYTES:
		pick_failed.emit("图片文件超过 12 MiB")
		return
	var bytes := file.get_buffer(file.get_length())
	if bytes.is_empty():
		pick_failed.emit("无法读取图片。")
		return
	png_picked.emit(bytes, path.get_file())


func _install_web_picker() -> void:
	_js_callback = JavaScriptBridge.create_callback(_on_web_png)
	var window := JavaScriptBridge.get_interface("window")
	if window == null:
		return
	window._nlOnGroundPng = _js_callback
	_js_fail = JavaScriptBridge.create_callback(_on_web_fail)
	window._nlOnGroundPngFail = _js_fail
	JavaScriptBridge.eval(
		"""
		window._nlPickGroundPng = function () {
			var input = document.createElement('input');
			input.type = 'file';
			input.accept = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';
			input.onchange = function () {
				var file = input.files && input.files[0];
				if (!file) return;
				if (file.size > 12 * 1024 * 1024) {
					if (window._nlOnGroundPngFail) window._nlOnGroundPngFail('图片文件超过 12 MiB');
					return;
				}
				var reader = new FileReader();
				reader.onload = function () {
					var bytes = new Uint8Array(reader.result);
					var binary = '';
					var chunk = 0x8000;
					for (var i = 0; i < bytes.length; i += chunk) {
						binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
					}
					if (window._nlOnGroundPng) {
						window._nlOnGroundPng(btoa(binary), file.name);
					}
				};
				reader.readAsArrayBuffer(file);
			};
			input.click();
		};
		""",
		true
	)


func _on_web_fail(args: Array) -> void:
	if args.is_empty():
		pick_failed.emit("无法读取图片。")
		return
	pick_failed.emit(str(args[0]))


func is_open() -> bool:
	return _dialog != null and _dialog.visible


func _on_web_png(args: Array) -> void:
	if args.is_empty():
		pick_failed.emit("未选择文件。")
		return
	var b64 := str(args[0])
	var filename := str(args[1]) if args.size() > 1 else "upload.png"
	var bytes := Marshalls.base64_to_raw(b64)
	if bytes.is_empty():
		pick_failed.emit("无法解码图片。")
		return
	if bytes.size() > MAX_BYTES:
		pick_failed.emit("图片文件超过 12 MiB")
		return
	png_picked.emit(bytes, filename)
