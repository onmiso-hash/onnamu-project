import os
import subprocess
import tempfile

# 윈도우 마운트 대역(NTFS)에 임시 파일을 직접 적재하기 위해 rw 마운트된 public/videos/.temp 경로 강제 지정
if os.environ.get("MEDIA_ROOT"):
    temp_dir = os.path.join(os.environ["MEDIA_ROOT"], "public", "videos", ".temp")
    os.makedirs(temp_dir, exist_ok=True)
    os.environ["TMPDIR"] = temp_dir
    os.environ["TEMP"] = temp_dir
    os.environ["TMP"] = temp_dir
    # tempfile 모듈이 설정된 임시 경로를 강제 적용하도록 전역 포인터 재설정
    tempfile.tempdir = temp_dir
import re
import json
import math
import time
import base64
import shutil
import hashlib
import threading
from pathlib import Path
from urllib.parse import quote
from PIL import Image
from flask import (
    Flask, render_template, request,
    redirect, url_for, send_from_directory, abort, flash, jsonify, g
)
from auth_helper import login_required, verify_token, resolve_user, upload_allowed, current_identity
from cache_policy import is_immutable_media, IMMUTABLE, NO_STORE

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
# docker-compose에서 named volume을 물려두어 재배포해도 캐시가 남는다.
THUMBNAIL_DIR = Path("/app/.thumbnails")
THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)

# 썸네일 판번호. 썸네일을 '어떻게 만드는가'를 고치면 이 번호를 1 올린다.
# 썸네일 주소는 30일 캐시라, 번호를 안 올리면 폰이 옛 썸네일을 30일 더 보여준다.
# (화면·코드 수정은 번호와 무관하게 바로 반영된다 — 화면은 캐시하지 않으므로)
THUMB_VERSION = "1"

# ffmpeg 썸네일 생성 동시 실행 제한.
# 영화관 첫 진입 시 카드 여러 장이 한꺼번에 요청을 걸어 미니PC가 몰리는 것을 막는다.
THUMBNAIL_WORKERS = threading.Semaphore(2)

# 영상 직행 통로 (stream.onnamu.kr). 셋 다 없으면 기능이 꺼진 채 종전대로 동작한다.
STREAM_BASE_URL = os.environ.get("STREAM_BASE_URL", "").rstrip("/")
STREAM_SECRET = os.environ.get("STREAM_SECRET", "")
# 영화 한 편을 다 볼 시간은 넉넉히 준다. 재생 중에 기한이 끝나면 건너뛰기가 막힌다.
STREAM_TTL = int(os.environ.get("STREAM_TTL", 12 * 3600))

@app.context_processor
def inject_thumb_version():
    """모든 화면이 썸네일 판번호를 쓸 수 있게 한다."""
    return {"thumb_v": THUMB_VERSION}

@app.after_request
def add_no_cache(response):
    # 미디어 파일 원본·썸네일·자막만 30일 캐싱한다(부드러운 로딩과 서버 보호).
    # 판정은 cache_policy 한 벌에만 있다 — 확장자로 가르면 /player/영화.mp4 같은
    # 화면까지 얼어붙는다(2026-08-20 사고). 자세한 경위는 cache_policy.py 참고.
    if is_immutable_media(request.path, response.status_code):
        response.headers['Cache-Control'] = IMMUTABLE
        if 'Pragma' in response.headers: del response.headers['Pragma']
        if 'Expires' in response.headers: del response.headers['Expires']
    else:
        # 화면(HTML)과 그 안의 코드는 고치면 즉시 반영되어야 하므로 캐시를 막는다.
        response.headers['Cache-Control'] = NO_STORE
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
        # 폴더를 한 번만 훑는다. 예전에는 영화 한 편마다 자막을 찾느라 폴더를
        # 다시 훑어서 편수의 제곱으로 느려졌다.
        with os.scandir(folder_path) as it:
            entries = sorted(it, key=lambda e: e.name)
        subtitle_names = [e.name for e in entries
                          if os.path.splitext(e.name)[1].lower() in SUBTITLE_EXTS]
        for entry in entries:
            stem, ext = os.path.splitext(entry.name)
            if ext.lower() in extensions:
                file_info = {
                    "name": entry.name,
                    "stem": stem,
                    "folder": folder,
                    "path": f"{folder}/{media_type}/{entry.name}"
                }
                if media_type == "movies":
                    subtitle = match_subtitle(subtitle_names, stem)
                    if subtitle:
                        file_info["subtitle"] = f"{folder}/{media_type}/{subtitle}"
                    file_info["size"] = entry.stat().st_size
                all_files.append(file_info)
    return sorted(all_files, key=lambda x: x['name'])

