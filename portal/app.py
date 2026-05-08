from flask import Flask, jsonify, render_template_string, render_template, request
import psutil
import sqlite3
import os

app = Flask(__name__)

# --- 데이터베이스 경로 설정 (영구 저장을 위해 data 폴더 지정) ---
# 도커 볼륨 설정과 일치해야 합니다. (예: C:\onmis\portal\data:/app/data)
DB_PATH = 'data/news.db'

def init_db():
    # data 폴더가 없으면 생성
    if not os.path.exists('data'):
        os.makedirs('data')
        
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS news_archive
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  category TEXT, title TEXT, content TEXT, 
                  published_date TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    conn.commit()
    conn.close()

# --- 통합 HTML 템플릿 (오빠의 원본 v3.5 기반 + v4.0 UI 최적화) ---
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>onnamu.kr | Home Hub</title>
    <script src='https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/index.global.min.js'></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: 'Segoe UI', -apple-system, sans-serif; 
            background: linear-gradient(135deg, #d4e1f5 0%, #f7e6e3 100%);
            color: #2c3e50; min-height: 100vh; padding: 40px 20px; line-height: 1.6;
        }
        .container { max-width: 900px; margin: 0 auto; }
        .topbar { 
            background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(10px);
            border-radius: 16px; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; 
            margin-bottom: 30px; border: 1px solid rgba(255, 255, 255, 0.3); box-shadow: 0 4px 15px rgba(0,0,0,0.05);
        }
        .topbar-title { font-size: 1.2rem; font-weight: 700; color: #2c3e50; }
        .topbar-meta { font-size: 0.8rem; color: #7f8c8d; }
        .section-label { 
            font-size: 0.7rem; font-weight: 700; color: #666; 
            text-transform: uppercase; letter-spacing: 2px; margin: 30px 0 15px 10px; 
        }
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 30px; }
        .glass-card { 
            background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(12px);
            border-radius: 20px; padding: 20px; border: 1px solid rgba(255, 255, 255, 0.3);
            box-shadow: 0 8px 32px rgba(0,0,0,0.1); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .stat-card { display: flex; flex-direction: column; justify-content: space-between; }
        .stat-label { font-size: 0.75rem; color: #7f8c8d; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
        .stat-value { font-size: 1.8rem; font-weight: 700; color: #2c3e50; font-variant-numeric: tabular-nums; }
        .progress-mini { height: 4px; background: rgba(0,0,0,0.05); margin-top: 15px; border-radius: 10px; overflow: hidden; }
        .progress-inner { height: 100%; width: 0%; background: #c084fc; transition: width 1s ease; }
        
        .services-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
        .service-link { display: flex; align-items: center; gap: 18px; text-decoration: none; color: inherit; }
        .service-link:hover { background: rgba(255, 255, 255, 0.3); transform: translateY(-3px); border-color: #c084fc; }
        .service-icon { 
            width: 48px; height: 48px; border-radius: 12px; background: rgba(192, 132, 252, 0.15);
            display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0;
        }
        .service-info h3 { font-size: 0.95rem; font-weight: 600; color: #2c3e50; }
        .service-info p { font-size: 0.75rem; color: #7f8c8d; margin-top: 1px; }
        .status-badge { 
            display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; 
            padding: 3px 10px; border-radius: 99px; margin-top: 10px; background: rgba(34, 197, 94, 0.1); color: #16a34a; border: 1px solid rgba(34, 197, 94, 0.2);
        }
        .dot { width: 6px; height: 6px; background: #22c55e; border-radius: 50%; display: inline-block; }
        .demo-badge { font-size: 0.65rem; border: 1px solid rgba(255, 255, 255, 0.4); padding: 2px 8px; border-radius: 4px; color: #7f8c8d; }

        /* --- 달력 및 뉴스 모달 v4.0 최적화 스타일 --- */
        #calendar { background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(12px); border-radius: 20px; padding: 20px; border: 1px solid rgba(255, 255, 255, 0.3); margin-bottom: 30px; font-size: 0.85rem; }
        .fc-daygrid-day { cursor: pointer; }
        .fc-daygrid-day:hover { background: rgba(192, 132, 252, 0.1) !important; }
        .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); backdrop-filter: blur(8px); z-index: 1000; }
        .modal { display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 95%; max-width: 650px; z-index: 1001; max-height: 80vh; display: flex; flex-direction: column; background: rgba(255, 255, 255, 0.95); border-radius: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
        .modal-header { padding: 20px; border-bottom: 1px solid rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; }
        .modal-body { padding: 20px; overflow-y: auto; }
        
        /* 뉴스 간격 조절 */
        .news-item-box { margin-bottom: 15px; } /* 뉴스 항목 간격 축소 */
        .news-content-text { white-space: pre-wrap; font-size: 0.95rem; line-height: 1.7; color: #2c3e50; }
        
        /* v4.0 핵심 수정: 화살표와 링크 한 줄 정렬 */
        .news-source-container { 
            display: flex; /* 가로 정렬 */
            align-items: center; /* 세로 중앙 정렬 */
            margin-top: 10px; 
            margin-bottom: 5px; 
        }
        .news-source-arrow { 
            width: 14px; /* 화살표 크기 조절 */
            height: 14px; 
            margin-right: 8px; /* 화살표와 텍스트 사이 간격 */
        }
        .news-content-text a { 
            color: #3b82f6; 
            text-decoration: none; 
            font-weight: 600; 
            font-size: 0.85rem;
            /* display: block; - v4.0에서 제거: 한 줄 정렬을 위해 */
        }
        
        /* 구분선 스타일 및 간격 조절 */
        .news-divider { 
            border: 0; 
            height: 1px; 
            background: linear-gradient(to right, transparent, rgba(0,0,0,0.2), transparent); 
            margin: 10px 0; /* 구분선 위아래 간격 축소 */
        }
        
        footer { margin-top: 60px; font-size: 0.8rem; color: #7f8c8d; text-align: center; }
        @media (max-width: 600px) { body { padding: 20px 15px; } .stats-grid { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="topbar">
            <span class="topbar-title">onnamu.kr hub</span>
            <span class="topbar-meta" id="update-time">Syncing...</span>
        </div>

        <div class="section-label">System Health</div>
        <div class="stats-grid">
            <div class="glass-card stat-card">
                <div class="stat-label">CPU Load</div>
                <div class="stat-value" id="cpu">-</div>
                <div class="progress-mini"><div class="progress-inner" id="cpu-bar"></div></div>
            </div>
            <div class="glass-card stat-card">
                <div class="stat-label">RAM Usage</div>
                <div class="stat-value" id="ram">-</div>
                <div class="progress-mini"><div class="progress-inner" id="ram-bar" style="background: #3b82f6;"></div></div>
            </div>
            <div class="glass-card stat-card">
                <div class="stat-label">DISK (C:)</div>
                <div class="stat-value" id="disk">-</div>
                <div class="progress-mini"><div class="progress-inner" id="disk-bar" style="background: #f59e0b;"></div></div>
                <p id="disk-sub" style="font-size: 0.7rem; color: #7f8c8d; margin-top: 8px;"></p>
            </div>
        </div>

        <div class="section-label">Daily News Archive</div>
        <div id='calendar'></div>

        <div class="section-label">Operational Services</div>
        <div class="services-grid">
            <a href="https://n8n.onnamu.kr" target="_blank" class="glass-card service-link">
                <div class="service-icon">⚙️</div>
                <div class="service-info">
                    <h3>n8n Automation</h3>
                    <p>Workflow & Bot Manager</p>
                    <div class="status-badge"><div class="dot"></div>Operational</div>
                </div>
            </a>
            <a href="https://gallery.onnamu.kr" target="_blank" class="glass-card service-link">
                <div class="service-icon">🖼️</div>
                <div class="service-info">
                    <h3>Media Gallery</h3>
                    <p>Personal Archive (Flask)</p>
                    <div class="status-badge"><div class="dot"></div>Operational</div>
                </div>
            </a>
            <a href="https://rdap.kr" target="_blank" class="glass-card service-link">
                <div class="service-icon">🌐</div>
                <div class="service-info">
                    <h3>onnamu RDAP</h3>
                    <p>Internet Resource Query</p>
                    <div class="status-badge"><div class="dot"></div>Operational</div>
                </div>
            </a>
            <a href="https://bootstrap.rdap.kr/dashboard" target="_blank" class="glass-card service-link">
                <div class="service-icon">📊</div>
                <div class="service-info">
                    <h3>RDAP Dashboard</h3>
                    <p>Real-time Stats & Monitoring</p>
                    <div class="status-badge"><div class="dot"></div>Operational</div>
                </div>
            </a>
            <a href="https://t.me/Jaeseung_minipc_bot" target="_blank" class="glass-card service-link">
                <div class="service-icon">🤖</div>
                <div class="service-info">
                    <h3>Jaeseung Bot</h3>
                    <p>Telegram Monitoring System</p>
                    <div class="status-badge"><div class="dot"></div>Online</div>
                </div>
            </a>
            <a href="http://stream.onnamu.kr:50002/movies" target="_blank" class="glass-card service-link">
                <div class="service-icon">🎬</div>
                <div class="service-info">
                    <h3>Movie Theater</h3>
                    <p>Large Media Streaming</p>
                    <div class="status-badge"><div class="dot"></div>Operational</div>
                </div>
            </a>
        </div>

        <div class="section-label" style="margin-top:20px;">Project Demos</div>
        <div class="services-grid">
            <a href="/v1" target="_blank" class="glass-card service-link">
                <div class="service-icon" style="background:rgba(255,255,255,0.05)">🏢</div><div class="service-info"><h3>Company Renewal v1</h3><p>Initial Concept Draft</p></div><span class="demo-badge">Draft</span>
            </a>
            <a href="/v2" target="_blank" class="glass-card service-link">
                <div class="service-icon" style="background:rgba(255,255,255,0.05)">🚀</div><div class="service-info"><h3>Company Renewal v2</h3><p>Final Production Prototype</p></div><span class="demo-badge">Draft</span>
            </a>
        </div>
        <footer>Managed by onmiso | onnamu.kr hub v3.5</footer>
    </div>

    <div class="modal-overlay" id="overlay" onclick="closeModal()"></div>
    <div class="modal" id="news-modal">
        <div class="modal-header"><h3 id="modal-date">뉴스 요약</h3><button style="background:none; border:none; font-size:1.5rem; cursor:pointer;" onclick="closeModal()">&times;</button></div>
        <div class="modal-body" id="modal-content"></div>
    </div>

    <script>
        function update() {
            fetch('/stats').then(r => r.json()).then(d => {
                document.getElementById('cpu').innerText = d.cpu + '%';
                document.getElementById('ram').innerText = d.ram + '%';
                document.getElementById('disk').innerText = d.disk_percent + '%';
                document.getElementById('disk-sub').innerText = d.disk_detail;
                document.getElementById('cpu-bar').style.width = d.cpu + '%';
                document.getElementById('ram-bar').style.width = d.ram + '%';
                document.getElementById('disk-bar').style.width = d.disk_percent + '%';
                document.getElementById('update-time').innerText = 'Last updated: ' + new Date().toLocaleTimeString();
            }).catch(() => {});
        }
        setInterval(update, 10000); update();

        document.addEventListener('DOMContentLoaded', function() {
            var calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
                initialView: 'dayGridMonth', locale: 'ko',
                headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
                dateClick: function(info) { fetchNews(info.dateStr); }
            });
            calendar.render();
        });

        function fetchNews(date) {
            fetch('/api/news/get?date=' + date).then(r => r.json()).then(data => {
                let content = document.getElementById('modal-content');
                document.getElementById('modal-date').innerText = date + " 뉴스 요약";
                if(data.length > 0) {
                    // v4.0 수정: 화살표와 원문 보기를 컨테이너(div)로 묶어 한 줄 정렬
                    content.innerHTML = data.map(n => `
                        <div class="news-item-box">
                            <div class="news-content-text">${n.content}</div>
                            <hr class="news-divider">
                        </div>
                    `).join('');
                } else { content.innerHTML = "<p style='text-align:center; padding:20px; color:#999;'>해당 날짜에 저장된 뉴스가 없습니다.</p>"; }
                document.getElementById('news-modal').style.display = 'flex';
                document.getElementById('overlay').style.display = 'block';
            });
        }
        function closeModal() { document.getElementById('news-modal').style.display = 'none'; document.getElementById('overlay').style.display = 'none'; }
    </script>
</body>
</html>
"""

@app.route('/')
def index(): return render_template_string(HTML_TEMPLATE)

@app.route('/v1')
def renewal_v1(): return render_template('renewal_v1.html')

@app.route('/v2')
def renewal_v2(): return render_template('renewal_v2.html')

@app.route('/stats')
def stats():
    cpu = psutil.cpu_percent(interval=None); ram = psutil.virtual_memory().percent
    try:
        disk = psutil.disk_usage('/host_c'); disk_percent = disk.percent
        disk_detail = f"{disk.used/(1024**3):.1f} GB / {disk.total/(1024**3):.1f} GB"
    except Exception: disk_percent = 0; disk_detail = "Error"
    return jsonify(cpu=cpu, ram=ram, disk_percent=disk_percent, disk_detail=disk_detail)

@app.route('/api/news/save', methods=['POST'])
def save_news():
    data = request.json
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("INSERT INTO news_archive (category, title, content, published_date) VALUES (?, ?, ?, ?)",
              (data.get('category'), data.get('title'), data.get('content'), data.get('date')))
    conn.commit(); conn.close()
    return jsonify(status="success")

@app.route('/api/news/get')
def get_news():
    date = request.args.get('date')
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("SELECT category, title, content FROM news_archive WHERE published_date = ?", (date,))
    rows = c.fetchall(); conn.close()
    return jsonify([{"category": r[0], "title": r[1], "content": r[2]} for r in rows])

if __name__ == '__main__':
    init_db(); app.run(host='0.0.0.0', port=5001)