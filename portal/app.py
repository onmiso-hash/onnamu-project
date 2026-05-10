from flask import Flask, jsonify, render_template_string, render_template, request
import psutil
import sqlite3
import os

app = Flask(__name__)

# --- 데이터베이스 경로 설정 ---
DB_PATH = 'data/news.db'

def init_db():
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

# --- 통합 HTML 템플릿 (탐색 버튼 및 스크롤 개선 버전) ---
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>onnamu.kr | Home Hub</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: 'Segoe UI', -apple-system, sans-serif; 
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            color: #f1f5f9; min-height: 100vh; padding: 40px 20px; line-height: 1.6;
        }
        .container { max-width: 900px; margin: 0 auto; }
        
        .glass-card { 
            background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(12px);
            border-radius: 20px; padding: 20px; border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 8px 32px rgba(0,0,0,0.2); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; padding: 16px 24px; }
        .topbar-title { font-size: 1.2rem; font-weight: 700; color: #f1f5f9; }
        .topbar-meta { font-size: 0.8rem; color: #94a3b8; }

        .section-label { 
            font-size: 0.7rem; font-weight: 700; color: #94a3b8; 
            text-transform: uppercase; letter-spacing: 2px; margin: 30px 0 15px 10px;
            display: flex; justify-content: space-between; align-items: center;
        }
        .label-btn { background: none; border: none; color: #a855f7; font-size: 0.65rem; font-weight: 700; cursor: pointer; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; }
        .label-btn:hover { background: rgba(168, 85, 247, 0.1); }

        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 30px; }
        .stat-card { display: flex; flex-direction: column; justify-content: space-between; }
        .stat-label { font-size: 0.75rem; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
        .stat-value { font-size: 1.8rem; font-weight: 700; color: #f1f5f9; font-variant-numeric: tabular-nums; }
        .progress-mini { height: 4px; background: rgba(255,255,255,0.05); margin-top: 15px; border-radius: 10px; overflow: hidden; }
        .progress-inner { height: 100%; width: 0%; background: #a855f7; transition: width 1s ease; }

        /* Navigation Control Wrapper */
        .nav-wrapper { position: relative; width: 100%; }
        .nav-controls { 
            position: absolute; top: 50%; transform: translateY(-50%); 
            width: 100%; display: flex; justify-content: space-between; 
            pointer-events: none; z-index: 5; padding: 0 5px;
        }
        .nav-btn { 
            width: 32px; height: 32px; border-radius: 50%; background: rgba(30, 41, 59, 0.8); 
            border: 1px solid rgba(255, 255, 255, 0.1); color: #f1f5f9; display: flex; 
            align-items: center; justify-content: center; cursor: pointer; pointer-events: auto;
            backdrop-filter: blur(4px); transition: all 0.2s;
        }
        .nav-btn:hover { background: #a855f7; border-color: #a855f7; }

        /* Heatmap Styles */
        .heatmap-container { 
            display: grid; grid-template-rows: repeat(7, 1fr); grid-auto-flow: column; 
            gap: 4px; overflow-x: auto; padding-bottom: 8px;
            scrollbar-width: thin; scrollbar-color: rgba(168, 85, 247, 0.3) transparent;
        }
        .heatmap-container::-webkit-scrollbar { height: 6px; }
        .heatmap-container::-webkit-scrollbar-thumb { background: rgba(168, 85, 247, 0.3); border-radius: 4px; }
        .heatmap-cell { width: 12px; height: 12px; background: rgba(255, 255, 255, 0.05); border-radius: 2px; cursor: pointer; transition: background 0.2s; }
        .heatmap-cell:hover { transform: scale(1.2); z-index: 10; background: rgba(255, 255, 255, 0.2); }
        .heatmap-cell.has-data { background: #a855f7; box-shadow: 0 0 8px rgba(168, 85, 247, 0.4); }

        /* Date Strip Styles */
        .date-strip-container { 
            display: flex; gap: 12px; overflow-x: auto; padding: 10px 0;
            scrollbar-width: none; -ms-overflow-style: none; scroll-behavior: smooth;
        }
        .date-strip-container::-webkit-scrollbar { display: none; }
        .date-item { 
            min-width: 55px; display: flex; flex-direction: column; align-items: center; 
            gap: 6px; cursor: pointer; padding: 12px 8px; border-radius: 14px; 
            transition: all 0.2s; border: 1px solid transparent;
        }
        .date-item:hover { background: rgba(255,255,255,0.08); }
        .date-item.today { background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.3); }
        .date-label { font-size: 0.65rem; color: #94a3b8; font-weight: 600; }
        .date-value { font-size: 1.1rem; font-weight: 700; color: #f1f5f9; }
        .news-dot { width: 4px; height: 4px; background: #a855f7; border-radius: 50%; opacity: 0; }
        .news-dot.active { opacity: 1; box-shadow: 0 0 5px #a855f7; }

        /* Services Grid */
        .services-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
        .service-link { display: flex; align-items: center; gap: 18px; text-decoration: none; color: inherit; }
        .service-link:hover { background: rgba(255, 255, 255, 0.1); transform: translateY(-3px); border-color: #a855f7; }
        .service-icon { 
            width: 48px; height: 48px; border-radius: 12px; background: rgba(168, 85, 247, 0.1);
            display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0;
        }
        .service-info h3 { font-size: 0.95rem; font-weight: 600; color: #f1f5f9; }
        .service-info p { font-size: 0.75rem; color: #94a3b8; margin-top: 1px; }
        .status-badge { 
            display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; 
            padding: 3px 10px; border-radius: 99px; margin-top: 10px; background: rgba(34, 197, 94, 0.1); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.1);
        }
        .status-dot { width: 6px; height: 6px; background: #4ade80; border-radius: 50%; display: inline-block; }
        .demo-badge { font-size: 0.65rem; border: 1px solid rgba(255, 255, 255, 0.1); padding: 2px 8px; border-radius: 4px; color: #94a3b8; }

        /* Modal Styles */
        .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); z-index: 1000; }
        .modal { display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 95%; max-width: 650px; z-index: 1001; max-height: 80vh; flex-direction: column; background: #1e293b; border-radius: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); color: #f1f5f9; }
        .modal-header { padding: 24px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; }
        .modal-body { padding: 24px; overflow-y: auto; }
        .news-item-box { margin-bottom: 20px; } 
        .news-content-text { white-space: pre-wrap; font-size: 0.95rem; line-height: 1.8; color: #cbd5e1; }
        .news-divider { border: 0; height: 1px; background: linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent); margin: 15px 0; }
        
        footer { margin-top: 60px; font-size: 0.8rem; color: #64748b; text-align: center; }
        @media (max-width: 600px) { body { padding: 20px 15px; } .stats-grid { grid-template-columns: 1fr; } .nav-controls { display: none; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="topbar glass-card">
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
                <p id="disk-sub" style="font-size: 0.7rem; color: #64748b; margin-top: 8px;"></p>
            </div>
        </div>

        <div class="section-label">
            News Archive Heatmap
            <button class="label-btn" onclick="scrollHeatmap('end')">Most Recent</button>
        </div>
        <div class="nav-wrapper">
            <div class="glass-card heatmap-wrapper">
                <div id="heatmap" class="heatmap-container"></div>
            </div>
        </div>

        <div class="section-label">
            Recent Timeline
            <button class="label-btn" onclick="gotoToday()">Today</button>
        </div>
        <div class="nav-wrapper">
            <div class="nav-controls">
                <button class="nav-btn" onclick="scrollDateStrip(-200)">&lt;</button>
                <button class="nav-btn" onclick="scrollDateStrip(200)">&gt;</button>
            </div>
            <div class="glass-card date-strip-wrapper">
                <div id="date-strip" class="date-strip-container"></div>
            </div>
        </div>

        <div class="section-label">Operational Services</div>
        <div class="services-grid">
            <a href="https://n8n.onnamu.kr" target="_blank" class="glass-card service-link">
                <div class="service-icon">⚙️</div>
                <div class="service-info"><h3>n8n Automation</h3><p>Workflow & Bot Manager</p><div class="status-badge"><div class="status-dot"></div>Operational</div></div>
            </a>
            <a href="https://gallery.onnamu.kr" target="_blank" class="glass-card service-link">
                <div class="service-icon">🖼️</div>
                <div class="service-info"><h3>Media Gallery</h3><p>Personal Archive (Flask)</p><div class="status-badge"><div class="status-dot"></div>Operational</div></div>
            </a>
            <a href="https://rdap.kr" target="_blank" class="glass-card service-link">
                <div class="service-icon">🌐</div>
                <div class="service-info"><h3>onnamu RDAP</h3><p>Internet Resource Query</p><div class="status-badge"><div class="status-dot"></div>Operational</div></div>
            </a>
            <a href="https://bootstrap.rdap.kr/dashboard" target="_blank" class="glass-card service-link">
                <div class="service-icon">📊</div>
                <div class="service-info"><h3>RDAP Dashboard</h3><p>Real-time Stats & Monitoring</p><div class="status-badge"><div class="status-dot"></div>Operational</div></div>
            </a>
            <a href="https://t.me/Jaeseung_minipc_bot" target="_blank" class="glass-card service-link">
                <div class="service-icon">🤖</div>
                <div class="service-info"><h3>Jaeseung Bot</h3><p>Telegram Monitoring System</p><div class="status-badge"><div class="status-dot"></div>Online</div></div>
            </a>
            <a href="http://stream.onnamu.kr:50002/movies" target="_blank" class="glass-card service-link">
                <div class="service-icon">🎬</div>
                <div class="service-info"><h3>Movie Theater</h3><p>Large Media Streaming</p><div class="status-badge"><div class="status-dot"></div>Operational</div></div>
            </a>
        </div>

        <div class="section-label" style="margin-top:20px;">Project Demos</div>
        <div class="services-grid">
            <a href="/v1" target="_blank" class="glass-card service-link">
                <div class="service-icon" style="background:rgba(255,255,255,0.03)">🏢</div><div class="service-info"><h3>Company Renewal v1</h3><p>Initial Concept Draft</p></div><span class="demo-badge">Draft</span>
            </a>
            <a href="/v2" target="_blank" class="glass-card service-link">
                <div class="service-icon" style="background:rgba(255,255,255,0.03)">🚀</div><div class="service-info"><h3>Company Renewal v2</h3><p>Final Production Prototype</p></div><span class="demo-badge">Draft</span>
            </a>
        </div>
        <footer>Managed by onmiso | onnamu.kr hub v5.1</footer>
    </div>

    <div class="modal-overlay" id="overlay" onclick="closeModal()"></div>
    <div class="modal" id="news-modal">
        <div class="modal-header"><h3 id="modal-date">뉴스 요약</h3><button style="background:none; border:none; color:#94a3b8; font-size:1.5rem; cursor:pointer;" onclick="closeModal()">&times;</button></div>
        <div class="modal-body" id="modal-content"></div>
    </div>

    <script>
        function updateStats() {
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
        setInterval(updateStats, 10000); updateStats();

        function formatDate(date) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }

        async function initArchiveUI() {
            try {
                const res = await fetch('/api/news/events');
                const events = await res.json();
                const newsDates = new Set(events.map(e => e.date));
                renderHeatmap(newsDates);
                renderDateStrip(newsDates);
            } catch (e) { console.error(e); }
        }

        function renderHeatmap(newsDates) {
            const container = document.getElementById('heatmap');
            const today = new Date();
            const start = new Date();
            start.setMonth(today.getMonth() - 6);
            start.setDate(start.getDate() - start.getDay());

            const fragment = document.createDocumentFragment();
            for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
                const dateStr = formatDate(d);
                const cell = document.createElement('div');
                cell.className = 'heatmap-cell' + (newsDates.has(dateStr) ? ' has-data' : '');
                cell.title = dateStr;
                cell.onclick = () => fetchNews(dateStr);
                fragment.appendChild(cell);
            }
            container.appendChild(fragment);
            setTimeout(() => { container.scrollLeft = container.scrollWidth; }, 300);
        }

        function renderDateStrip(newsDates) {
            const container = document.getElementById('date-strip');
            const today = new Date();
            const todayStr = formatDate(today);
            const start = new Date(); start.setDate(today.getDate() - 30);
            const end = new Date(); end.setDate(today.getDate() + 14);
            const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dateStr = formatDate(d);
                const isToday = dateStr === todayStr;
                const item = document.createElement('div');
                item.className = 'date-item' + (isToday ? ' today' : '');
                item.id = isToday ? 'date-today' : '';
                item.onclick = () => fetchNews(dateStr);
                item.innerHTML = `<span class="date-label">${days[d.getDay()]}</span><span class="date-value">${d.getDate()}</span><div class="news-dot ${newsDates.has(dateStr) ? 'active' : ''}"></div>`;
                container.appendChild(item);
            }
            setTimeout(gotoToday, 500);
        }

        function scrollDateStrip(offset) { document.getElementById('date-strip').scrollLeft += offset; }
        function scrollHeatmap(pos) { const c = document.getElementById('heatmap'); if(pos==='end') c.scrollLeft = c.scrollWidth; }
        function gotoToday() {
            const todayItem = document.getElementById('date-today');
            if (todayItem) todayItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }

        function fetchNews(date) {
            fetch('/api/news/get?date=' + date).then(r => r.json()).then(data => {
                let content = document.getElementById('modal-content');
                document.getElementById('modal-date').innerText = date + " 뉴스 요약";
                if(data.length > 0) {
                    content.innerHTML = data.map(n => `
                        <div class="news-item-box">
                            <div class="news-content-text">${n.content}</div>
                            <hr class="news-divider">
                        </div>
                    `).join('');
                } else { content.innerHTML = "<p style='text-align:center; padding:40px; color:#64748b;'>저장된 뉴스가 없습니다.</p>"; }
                document.getElementById('news-modal').style.display = 'flex';
                document.getElementById('overlay').style.display = 'block';
            });
        }
        function closeModal() { document.getElementById('news-modal').style.display = 'none'; document.getElementById('overlay').style.display = 'none'; }
        document.addEventListener('DOMContentLoaded', initArchiveUI);
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
        disk_path = '/host_c' if os.path.exists('/host_c') else '/'
        disk = psutil.disk_usage(disk_path); disk_percent = disk.percent
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

@app.route('/api/news/events')
def get_news_events():
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("SELECT DISTINCT published_date FROM news_archive")
    rows = c.fetchall(); conn.close()
    return jsonify([{"date": r[0]} for r in rows])

if __name__ == '__main__':
    init_db(); app.run(host='0.0.0.0', port=5001)