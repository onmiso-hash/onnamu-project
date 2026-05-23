from flask import Flask, render_template

app = Flask(__name__)

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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
