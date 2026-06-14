import os
import re
import json
import math
import shutil
from pathlib import Path
from PIL import Image
from flask import (
    Flask, render_template, request,
    redirect, url_for, send_from_directory, abort, flash, jsonify, Response, g
)
from auth_helper import login_required

def get_safe_filename(filename: str) -> str:
    base = os.path.basename(filename)
    # \w는 유니코드 단어 문자(한글 포함), 공백은 언더바(_)로 대체
    cleaned = re.sub(r'[^\w\s\-\.]', '', base)
    cleaned = cleaned.strip().replace(' ', '_')
    if not cleaned or cleaned.startswith('.'):
        cleaned = "uploaded_file" + (Path(base).suffix or ".dat")
    return cleaned

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get("SECRET_KEY", "change-me-in-production")
app.config['PORTAL_URL'] = os.environ.get("PORTAL_URL", "https://onnamu.kr")
app.config['SESSION_COOKIE_DOMAIN'] = '.onnamu.kr'
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", "/media"))

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".avi"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
MOVIE_EXTS = {".mp4", ".mkv", ".avi", ".mov", ".webm"}
SUBTITLE_EXTS = {".srt", ".vtt", ".ass"}

ALLOWED_UPLOAD_EXTS = VIDEO_EXTS | IMAGE_EXTS
PER_PAGE = 24

# 썸네일 경로 (권한 문제를 방지하기 위해 앱 디렉토리 내부에 생성)
THUMBNAIL_DIR = Path("/app/.thumbnails")
THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)

@app.after_request
def add_no_cache(response):
    # 미디어 파일 원본, 썸네일, 자막 등의 정적 미디어 요청은 10배 이상 부드러운 로딩과 서버 보호를 위해 극강의 30일 캐싱을 보장합니다.
    path = request.path.lower()
    if any(keyword in path for keyword in ['/thumbnail', '/media', '/movies', '/subtitles']) or path.endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mkv', '.mov', '.vtt', '.srt')):
        # 썸네일 및 대용량 스트리밍 미디어는 30일(2592000초) 동안 절대 변하지 않는 자원(immutable)으로 강력 캐싱 지시
        response.headers['Cache-Control'] = 'public, max-age=2592000, immutable'
        if 'Pragma' in response.headers: del response.headers['Pragma']
        if 'Expires' in response.headers: del response.headers['Expires']
    else:
        # 그 외 웹 UI 정적 코드(JS, CSS, HTML)는 변경 시 즉시 반영되도록 실시간 재검증 및 캐시 차단
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0, proxy-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        response.headers['Surrogate-Control'] = 'no-store'
    return response

# ═══════════════════════════════════════════════════════════
# 유틸리티
# ═══════════════════════════════════════════════════════════
def get_all_files(folders: list, extensions: set, media_type: str) -> list[dict]:
    all_files = []
    for folder in folders:
        folder_path = MEDIA_ROOT / folder / media_type
        if not folder_path.exists():
            continue
        for f in sorted(folder_path.iterdir()):
            if f.suffix.lower() in extensions:
                file_info = {
                    "name": f.name,
                    "stem": f.stem,
                    "folder": folder,
                    "path": f"{folder}/{media_type}/{f.name}"
                }
                if media_type == "movies":
                    subtitle = find_subtitle(folder_path, f.stem)
                    if subtitle:
                        file_info["subtitle"] = f"{folder}/{media_type}/{subtitle}"
                    file_info["size"] = f.stat().st_size
                all_files.append(file_info)
    return sorted(all_files, key=lambda x: x['name'])

def find_subtitle(directory: Path, video_stem: str) -> str:
    for ext in SUBTITLE_EXTS:
        subtitle_file = directory / f"{video_stem}{ext}"
        if subtitle_file.exists():
            return subtitle_file.name
        for lang_file in directory.glob(f"{video_stem}.*{ext}"):
            return lang_file.name
    return None

def format_size(size_bytes: int) -> str:
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} PB"

# ═══════════════════════════════════════════════════════════
# 인증 및 라우트
# ═══════════════════════════════════════════════════════════
@app.route("/login")
def login():
    portal_url = app.config.get('PORTAL_URL', 'https://onnamu.kr')
    # 갤러리로 다시 돌아올 수 있도록 next 세팅
    next_url = request.args.get("next") or url_for("gallery")
    return redirect(f"{portal_url}/login?next={next_url}")

@app.route("/logout")
def logout():
    portal_url = app.config.get('PORTAL_URL', 'https://onnamu.kr')
    response = redirect(f"{portal_url}/logout?next={url_for('gallery')}")
    
    # 캐시 무효화 및 쿠키 만료
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    
    cookie_domain = None
    host = request.headers.get('Host', '')
    if 'onnamu.kr' in host:
        cookie_domain = '.onnamu.kr'
    response.delete_cookie('auth_token', domain=cookie_domain)
    return response

