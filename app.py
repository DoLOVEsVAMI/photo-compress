import os
import uuid
import shutil
from io import BytesIO
from dataclasses import dataclass

from flask import Flask, render_template, request, jsonify, send_file, abort
from werkzeug.utils import secure_filename
from PIL import Image


app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JOBS_DIR = os.path.join(BASE_DIR, "jobs")
os.makedirs(JOBS_DIR, exist_ok=True)

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


def human_size(num_bytes: int) -> str:
    step = 1024.0
    units = ["B", "KB", "MB", "GB"]
    size = float(num_bytes)
    for u in units:
        if size < step:
            return f"{size:.1f} {u}"
        size /= step
    return f"{size:.1f} TB"


def allowed_filename(filename: str) -> bool:
    _, ext = os.path.splitext(filename.lower())
    return ext in ALLOWED_EXT


def flatten_alpha_to_white(img: Image.Image) -> Image.Image:
    """Если есть альфа-канал — сплющиваем на белый фон для JPEG."""
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        alpha = img.convert("RGBA")
        bg = Image.new("RGBA", alpha.size, (255, 255, 255, 255))
        out = Image.alpha_composite(bg, alpha).convert("RGB")
        return out
    return img.convert("RGB")


@dataclass
class CompressOptions:
    output_format: str            # "webp" or "jpeg"
    quality: int                  # 1..95 (используется если auto=False)
    auto: bool
    target_ratio: float           # например 0.40 => стремимся к 40% исходного размера
    min_quality: int              # нижняя граница для авто
    max_dim: int                  # ограничение по длинной стороне (0 = не ограничивать)


def save_encoded(img: Image.Image, fmt: str, quality: int) -> bytes:
    buf = BytesIO()
    fmt_upper = fmt.upper()

    if fmt_upper == "WEBP":
        # WebP: method=6 - максимальная компрессия по времени, но меньше размер
        img.save(buf, format="WEBP", quality=quality, method=6)
    elif fmt_upper in ("JPG", "JPEG"):
        img.save(buf, format="JPEG", quality=quality, optimize=True, progressive=True)
    else:
        raise ValueError("Unsupported format")

    return buf.getvalue()


def auto_pick_quality(img: Image.Image, fmt: str, original_bytes: int, target_ratio: float,
                      min_q: int, max_q: int = 95) -> tuple[int, bytes]:
    """
    Ищем максимально возможное качество (наивысшее), которое укладывается в целевой размер:
    target = original_bytes * target_ratio.
    Если не удаётся — возвращаем min_q.
    """
    target = int(original_bytes * target_ratio)
    lo, hi = min_q, max_q
    best_q = min_q
    best_data = save_encoded(img, fmt, min_q)

    # Если уже min_q больше цели — все равно вернем min_q (иначе будет сильнее деградация)
    # Но попробуем найти лучше: бинарный поиск "самого высокого q, который <= target"
    # Если даже q=max_q <= target — отлично, берем max_q.
    # Если q=min_q > target — берем min_q.
    for _ in range(8):  # 8 итераций хватает
        mid = (lo + hi) // 2
        data = save_encoded(img, fmt, mid)
        size = len(data)

        if size <= target:
            best_q = mid
            best_data = data
            lo = mid + 1  # пробуем выше качество
        else:
            hi = mid - 1

    return best_q, best_data


def prepare_image_for_output(img: Image.Image, output_format: str) -> Image.Image:
    # Для WebP можно сохранить RGBA (если есть прозрачность).
    # Для JPEG прозрачность нельзя — сплющиваем.
    if output_format == "webp":
        # WebP поддерживает альфу; просто обеспечим корректный режим
        if img.mode in ("RGBA", "RGB", "LA", "L"):
            return img
        return img.convert("RGBA") if "A" in img.getbands() else img.convert("RGB")

    # jpeg
    return flatten_alpha_to_white(img)


def maybe_resize(img: Image.Image, max_dim: int) -> Image.Image:
    if not max_dim or max_dim <= 0:
        return img

    w, h = img.size
    longest = max(w, h)
    if longest <= max_dim:
        return img

    scale = max_dim / float(longest)
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))
    return img.resize((new_w, new_h), Image.LANCZOS)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/compress", methods=["POST"])