def match_subtitle(subtitle_names: list, video_stem: str) -> str:
    # find_subtitle과 같은 규칙을 디스크가 아니라 이미 읽어둔 이름 목록에서 적용한다.
    for ext in SUBTITLE_EXTS:
        exact = f"{video_stem}{ext}"
        if exact in subtitle_names:
            return exact
        # find_subtitle의 glob(f"{stem}.*{ext}")과 같은 조건 — 예: 영화.ko.srt
        prefix = f"{video_stem}."
        min_len = len(video_stem) + 1 + len(ext)
        for name in subtitle_names:
            if name.startswith(prefix) and name.endswith(ext) and len(name) >= min_len:
                return name
    return None

def find_subtitle(directory: Path, video_stem: str) -> str:
    for ext in SUBTITLE_EXTS:
        subtitle_file = directory / f"{video_stem}{ext}"
        if subtitle_file.exists():
            return subtitle_file.name
        for lang_file in directory.glob(f"{video_stem}.*{ext}"):
            return lang_file.name
    return None

def build_stream_url(folder: str, filename: str) -> str:
    """영상 알맹이를 받아올 직행 주소를 만든다.

    목록·재생 화면은 gallery.onnamu.kr(클라우드플레어 경유)이 그대로 내지만,
    무거운 영상만 stream.onnamu.kr로 직접 받게 한다. 주소가 다르면 로그인 쿠키가
    따라가지 않으므로, 로그인 검사를 이미 통과한 여기서 기한이 붙은 서명을 만들어 준다.
    서명 규칙은 nginx의 secure_link_md5와 같다 — stream/nginx/stream.conf.tpl 참고.

    STREAM_BASE_URL이나 STREAM_SECRET이 없으면 None을 돌려준다.
    그때 화면은 종전처럼 /media 경로를 쓴다(직행 통로를 아직 안 열었을 때).
    """
    if not STREAM_BASE_URL or not STREAM_SECRET:
        return None
    path = f"/v/{folder}/movies/{filename}"
    expires = int(time.time()) + STREAM_TTL
    digest = hashlib.md5(f"{expires}{path} {STREAM_SECRET}".encode("utf-8")).digest()
    token = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return f"{STREAM_BASE_URL}{quote(path)}?md5={token}&expires={expires}"

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
    response.delete_cookie('gallery_auth_token')
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
    
    return render_template("gallery.html", files=files, media_type=media_type, tab=tab, page=page, total_pages=total_pages, total=total, username=username, is_admin=is_admin, available_folders=folders, can_upload=upload_allowed(g.user))

@app.route("/movies")
@login_required()
def movies():
    username = g.user.get("username")
    folders = g.user.get("folders", [])
    is_admin = g.user.get("is_admin", False)
    page = int(request.args.get("page", 1))
    all_movies = get_all_files(folders, MOVIE_EXTS, "movies")

    total = len(all_movies)
    total_pages = max(1, math.ceil(total / PER_PAGE))
    page = max(1, min(page, total_pages))
    start = (page - 1) * PER_PAGE
    movies_page = all_movies[start:start + PER_PAGE]

    return render_template("movies.html", movies=movies_page, page=page, total_pages=total_pages, total=total, username=username, is_admin=is_admin, format_size=format_size, can_upload=upload_allowed(g.user))

@app.route("/watch/<folder>/<path:filename>")
@login_required()
def player(folder, filename):
    # 주소가 /player/… 에서 /watch/… 로 바뀐 이유(2026-08-20):
    # 옛 주소로 받아 간 화면이 폰과 클라우드플레어에 30일 얼어붙어 있었다.
    # 규칙(cache_policy)만 고치면 새 화면은 안 얼지만, 이미 얼어붙은 것은
    # 같은 주소인 한 30일이 지나야 풀린다. 주소를 바꿔 그것들을 즉시 버린다.
    username = g.user.get("username")
    folders = g.user.get("folders", [])
    if folder not in folders:
        abort(403)
    movie_path = MEDIA_ROOT / folder / "movies" / filename
    if not movie_path.exists():
        abort(404)
    subtitle = find_subtitle(movie_path.parent, movie_path.stem)
    # 직행 통로가 열려 있으면 그쪽에서, 아니면 종전처럼 이 서버에서 영상을 받는다.
    video_url = build_stream_url(folder, filename) or f"/media/{quote(folder)}/movies/{quote(filename)}"
    return render_template("player.html", folder=folder, filename=filename, subtitle=subtitle, username=username, video_url=video_url)