@app.route("/")
@login_required()
def gallery():
    tab = request.args.get("tab", "videos")
    page = int(request.args.get("page", 1))
    
    # session 대신 g.user 페이로드에서 유효 정보 획득
    username = g.user.get("username")
    folders = g.user.get("folders", [])
    is_admin = g.user.get("is_admin", False)
    
    if tab == "images":
        all_files = get_all_files(folders, IMAGE_EXTS, "images")
        media_type = "image"
    else:
        all_files = get_all_files(folders, VIDEO_EXTS, "videos")
        media_type = "video"
        
    total = len(all_files)
    total_pages = max(1, math.ceil(total / PER_PAGE))
    page = max(1, min(page, total_pages))
    start = (page - 1) * PER_PAGE
    files = all_files[start:start + PER_PAGE]
    
    return render_template("gallery.html", files=files, media_type=media_type, tab=tab, page=page, total_pages=total_pages, total=total, username=username, is_admin=is_admin, available_folders=folders)

@app.route("/movies")
@login_required()
def movies():
    username = g.user.get("username")
    folders = g.user.get("folders", [])
    is_admin = g.user.get("is_admin", False)
    all_movies = get_all_files(folders, MOVIE_EXTS, "movies")
    return render_template("movies.html", movies=all_movies, username=username, is_admin=is_admin, format_size=format_size)

@app.route("/player/<folder>/<path:filename>")
@login_required()
def player(folder, filename):
    username = g.user.get("username")
    folders = g.user.get("folders", [])
    if folder not in folders:
        abort(403)
    movie_path = MEDIA_ROOT / folder / "movies" / filename
    if not movie_path.exists():
        abort(404)
    subtitle = find_subtitle(movie_path.parent, movie_path.stem)
    return render_template("player.html", folder=folder, filename=filename, subtitle=subtitle, username=username)

@app.route("/stream/<folder>/<path:filename>")
@login_required()
def stream_movie(folder, filename):
    folders = g.user.get("folders", [])
    if folder not in folders:
        abort(403)
    file_path = MEDIA_ROOT / folder / "movies" / filename
    if not file_path.exists():
        abort(404)
    range_header = request.headers.get('Range', None)
    if not range_header:
        return send_from_directory(str(file_path.parent), file_path.name)
    size = file_path.stat().st_size
    byte1, byte2 = 0, None
    m = re.search(r'(\d+)-(\d*)', range_header)
    if m:
        g_match = m.groups()
        byte1 = int(g_match[0])
        if g_match[1]:
            byte2 = int(g_match[1])
    if byte2 is None:
        byte2 = size - 1
    length = byte2 - byte1 + 1
    with open(file_path, 'rb') as f:
        f.seek(byte1)
        data = f.read(length)
    rv = Response(data, 206, direct_passthrough=True)
    rv.headers.add('Content-Range', f'bytes {byte1}-{byte2}/{size}')
    rv.headers.add('Accept-Ranges', 'bytes')
    rv.headers.add('Content-Length', str(length))
    ext = file_path.suffix.lower()
    mime = {'.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.webm': 'video/webm'}.get(ext, 'video/mp4')
    rv.headers.add('Content-Type', mime)
    return rv

@app.route("/subtitle/<folder>/<path:filename>")
@login_required()
def serve_subtitle(folder, filename):
    folders = g.user.get("folders", [])
    if folder not in folders:
        abort(403)
    directory = MEDIA_ROOT / folder / "movies"
    return send_from_directory(str(directory), filename)

@app.route("/upload", methods=["GET", "POST"])
@login_required()
def upload():
    username = g.user.get("username")
    folders = g.user.get("folders", [])
    is_admin_user = g.user.get("is_admin", False)
    
    if request.method == "GET":
        return render_template("upload.html", is_admin=is_admin_user, available_folders=folders, username=username)
        
    if "file" not in request.files:
        flash("⚠️ 파일이 선택되지 않았습니다.", "warning")
        return redirect(request.url)
    file = request.files["file"]
    if file.filename == "":
        flash("⚠️ 파일이 선택되지 않았습니다.", "warning")
        return redirect(request.url)
        
    filename = get_safe_filename(file.filename)
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXTS:
        flash(f"⚠️ 허용되지 않는 파일 형식입니다: {ext}", "warning")
        return redirect(request.url)
        
    if is_admin_user:
        target_folder = request.form.get("folder", "public")
        if target_folder not in folders:
            target_folder = folders[0]
    else:
        writable = [f for f in folders if f != "public"]
        target_folder = writable[0] if writable else folders[0]
        
    media_type = "videos" if ext in VIDEO_EXTS else "images"
    save_dir = MEDIA_ROOT / target_folder / media_type
    save_dir.mkdir(parents=True, exist_ok=True)
    save_path = save_dir / filename
    counter = 1
    original_stem = Path(filename).stem
    while save_path.exists():
        filename = f"{original_stem}_{counter}{ext}"
        save_path = save_dir / filename
        counter += 1
    try:
        file.save(str(save_path))
        flash(f"✅ 업로드 완료: {target_folder}/{media_type}/{filename}", "success")
    except Exception as e:
        flash(f"❌ 업로드 실패: {str(e)}", "error")
    return redirect(url_for("upload"))

