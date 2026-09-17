"""
视频抽帧：将视频按帧或按时间间隔导出为图片序列。
不依赖 ffmpeg，使用 OpenCV 读取视频并保存帧。
"""
import argparse
import sys
from pathlib import Path


def video_to_frames(
    video_path: str,
    output_dir: str = ".",
    fps: float = None,
    interval_sec: float = None,
    prefix: str = "frame",
    fmt: str = "png",
) -> int:
    """
    将视频抽帧保存为图片。
    :param video_path: 视频文件路径
    :param output_dir: 输出目录
    :param fps: 每秒抽取帧数，如 1 表示每秒 1 张；与 interval_sec 二选一
    :param interval_sec: 每隔多少秒抽一帧，如 0.5 表示每 0.5 秒一张；与 fps 二选一
    :param prefix: 输出文件名前缀，如 frame -> frame_0001.png
    :param fmt: 图片格式，png 或 jpg
    :return: 保存的图片数量，失败返回 0
    """
    try:
        import cv2
    except ImportError:
        print("请安装 opencv-python：pip install opencv-python", file=sys.stderr)
        return 0

    video_path = Path(video_path)
    output_dir = Path(output_dir)
    if not video_path.is_file():
        print(f"错误：视频文件不存在 {video_path}", file=sys.stderr)
        return 0

    output_dir.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"错误：无法打开视频 {video_path}", file=sys.stderr)
        return 0

    video_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    # 抽帧策略：优先 fps（每秒几张），否则 interval_sec（每隔几秒一张）
    if fps is not None and fps > 0:
        step = max(1, int(round(video_fps / fps)))
    elif interval_sec is not None and interval_sec > 0:
        step = max(1, int(round(video_fps * interval_sec)))
    else:
        step = max(1, int(round(video_fps)))  # 默认每秒 1 张

    ext = fmt.lower() if fmt.lower() in ("png", "jpg", "jpeg") else "png"
    count = 0
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % step == 0:
            out_name = f"{prefix}_{count:04d}.{ext}"
            out_path = output_dir / out_name
            cv2.imwrite(str(out_path), frame)
            count += 1
        frame_idx += 1

    cap.release()
    print(f"已导出 {count} 张图片到 {output_dir}")
    return count


def main():
    parser = argparse.ArgumentParser(
        description="视频抽帧：将视频导出为图片序列",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例：
  每秒 1 帧：  python video_to_frames.py video.mp4 -o frames
  每 2 秒 1 帧： python video_to_frames.py video.mp4 -o frames --interval 2
  每秒 5 帧：  python video_to_frames.py video.mp4 -o frames --fps 5
        """,
    )
    parser.add_argument("video", help="视频文件路径")
    parser.add_argument("-o", "--output", default=".", help="输出目录，默认当前目录")
    parser.add_argument("--fps", type=float, default=None, help="每秒抽取帧数，如 1 表示每秒 1 张")
    parser.add_argument("--interval", type=float, default=1.0, dest="interval_sec", help="每隔多少秒抽一帧，默认 1")
    parser.add_argument("--prefix", default="frame", help="输出文件名前缀，默认 frame")
    parser.add_argument("--fmt", default="png", choices=("png", "jpg"), help="图片格式，默认 png")

    args = parser.parse_args()
    # 若未指定 --fps，则用 --interval
    fps = args.fps
    interval_sec = args.interval_sec if fps is None else None
    if fps is None and interval_sec is None:
        interval_sec = 1.0

    n = video_to_frames(
        video_path=args.video,
        output_dir=args.output,
        fps=fps,
        interval_sec=interval_sec,
        prefix=args.prefix,
        fmt=args.fmt,
    )
    sys.exit(0 if n > 0 else 1)


if __name__ == "__main__":
    main()