@app.route("/player/<folder>/<path:filename>")
def player_moved(folder, filename):
    """옛 재생 주소로 들어온 즐겨찾기·방문기록을 새 주소로 보낸다."""
    return redirect(url_for("player", folder=folder, filename=filename))

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

    # 올릴 수 있는 사람인지 먼저 본다. 여기서 막으면 아래 폴더 고르기까지 갈 일이 없다.
    if not upload_allowed(g.user):
        return render_template("no_upload.html", username=username), 403

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
        
    # 일반 계정은 public에 올리지 않는다. 위 upload_allowed가 이미 막았으므로
    # 쓸 폴더가 없는 채로 여기 오지 않지만, 그래도 public으로 되돌리지는 않는다
    # — 옛 코드는 쓸 폴더가 없으면 folders[0](=public)으로 떨어졌다.
    writable = [f for f in folders if f != "public"]
    if is_admin_user:
        target_folder = request.form.get("folder", "public")
        if target_folder not in folders:
            target_folder = writable[0] if writable else "public"
    else:
        if not writable:
            flash("⚠️ 올릴 수 있는 폴더가 없습니다. 관리자에게 문의하세요.", "warning")
            return redirect(request.url)
        target_folder = writable[0]

    media_type_select = request.form.get("media_type_select", "gallery")
    if media_type_select == "movies" and ext in VIDEO_EXTS:
        media_type = "movies"
    else:
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

@app.route("/upload_chunk", methods=["POST"])
def upload_chunk():
    # AJAX 요청에 대한 API 전용 인증 검증 (302 리다이렉트 방지)
    secret = app.config.get('SECRET_KEY') or 'change-me-in-production'
    # 갤러리 표를 그대로 읽지 않는다 — 그 표는 30일 전 사람 것일 수 있다(2026-08-18 사고).
    # 화면 쪽 login_required와 똑같은 규칙을 쓴다.
    payload, _refresh, unknown = current_identity(secret)
    if unknown or not payload:
        return jsonify({"success": False, "error": "로그인 세션이 만료되었습니다. 다시 로그인해 주세요."}), 401
        
    upload_id = request.form.get("upload_id")
    chunk_index = request.form.get("chunk_index")
    total_chunks = request.form.get("total_chunks")
    
    if not upload_id or chunk_index is None or not total_chunks:
        return jsonify({"success": False, "error": "필수 파라미터 누락"}), 400
        
    if "file" not in request.files:
        return jsonify({"success": False, "error": "파일 청크가 전송되지 않았습니다."}), 400
        
    file = request.files["file"]
    
    # NTFS 임시 디렉토리에 chunks 폴더 생성
    temp_dir = tempfile.gettempdir()
    chunk_dir = Path(temp_dir) / "chunks" / upload_id
    chunk_dir.mkdir(parents=True, exist_ok=True)
    
    chunk_file_path = chunk_dir / f"chunk_{chunk_index}"
    
    try:
        file.save(str(chunk_file_path))
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": f"청크 저장 실패: {str(e)}"}), 500