@app.route("/manage")
@login_required(admin_only=True)
def manage():
    tab = request.args.get("tab", "videos")
    page = int(request.args.get("page", 1))
    folders = g.user.get("folders", [])
    
    if tab == "images":
        all_files = get_all_files(folders, IMAGE_EXTS, "images")
    elif tab == "movies":
        all_files = get_all_files(folders, MOVIE_EXTS, "movies")
    else:
        all_files = get_all_files(folders, VIDEO_EXTS, "videos")
        tab = "videos"

    total = len(all_files)
    total_pages = max(1, math.ceil(total / PER_PAGE))
    page = max(1, min(page, total_pages))
    start = (page - 1) * PER_PAGE
    files = all_files[start:start + PER_PAGE]
    
    return render_template(
        "manage.html", 
        files=files, 
        tab=tab, 
        page=page,
        total_pages=total_pages,
        total=total,
        available_folders=folders
    )

@app.route("/api/move", methods=["POST"])
@login_required(admin_only=True)
def move_file():
    data = request.get_json()
    old_folder = data.get("old_folder")
    new_folder = data.get("new_folder")
    tab = data.get("tab")
    filename = data.get("filename")
    if not all([old_folder, new_folder, tab, filename]):
        return jsonify({"success": False, "error": "잘못된 요청"}), 400
    try:
        media_type = tab
        old_file = MEDIA_ROOT / old_folder / media_type / filename
        new_file = MEDIA_ROOT / new_folder / media_type / filename
        if not old_file.exists():
            return jsonify({"success": False, "error": "파일이 존재하지 않습니다"}), 404
        new_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(old_file), str(new_file))
        return jsonify({"success": True, "message": f"✅ {filename} → {new_folder}"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/delete", methods=["POST"])
@login_required(admin_only=True)
def delete_file():
    data = request.get_json()
    folder = data.get("folder")
    tab = data.get("tab")
    filename = data.get("filename")
    if not all([folder, tab, filename]):
        return jsonify({"success": False, "error": "잘못된 요청"}), 400
    try:
        media_type = tab
        full_path = MEDIA_ROOT / folder / media_type / filename
        if not full_path.exists():
            return jsonify({"success": False, "error": "파일이 존재하지 않습니다"}), 404
        full_path.unlink()
        if media_type == "images":
            thumb_path = THUMBNAIL_DIR / folder / media_type / f"{Path(filename).stem}_thumb.jpg"
            if thumb_path.exists():
                thumb_path.unlink()
        return jsonify({"success": True, "message": f"🗑️ {filename} 삭제됨"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/thumbnail/<folder>/<media_type>/<path:filename>")
@login_required()
def serve_thumbnail(folder, media_type, filename):
    folders = g.user.get("folders", [])
    if folder not in folders:
        abort(403)
    original_path = MEDIA_ROOT / folder / media_type / filename
    if not original_path.exists():
        abort(404)
    if media_type != "images":
        return send_from_directory(str(original_path.parent), filename)
    thumb_dir = THUMBNAIL_DIR / folder / media_type
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb_filename = f"{Path(filename).stem}_thumb.jpg"
    thumb_path = thumb_dir / thumb_filename
    if not thumb_path.exists():
        try:
            with Image.open(original_path) as img:
                if img.mode in ("RGBA", "P"):
                    img = img.convert('RGB')
                img.thumbnail((400, 400))
                img.save(thumb_path, format="JPEG", quality=80)
        except Exception as e:
            return send_from_directory(str(original_path.parent), filename)
    return send_from_directory(str(thumb_dir), thumb_filename)

@app.route("/media/<folder>/<media_type>/<path:filename>")
@login_required()
def serve_media(folder, media_type, filename):
    folders = g.user.get("folders", [])
    if folder not in folders:
        abort(403)
    directory = MEDIA_ROOT / folder / media_type
    if not directory.exists():
        abort(404)
    return send_from_directory(str(directory), filename)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=False)