def api_compress():
    files = request.files.getlist("photos")
    if not files:
        return jsonify({"ok": False, "error": "Нет файлов"}), 400

    output_format = request.form.get("format", "webp").lower().strip()
    if output_format not in ("webp", "jpeg"):
        return jsonify({"ok": False, "error": "Неверный формат"}), 400

    try:
        quality = int(request.form.get("quality", "85"))
        quality = max(1, min(95, quality))
    except ValueError:
        return jsonify({"ok": False, "error": "Неверное качество"}), 400

    auto = request.form.get("auto", "false").lower() == "true"

    try:
        target_percent = int(request.form.get("target_percent", "40"))
        target_percent = max(10, min(95, target_percent))
        target_ratio = target_percent / 100.0
    except ValueError:
        return jsonify({"ok": False, "error": "Неверный target_percent"}), 400

    try:
        min_quality = int(request.form.get("min_quality", "60"))
        min_quality = max(1, min(95, min_quality))
    except ValueError:
        return jsonify({"ok": False, "error": "Неверный min_quality"}), 400

    try:
        max_dim = int(request.form.get("max_dim", "0"))
        max_dim = max(0, max_dim)
    except ValueError:
        return jsonify({"ok": False, "error": "Неверный max_dim"}), 400

    opts = CompressOptions(
        output_format=output_format,
        quality=quality,
        auto=auto,
        target_ratio=target_ratio,
        min_quality=min_quality,
        max_dim=max_dim
    )

    job_id = uuid.uuid4().hex[:12]
    job_dir = os.path.join(JOBS_DIR, job_id)
    in_dir = os.path.join(job_dir, "in")
    out_dir = os.path.join(job_dir, "out")
    os.makedirs(in_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    results = []
    total_before = 0
    total_after = 0

    for f in files:
        if not f or not f.filename:
            continue

        filename = secure_filename(f.filename)
        if not filename or not allowed_filename(filename):
            continue

        in_path = os.path.join(in_dir, filename)
        f.save(in_path)

        before_bytes = os.path.getsize(in_path)
        total_before += before_bytes

        try:
            with Image.open(in_path) as img:
                img.load()

                img = maybe_resize(img, opts.max_dim)
                img = prepare_image_for_output(img, opts.output_format)

                out_ext = ".webp" if opts.output_format == "webp" else ".jpg"
                base, _ = os.path.splitext(filename)
                out_name = f"{base}{out_ext}"
                out_path = os.path.join(out_dir, out_name)

                if opts.auto:
                    chosen_q, data = auto_pick_quality(
                        img=img,
                        fmt=opts.output_format,
                        original_bytes=before_bytes,
                        target_ratio=opts.target_ratio,
                        min_q=opts.min_quality,
                        max_q=95
                    )
                    with open(out_path, "wb") as wf:
                        wf.write(data)
                    used_quality = chosen_q
                else:
                    data = save_encoded(img, opts.output_format, opts.quality)
                    with open(out_path, "wb") as wf:
                        wf.write(data)
                    used_quality = opts.quality

        except Exception as e:
            results.append({
                "name": filename,
                "ok": False,
                "error": str(e),
            })
            continue

        after_bytes = os.path.getsize(out_path)
        total_after += after_bytes

        results.append({
            "name": filename,
            "ok": True,
            "before_bytes": before_bytes,
            "after_bytes": after_bytes,
            "before_h": human_size(before_bytes),
            "after_h": human_size(after_bytes),
            "saved_bytes": max(0, before_bytes - after_bytes),
            "saved_h": human_size(max(0, before_bytes - after_bytes)),
            "saved_percent": round((1 - (after_bytes / before_bytes)) * 100, 1) if before_bytes else 0,
            "output_name": os.path.basename(out_path),
            "quality_used": used_quality
        })

    if not any(r.get("ok") for r in results):
        # Удалим пустую задачу
        shutil.rmtree(job_dir, ignore_errors=True)
        return jsonify({"ok": False, "error": "Не удалось обработать файлы (проверь расширения)"}), 400

    return jsonify({
        "ok": True,
        "job_id": job_id,
        "format": opts.output_format,
        "auto": opts.auto,
        "quality": opts.quality,
        "target_percent": int(opts.target_ratio * 100),
        "min_quality": opts.min_quality,
        "max_dim": opts.max_dim,
        "results": results,
        "total_before_bytes": total_before,
        "total_after_bytes": total_after,
        "total_before_h": human_size(total_before),
        "total_after_h": human_size(total_after),
        "total_saved_bytes": max(0, total_before - total_after),
        "total_saved_h": human_size(max(0, total_before - total_after)),
        "total_saved_percent": round((1 - (total_after / total_before)) * 100, 1) if total_before else 0
    })


@app.route("/download/<job_id>.zip")
def download_zip(job_id: str):
    job_dir = os.path.join(JOBS_DIR, job_id)
    out_dir = os.path.join(job_dir, "out")
    if not os.path.isdir(out_dir):
        abort(404)

    # ZIP в память
    import zipfile
    mem = BytesIO()
    with zipfile.ZipFile(mem, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name in os.listdir(out_dir):
            path = os.path.join(out_dir, name)
            if os.path.isfile(path):
                zf.write(path, arcname=name)
    mem.seek(0)

    return send_file(mem, as_attachment=True, download_name=f"compressed_{job_id}.zip")


@app.route("/download/<job_id>/<path:filename>")
def download_file(job_id: str, filename: str):
    job_dir = os.path.join(JOBS_DIR, job_id)
    out_dir = os.path.join(job_dir, "out")
    path = os.path.join(out_dir, filename)
    if not os.path.isfile(path):
        abort(404)
    return send_file(path, as_attachment=True, download_name=filename)


if __name__ == "__main__":
    # Для “нормального” запуска: debug=False
    app.run(host="127.0.0.1", port=5000, debug=True)