@app.route("/upload_complete", methods=["POST"])
def upload_complete():
    # AJAX 요청에 대한 API 전용 인증 검증 (302 리다이렉트 방지)
    secret = app.config.get('SECRET_KEY') or 'change-me-in-production'
    # 갤러리 표를 그대로 읽지 않는다 — 그 표는 30일 전 사람 것일 수 있다(2026-08-18 사고).
    # 화면 쪽 login_required와 똑같은 규칙을 쓴다.
    payload, _refresh, unknown = current_identity(secret)
    if unknown or not payload:
        return jsonify({"success": False, "error": "로그인 세션이 만료되었습니다. 다시 로그인해 주세요."}), 401

    # 여기는 login_required를 지나지 않는 자리라(302를 막으려고 직접 검사한다)
    # 지금 권한도 직접 물어야 한다.
    user, blocked = resolve_user(payload, secret)
    if blocked:
        return jsonify({"success": False, "error": "계정을 쓸 수 없습니다. 다시 로그인해 주세요."}), 401
    if not upload_allowed(user):
        return jsonify({"success": False, "error": "이 계정은 갤러리에 올릴 수 없습니다."}), 403

    folders = user.get("folders", [])
    is_admin_user = user.get("is_admin", False)
    
    # JSON 요청 또는 Form 요청 모두 호환 가능하게 파싱
    data = request.get_json() or request.form
    upload_id = data.get("upload_id")
    raw_filename = data.get("filename")
    total_chunks = data.get("total_chunks")
    target_folder = data.get("folder")
    media_type_select = data.get("media_type_select", "gallery")
    
    if not upload_id or not raw_filename or total_chunks is None or not target_folder:
        return jsonify({"success": False, "error": "필수 파라미터 누락"}), 400
        
    try:
        total_chunks = int(total_chunks)
    except ValueError:
        return jsonify({"success": False, "error": "유효하지 않은 total_chunks 값입니다."}), 400
        
    writable = [f for f in folders if f != "public"]
    if is_admin_user:
        if target_folder not in folders:
            target_folder = writable[0] if writable else "public"
    else:
        if not writable:
            return jsonify({"success": False, "error": "올릴 수 있는 폴더가 없습니다."}), 403
        target_folder = writable[0]

    filename = get_safe_filename(raw_filename)
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXTS:
        return jsonify({"success": False, "error": f"허용되지 않는 파일 형식입니다: {ext}"}), 400
        
    if media_type_select == "movies" and ext in VIDEO_EXTS:
        media_type = "movies"
    else:
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
        
    temp_dir = tempfile.gettempdir()
    chunk_dir = Path(temp_dir) / "chunks" / upload_id
    if not chunk_dir.exists():
        return jsonify({"success": False, "error": "업로드된 청크 임시 디렉토리가 존재하지 않습니다."}), 404
        
    # 동일 NTFS 볼륨 내에 임시 병합 파일 생성 (메모리 누수 차단 및 스트리밍 복사)
    temp_merged_path = Path(temp_dir) / f"merged_{upload_id}{ext}"
    
    try:
        with open(temp_merged_path, 'wb') as merged_file:
            for idx in range(total_chunks):
                chunk_file = chunk_dir / f"chunk_{idx}"
                if not chunk_file.exists():
                    raise FileNotFoundError(f"순서 {idx}번에 해당하는 파일 조각이 누락되었습니다.")
                with open(chunk_file, 'rb') as cf:
                    shutil.copyfileobj(cf, merged_file)
                    
        # 병합 완료 후 청크 폴더 삭제
        shutil.rmtree(chunk_dir, ignore_errors=True)
        
        # 임시 파일을 최종 위치로 고속 이동
        shutil.move(str(temp_merged_path), str(save_path))
        
        flash(f"✅ 업로드 완료: {target_folder}/{media_type}/{filename}", "success")
        return jsonify({"success": True, "redirect_url": url_for("upload")})
    except Exception as e:
        if temp_merged_path.exists():
            temp_merged_path.unlink()
        return jsonify({"success": False, "error": f"파일 조각 병합 실패: {str(e)}"}), 500

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
    thumb_dir = THUMBNAIL_DIR / folder / media_type
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb_filename = f"{Path(filename).stem}_thumb.jpg"
    thumb_path = thumb_dir / thumb_filename
    if not thumb_path.exists():
        if media_type == "images":
            try:
                with Image.open(original_path) as img:
                    if img.mode in ("RGBA", "P"):
                        img = img.convert('RGB')
                    img.thumbnail((640, 360))
                    img.save(thumb_path, format="JPEG", quality=82)
            except Exception:
                return send_from_directory(str(original_path.parent), filename)
        else:
            # ffmpeg은 무거우므로 동시에 2개까지만 돌린다. 나머지 요청은 여기서 기다린다.
            with THUMBNAIL_WORKERS:
                # 기다리는 동안 다른 요청이 같은 썸네일을 이미 만들었을 수 있다.
                if not thumb_path.exists():
                    # ffmpeg으로 10초 지점 프레임 추출, 짧은 영상은 첫 프레임 fallback
                    # 동시 요청 시 같은 파일에 겹쳐 쓰지 않도록 임시 파일에 먼저 생성 후 원자적으로 교체
                    #
                    # ⚠ 임시 파일 이름은 반드시 .jpg로 끝나야 한다.
                    # ffmpeg은 출력 파일의 확장자로 muxer를 고르므로 .tmp로 끝나면
                    # "Error initializing the muxer ... Invalid argument"로 실패한다.
                    # (2026-07-09~08-16 사이 썸네일이 한 장도 생성되지 않은 원인)
                    tmp_path = thumb_dir / f".{thumb_filename}.{os.getpid()}.{threading.get_ident()}.tmp.jpg"
                    for seek in ("10", "0"):
                        subprocess.run(
                            ["ffmpeg", "-ss", seek, "-i", str(original_path),
                             "-frames:v", "1", "-vf", "scale=640:-2",
                             "-q:v", "3", str(tmp_path), "-y"],
                            capture_output=True, timeout=60
                        )
                        if tmp_path.exists():
                            break
                    if not tmp_path.exists():
                        abort(500)
                    os.replace(tmp_path, thumb_path)
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
