from flask import Flask, render_template

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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
