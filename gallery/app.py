import os
import re
import json
import math
import shutil
from pathlib import Path
from PIL import Image
from flask import (
    Flask, render_template, request, session,
    redirect, url_for, send_from_directory, abort, flash, jsonify, Response
)
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "change-me-in-production")
app.config['SESSION_COOKIE_DOMAIN'] = '.onnamu.kr'

# ═══════════════════════════════════════════════════════════
# 사용자 설정 - 아인아 진짜 되는지 확인
# ═══════════════════════════════════════════════════════════
USERS_JSON = os.environ.get("USERS_JSON", '''{
    "admin": {
        "password": "admin123",
        "folders": ["public", "private", "family"],
        "is_admin": true
    },
    "family": {
        "password": "family123",
        "folders": ["public", "family"],
        "is_admin": false
    }
}''')

try:
    USERS = json.loads(USERS_JSON)
except json.JSONDecodeError:
    USERS = {
        "admin": {"password": "admin123", "folders": ["public", "private", "family"], "is_admin": True},
        "family": {"password": "family123", "folders": ["public", "family"], "is_admin": False}
    }

MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", "/media"))

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".avi"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
MOVIE_EXTS = {".mp4", ".mkv", ".avi", ".mov", ".webm"}
SUBTITLE_EXTS = {".srt", ".vtt", ".ass"}

ALLOWED_UPLOAD_EXTS = VIDEO_EXTS | IMAGE_EXTS
PER_PAGE = 24


# ═══════════════════════════════════════════════════════════
# 로그아웃 후 캐시 방지
# ═══════════════════════════════════════════════════════════
@app.after_request
def add_no_cache(response):
    """로그인 필요 페이지는 브라우저 캐시 방지"""
    if request.endpoint in ['gallery', 'movies', 'player', 'upload', 'manage']:
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response


# ═══════════════════════════════════════════════════════════
# 유틸리티
# ═══════════════════════════════════════════════════════════
def get_all_files(folders: list, extensions: set, media_type: str) -> list[dict]:
    """폴더별 파일 수집"""
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
                # 영화인 경우 자막과 크기 정보 추가
                if media_type == "movies":
                    subtitle = find_subtitle(folder_path, f.stem)
                    if subtitle:
                        file_info["subtitle"] = f"{folder}/{media_type}/{subtitle}"
                    file_info["size"] = f.stat().st_size
                
                all_files.append(file_info)
    
    return sorted(all_files, key=lambda x: x['name'])


def find_subtitle(directory: Path, video_stem: str) -> str:
    """동영상과 같은 이름의 자막 파일 찾기"""
    for ext in SUBTITLE_EXTS:
        subtitle_file = directory / f"{video_stem}{ext}"
        if subtitle_file.exists():
            return subtitle_file.name
        # 언어 코드 포함 (예: movie.ko.srt)
        for lang_file in directory.glob(f"{video_stem}.*{ext}"):
            return lang_file.name
    return None


