extends Node

## Desktop FileDialog + Web <input type="file"> for PNG bytes.
## Does not write into res://.

signal png_picked(bytes: PackedByteArray, filename: String)
signal pick_failed(message: String)

var _dialog: FileDialog
var _js_callback: JavaScriptObject


func _ready() -> void:
	_dialog = FileDialog.new()
	_dialog.access = FileDialog.ACCESS_FILESYSTEM
	_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	_dialog.use_native_dialog = true
	_dialog.title = "Select ground PNG"
	_dialog.filters = PackedStringArray(["*.png ; PNG images"])
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
	if path.get_extension().to_lower() != "png":
		pick_failed.emit("Please choose a PNG file.")
		return
	if not FileAccess.file_exists(path):
		pick_failed.emit("File not found.")
		return
	var bytes := FileAccess.get_file_as_bytes(path)
	if bytes.is_empty():
		pick_failed.emit("Could not read PNG.")
		return
	png_picked.emit(bytes, path.get_file())


func _install_web_picker() -> void:
	_js_callback = JavaScriptBridge.create_callback(_on_web_png)
	var window := JavaScriptBridge.get_interface("window")
	if window == null:
		return
	window._nlOnGroundPng = _js_callback
	JavaScriptBridge.eval(
		"""
		window._nlPickGroundPng = function () {
			var input = document.createElement('input');
			input.type = 'file';
			input.accept = 'image/png,.png';
			input.onchange = function () {
				var file = input.files && input.files[0];
				if (!file) return;
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


func _on_web_png(args: Array) -> void:
	if args.is_empty():
		pick_failed.emit("No file selected.")
		return
	var b64 := str(args[0])
	var filename := str(args[1]) if args.size() > 1 else "upload.png"
	var bytes := Marshalls.base64_to_raw(b64)
	if bytes.is_empty():
		pick_failed.emit("Could not decode the PNG.")
		return
	png_picked.emit(bytes, filename)
