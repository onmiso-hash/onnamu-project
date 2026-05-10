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
    c.execute('''CREATE TABLE IF NOT EXISTS work_history
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  category TEXT, title TEXT, content TEXT, 
                  work_date TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    c.execute('''CREATE TABLE IF NOT EXISTS news_archive
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  category TEXT, title TEXT, content TEXT, 
                  published_date TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    conn.commit()
    conn.close()

# --- 통합 HTML 템플릿 (UI 최적화 버전) ---
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>onnamu.kr | Hub</title>
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
            box-shadow: 0 8px 32px rgba(0,0,0,0.2); 
        }
        .section-label { 
            font-size: 0.7rem; font-weight: 700; color: #94a3b8; 
            text-transform: uppercase; letter-spacing: 2px; margin: 30px 0 15px 10px;
            display: flex; justify-content: space-between; align-items: center;
        }
        .label-btn { background: none; border: none; color: #a855f7; font-size: 0.65rem; font-weight: 700; cursor: pointer; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; }
        
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 30px; }
        .stat-card { display: flex; flex-direction: column; justify-content: space-between; }
        .stat-value { font-size: 1.8rem; font-weight: 700; color: #f1f5f9; }
        .progress-mini { height: 4px; background: rgba(255,255,255,0.05); margin-top: 15px; border-radius: 10px; overflow: hidden; }
        .progress-inner { height: 100%; width: 0%; background: #a855f7; transition: width 1s ease; }

        .heatmap-container { display: grid; grid-template-rows: repeat(7, 1fr); grid-auto-flow: column; gap: 4px; overflow-x: auto; padding-bottom: 8px; }
        .heatmap-cell { width: 12px; height: 12px; background: rgba(255, 255, 255, 0.05); border-radius: 2px; cursor: pointer; }
        .heatmap-cell.has-data { background: #a855f7; box-shadow: 0 0 8px rgba(168, 85, 247, 0.4); }

        .date-strip-container { display: flex; gap: 12px; overflow-x: auto; padding: 10px 0; scrollbar-width: none; }
        .date-item { min-width: 55px; display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; padding: 12px 8px; border-radius: 14px; }
        .date-item.today { background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.3); }
        .work-dot { width: 4px; height: 4px; background: #a855f7; border-radius: 50%; opacity: 0; }
        .work-dot.active { opacity: 1; box-shadow: 0 0 5px #a855f7; }

        .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); z-index: 1000; }
        .modal { display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 95%; max-width: 650px; z-index: 1001; max-height: 80vh; flex-direction: column; background: #1e293b; border-radius: 24px; border: 1px solid rgba(255,255,255,0.1); color: #f1f5f9; }
        .modal-header { padding: 24px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; }
        .modal-body { padding: 24px; overflow-y: auto; }
        .news-item-box { margin-bottom: 20px; } 
        .news-content-text { font-size: 0.95rem; line-height: 1.8; color: #cbd5e1; }
        .news-category { font-size: 1.15rem; font-weight: 800; color: #a855f7; margin-top: 25px; margin-bottom: 12px; display: block; border-left: 4px solid #a855f7; padding-left: 12px; }
        .news-title { font-weight: 700; color: #f1f5f9; margin-top: 15px; margin-bottom: 8px; font-size: 1rem; display: block; }
        .news-bullet { padding-left: 2rem; text-indent: -1.4rem; margin-bottom: 6px; display: block; color: #cbd5e1; }
        .news-content-text a { color: #a855f7; text-decoration: none; font-weight: 600; display: block; margin-top: 5px; }
        .news-divider { border: 0; height: 1px; background: linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent); margin: 15px 0; }
        
        .services-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
        .service-link { display: flex; align-items: center; gap: 18px; text-decoration: none; color: inherit; padding: 20px; border-radius: 20px; }
        footer { margin-top: 60px; font-size: 0.8rem; color: #64748b; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="topbar glass-card" style="display:flex; justify-content: space-between; margin-bottom: 30px;">
            <span style="font-weight:700;">onnamu.kr hub</span>
            <span id="update-time" style="font-size:0.8rem; color:#94a3b8;">Syncing...</span>
        </div>

        <div class="section-label">System Health</div>
        <div class="stats-grid">
            <div class="glass-card stat-card">
                <div style="font-size:0.75rem; color:#94a3b8; margin-bottom:8px;">CPU Load</div>
                <div class="stat-value" id="cpu">-</div>
                <div class="progress-mini"><div class="progress-inner" id="cpu-bar"></div></div>
            </div>
            <div class="glass-card stat-card">
                <div style="font-size:0.75rem; color:#94a3b8; margin-bottom:8px;">RAM Usage</div>
                <div class="stat-value" id="ram">-</div>
                <div class="progress-mini"><div class="progress-inner" id="ram-bar" style="background: #3b82f6;"></div></div>
            </div>
            <div class="glass-card stat-card">
                <div style="font-size:0.75rem; color:#94a3b8; margin-bottom:8px;">DISK (C:)</div>
                <div class="stat-value" id="disk">-</div>
                <div class="progress-mini"><div class="progress-inner" id="disk-bar" style="background: #f59e0b;"></div></div>
                <p id="disk-sub" style="font-size: 0.7rem; color: #64748b; margin-top: 8px;"></p>
            </div>
        </div>

        <div class="section-label">Server Work Heatmap</div>
        <div class="glass-card"><div id="heatmap" class="heatmap-container"></div></div>

        <div class="section-label">Work Timeline <button class="label-btn" onclick="gotoToday()">Today</button></div>
        <div class="glass-card date-strip-container" id="date-strip"></div>

        <div class="section-label">Services</div>
        <div class="services-grid">
            <a href="https://n8n.onnamu.kr" target="_blank" class="glass-card service-link">⚙️ <div><h3>n8n Automation</h3><p>Workflow Manager</p></div></a>
            <a href="https://gallery.onnamu.kr" target="_blank" class="glass-card service-link">🖼️ <div><h3>Media Gallery</h3><p>Personal Archive</p></div></a>
            <a href="https://rdap.kr" target="_blank" class="glass-card service-link">🌐 <div><h3>onnamu RDAP</h3><p>Internet Query</p></div></a>
        </div>
        <footer>Managed by onmiso | onnamu.kr hub v6.1</footer>
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
                // 히트맵/스트립은 작업 이력(work)을 기준 [cite: 1662]
                const resWork = await fetch('/api/work/events');
                const workEvents = await resWork.json();
                const workDates = new Set(workEvents.map(e => e.date));
                
                // 뉴스 데이터 존재 여부도 확인 (날짜 스트립 점 표기용) [cite: 1744]
                const resNews = await fetch('/api/news/events');
                const newsEvents = await resNews.json();
                const newsDates = new Set(newsEvents.map(e => e.date));

                renderHeatmap(workDates);
                renderDateStrip(newsDates);
            } catch (e) { console.error(e); }
        }

        function renderHeatmap(workDates) {
            const container = document.getElementById('heatmap');
            const today = new Date();
            const start = new Date(); start.setMonth(today.getMonth() - 6);
            for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
                const dateStr = formatDate(d);
                const cell = document.createElement('div');
                cell.className = 'heatmap-cell' + (workDates.has(dateStr) ? ' has-data' : '');
                cell.title = dateStr;
                cell.onclick = () => fetchWork(dateStr);
                container.appendChild(cell);
            }
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
                if(isToday) item.id = 'date-today';
                item.onclick = () => fetchNews(dateStr);
                item.innerHTML = `
                    <span style="font-size:0.65rem; color:#94a3b8; font-weight:600;">${days[d.getDay()]}</span>
                    <span style="font-size:1.1rem; font-weight:700;">${d.getDate()}</span>
                    <div class="work-dot ${newsDates.has(dateStr) ? 'active' : ''}"></div>
                `;
                container.appendChild(item);
            }
            setTimeout(gotoToday, 500);
        }

        function gotoToday() {
            const todayItem = document.getElementById('date-today');
            if (todayItem) todayItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }

        // ✨ 오빠의 요청사항 반영: 특정 문구 일반 텍스트 처리 로직 추가
        function fetchNews(date) {
            fetch('/api/news/get?date=' + date).then(r => r.json()).then(data => {
                let content = document.getElementById('modal-content');
                document.getElementById('modal-date').innerText = date + " 뉴스 요약";
                if(data.length > 0) {
                    content.innerHTML = data.map(n => {
                        const lines = n.content.split('\\n');
                        const formatted = lines.map(line => {
                            line = line.trim();
                            if (!line) return '';
                            
                            // 🚀 오빠의 요청: "요약해 드립니다" 포함 문장은 카테고리 강조 없이 일반 문자로 출력
                            if (line.includes('요약해 드립니다')) {
                                return `<span style="display:block; margin-bottom:10px; color:#cbd5e1;">${line}</span>`;
                            }

                            if (line.startsWith('🤖') || line.startsWith('📰') || line.includes('오늘의 주요 뉴스')) {
                                return `<span class="news-category">${line}</span>`;
                            }
                            if (line.startsWith('🔹')) return `<span class="news-title">${line}</span>`;
                            if (line.startsWith('•') || line.startsWith('-')) return `<span class="news-bullet">${line}</span>`;
                            return `<span style="display:block; margin-bottom:4px;">${line}</span>`;
                        }).join('');
                        return `<div class="news-item-box"><div class="news-content-text">${formatted}</div><hr class="news-divider"></div>`;
                    }).join('');
                } else { content.innerHTML = "<p style='text-align:center; padding:40px; color:#64748b;'>저장된 뉴스가 없습니다.</p>"; }
                document.getElementById('news-modal').style.display = 'flex';
                document.getElementById('overlay').style.display = 'block';
            });
        }

        function fetchWork(date) {
            fetch('/api/work/get?date=' + date).then(r => r.json()).then(data => {
                let content = document.getElementById('modal-content');
                document.getElementById('modal-date').innerText = date + " 작업 상세";
                if(data.length > 0) {
                    content.innerHTML = data.map(n => `
                        <div class="work-item-box">
                            <span class="news-category">${n.category}</span>
                            <div class="news-content-text">${n.content}</div>
                        </div>
                    `).join('');
                } else { content.innerHTML = "<p style='text-align:center; padding:40px; color:#64748b;'>기록된 작업이 없습니다.</p>"; }
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

@app.route('/api/work/save', methods=['POST'])
def save_work():
    data = request.json
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("INSERT INTO work_history (category, title, content, work_date) VALUES (?, ?, ?, ?)",
              (data.get('category'), data.get('title'), data.get('content'), data.get('date')))
    conn.commit(); conn.close()
    return jsonify(status="success")

@app.route('/api/work/get')
def get_work():
    date = request.args.get('date')
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("SELECT category, title, content FROM work_history WHERE work_date = ?", (date,))
    rows = c.fetchall(); conn.close()
    return jsonify([{"category": r[0], "title": r[1], "content": r[2]} for r in rows])

@app.route('/api/work/events')
def get_work_events():
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("SELECT DISTINCT work_date FROM work_history")
    rows = c.fetchall(); conn.close()
    return jsonify([{"date": r[0]} for r in rows])

if __name__ == '__main__':
    init_db(); app.run(host='0.0.0.0', port=5001)