def format_size(size_bytes: int) -> str:
    """파일 크기 포맷"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} PB"


def require_login(fn):
    from functools import wraps
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("logged_in"):
            return redirect(url_for("login", next=request.url))
        return fn(*args, **kwargs)
    return wrapper


def admin_required(fn):
    from functools import wraps
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("is_admin"):
            flash("⛔ 관리자 권한이 필요합니다.", "error")
            return redirect(url_for("gallery"))
        return fn(*args, **kwargs)
    return wrapper


# ═══════════════════════════════════════════════════════════
# 인증
# ═══════════════════════════════════════════════════════════
@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        
        user = USERS.get(username)
        if user and user["password"] == password:
            session.permanent = False  # 브라우저 닫으면 세션 종료
            session["logged_in"] = True
            session["username"] = username
            session["folders"] = user["folders"]
            session["is_admin"] = user.get("is_admin", False)
            
            next_url = request.args.get("next") or url_for("gallery")
            flash(f"✅ {username}님 환영합니다!", "success")
            return redirect(next_url)
        
        error = "아이디 또는 비밀번호가 틀렸습니다."
    
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    username = session.get("username", "사용자")
    session.clear()
    flash(f"👋 {username}님 로그아웃 되었습니다.", "info")
    
    # 로그아웃 후 캐시 방지
    response = redirect(url_for("login"))
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


# ═══════════════════════════════════════════════════════════
# 갤러리 (Videos/Images)
# ═══════════════════════════════════════════════════════════
@app.route("/")
@require_login
def gallery():
    tab = request.args.get("tab", "videos")
    page = int(request.args.get("page", 1))
    
    username = session.get("username")
    folders = session.get("folders", [])
    
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
    
    return render_template(
        "gallery.html",
        files=files,
        media_type=media_type,
        tab=tab,
        page=page,
        total_pages=total_pages,
        total=total,
        username=username,
        is_admin=session.get("is_admin", False),
        available_folders=folders
    )


# ═══════════════════════════════════════════════════════════
# 🎬 영화관 (Movies)
# ═══════════════════════════════════════════════════════════
@app.route("/movies")
@require_login
def movies():
    """영화 목록"""
    username = session.get("username")
    folders = session.get("folders", [])
    
    all_movies = get_all_files(folders, MOVIE_EXTS, "movies")
    
    return render_template(
        "movies.html",
        movies=all_movies,
        username=username,
        is_admin=session.get("is_admin", False),
        format_size=format_size
    )


@app.route("/player/<folder>/<path:filename>")
@require_login
def player(folder, filename):
    """영화 플레이어"""
    username = session.get("username")
    folders = session.get("folders", [])
    
    if folder not in folders:
        abort(403)
    
    movie_path = MEDIA_ROOT / folder / "movies" / filename
    if not movie_path.exists():
        abort(404)
    
    subtitle = find_subtitle(movie_path.parent, movie_path.stem)
    
    return render_template(
        "player.html",
        folder=folder,
        filename=filename,
        subtitle=subtitle,
        username=username
    )


@app.route("/stream/<folder>/<path:filename>")
@require_login
def stream_movie(folder, filename):
    """영화 스트리밍 (Range Request 지원)"""
    username = session.get("username")
    folders = session.get("folders", [])
    
    if folder not in folders:
        abort(403)
    
    file_path = MEDIA_ROOT / folder / "movies" / filename
    if not file_path.exists():
        abort(404)
    
    # Range Request 처리
    range_header = request.headers.get('Range', None)
    
    if not range_header:
        return send_from_directory(str(file_path.parent), file_path.name)
    
    # Range 파싱
    size = file_path.stat().st_size
    byte1, byte2 = 0, None
    
    m = re.search(r'(\d+)-(\d*)', range_header)
    if m:
        g = m.groups()
        byte1 = int(g[0])
        if g[1]:
            byte2 = int(g[1])
    
    if byte2 is None:
        byte2 = size - 1
    
    length = byte2 - byte1 + 1
    
    # 파일 읽기
    with open(file_path, 'rb') as f:
        f.seek(byte1)
        data = f.read(length)
    
    # 206 Partial Content
    rv = Response(data, 206, direct_passthrough=True)
    rv.headers.add('Content-Range', f'bytes {byte1}-{byte2}/{size}')
    rv.headers.add('Accept-Ranges', 'bytes')
    rv.headers.add('Content-Length', str(length))
    
    ext = file_path.suffix.lower()
    mime = {'.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
            '.mov': 'video/quicktime', '.webm': 'video/webm'}.get(ext, 'video/mp4')
    rv.headers.add('Content-Type', mime)
    
    return rv


@app.route("/subtitle/<folder>/<path:filename>")
@require_login
def serve_subtitle(folder, filename):
    """자막 파일"""
    folders = session.get("folders", [])
    if folder not in folders:
        abort(403)
    
    directory = MEDIA_ROOT / folder / "movies"
    return send_from_directory(str(directory), filename)


# ═══════════════════════════════════════════════════════════
# 업로드
# ═══════════════════════════════════════════════════════════
@app.route("/upload", methods=["GET", "POST"])
@require_login
def upload():
    username = session.get("username")
    folders = session.get("folders", [])
    is_admin_user = session.get("is_admin", False)
    
    if request.method == "GET":
        return render_template("upload.html", is_admin=is_admin_user, available_folders=folders)
    
    if "file" not in request.files:
        flash("⚠️ 파일이 선택되지 않았습니다.", "warning")
        return redirect(request.url)
    
    file = request.files["file"]
    if file.filename == "":
        flash("⚠️ 파일이 선택되지 않았습니다.", "warning")
        return redirect(request.url)
    
    filename = secure_filename(file.filename)
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


# ═══════════════════════════════════════════════════════════
# 파일 관리 (관리자)
# ═══════════════════════════════════════════════════════════
@app.route("/manage")
@require_login
@admin_required
def manage():
    all_folders = ["public", "private", "family"]
    videos = get_all_files(all_folders, VIDEO_EXTS, "videos")
    images = get_all_files(all_folders, IMAGE_EXTS, "images")
    return render_template("manage.html", videos=videos, images=images, all_folders=all_folders)


@app.route("/api/move", methods=["POST"])
@require_login
@admin_required
def move_file():
    data = request.get_json()
    old_path = data.get("old_path")
    new_folder = data.get("new_folder")
    
    if not old_path or not new_folder:
        return jsonify({"success": False, "error": "잘못된 요청"}), 400
    
    try:
        parts = old_path.split("/")
        if len(parts) != 3:
            raise ValueError("경로 형식 오류")
        
        old_folder, media_type, filename = parts
        old_file = MEDIA_ROOT / old_folder / media_type / filename
        new_file = MEDIA_ROOT / new_folder / media_type / filename
        
        if not old_file.exists():
            return jsonify({"success": False, "error": "파일이 존재하지 않습니다"}), 404
        
        new_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(old_file), str(new_file))
        
        new_path = f"{new_folder}/{media_type}/{filename}"
        return jsonify({"success": True, "message": f"✅ {filename} → {new_folder}", "new_path": new_path})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/delete", methods=["POST"])
@require_login
@admin_required
def delete_file():
    data = request.get_json()
    file_path = data.get("path")
    
    if not file_path:
        return jsonify({"success": False, "error": "잘못된 요청"}), 400
    
    try:
        parts = file_path.split("/")
        if len(parts) != 3:
            raise ValueError("경로 형식 오류")
        
        folder, media_type, filename = parts
        full_path = MEDIA_ROOT / folder / media_type / filename
        
        if not full_path.exists():
            return jsonify({"success": False, "error": "파일이 존재하지 않습니다"}), 404
        
        full_path.unlink()
        return jsonify({"success": True, "message": f"🗑️ {filename} 삭제됨"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ═══════════════════════════════════════════════════════════
# 썸네일 서빙 및 자동 생성 로직
# ═══════════════════════════════════════════════════════════
THUMBNAIL_DIR = Path("/app/.thumbnails")
THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)

@app.route("/thumbnail/<folder>/<media_type>/<path:filename>")
@require_login
def serve_thumbnail(folder, media_type, filename):
    folders = session.get("folders", [])
    if folder not in folders:
        abort(403)

    original_path = MEDIA_ROOT / folder / media_type / filename
    
    # 원본 파일이 없거나 이미지가 아닌 경우 원본 미디어 서빙 로직으로 우회
    if not original_path.exists() or media_type != "images":
        return send_from_directory(str(original_path.parent), filename)

    # 썸네일 저장 폴더 구성
    thumb_dir = THUMBNAIL_DIR / folder / media_type
    thumb_dir.mkdir(parents=True, exist_ok=True)
    
    # 썸네일 파일명 지정
    thumb_path = thumb_dir / f"thumb_{filename}"

    # 썸네일이 존재하지 않으면 즉석에서 생성 후 저장 (캐싱)
    if not thumb_path.exists():
        try:
            with Image.open(original_path) as img:
                if img.mode != 'RGB':
                    img = img.convert('RGB') # RGBA 등 호환성을 위해 RGB로 변환
                img.thumbnail((400, 400)) # 가로세로 최대 400px 비율 유지
                img.save(thumb_path, format="JPEG", quality=85)
        except Exception as e:
            print(f"썸네일 생성 실패: {e}")
            # 생성 실패 시 원본 이미지를 그대로 반환
            return send_from_directory(str(original_path.parent), filename)

    # 생성된(또는 이미 존재하는) 썸네일 반환
    return send_from_directory(str(thumb_dir), thumb_path.name)
# ═══════════════════════════════════════════════════════════
# 미디어 서빙
# ═══════════════════════════════════════════════════════════
@app.route("/media/<folder>/<media_type>/<path:filename>")
@require_login
def serve_media(folder, media_type, filename):
    folders = session.get("folders", [])
    
    if folder not in folders:
        abort(403)
    
    directory = MEDIA_ROOT / folder / media_type
    if not directory.exists():
        abort(404)
    
    return send_from_directory(str(directory), filename)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=False)
