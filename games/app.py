import os
from flask import Flask, render_template, redirect, send_from_directory

app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

@app.after_request
def add_header(response):
    # Cloudflare Edge 및 브라우저 캐싱을 완벽 차단하는 무효화 헤더 강제 주입
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, proxy-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    response.headers["Surrogate-Control"] = "no-store"
    return response

@app.route('/')
def lobby():
    return render_template('index.html')

@app.route('/snake')
def snake():
    return render_template('snake.html')

@app.route('/2048')
def game_2048():
    return render_template('2048.html')

@app.route('/pong')
def pong():
    return render_template('pong.html')

@app.route('/flappy')
def flappy():
    return render_template('flappy.html')

@app.route('/shooter')
def shooter():
    return render_template('shooter.html')

@app.route('/cloud_crush')
def cloud_crush():
    return render_template('cloud_crush.html')

@app.route('/night_grove')
def night_grove():
    return render_template('night_grove.html')

# 성벽의 노래 — 디펜스 게임 빌드 결과(dist)를 wallsong/ 폴더째로 둔다
WALLSONG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wallsong')

@app.route('/wallsong')
def wallsong_root():
    return redirect('/wallsong/')

@app.route('/wallsong/')
@app.route('/wallsong/<path:filename>')
def wallsong(filename='index.html'):
    return send_from_directory(WALLSONG_DIR, filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
