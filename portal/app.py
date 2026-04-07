from flask import Flask, jsonify, render_template_string, render_template
import psutil

app = Flask(__name__)

# --- 리뉴얼된 메인 포털 디자인 (Soft Glassmorphism) ---
# 이 변수 하나에 새로운 디자인을 다 담았습니다. 파일 경로 문제가 생길 수 없습니다.
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>onnamu.kr | Home Hub</title>
    <style>
        /* 시스템 폰트 사용 (미니멀리즘 유지) */
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body { 
            font-family: 'Segoe UI', -apple-system, sans-serif; 
            /* 은은한 cool/warm 그라데이션 배경 */
            background: linear-gradient(135deg, #d4e1f5 0%, #f7e6e3 100%);
            color: #2c3e50; 
            min-height: 100vh;
            padding: 40px 20px;
            line-height: 1.6;
        }

        .container { max-width: 900px; margin: 0 auto; }

        /* Topbar - Glass panel */
        .topbar { 
            background: rgba(255, 255, 255, 0.2); 
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border-radius: 16px; 
            padding: 16px 24px; 
            display: flex; justify-content: space-between; align-items: center; 
            margin-bottom: 30px;
            border: 1px solid rgba(255, 255, 255, 0.3);
            box-shadow: 0 4px 15px rgba(0,0,0,0.05);
        }
        .topbar-title { font-size: 1.2rem; font-weight: 700; color: #2c3e50; }
        .topbar-meta { font-size: 0.8rem; color: #7f8c8d; }

        .section-label { 
            font-size: 0.7rem; font-weight: 700; color: #666; 
            text-transform: uppercase; letter-spacing: 2px; margin: 30px 0 15px 10px; 
        }

        /* Stats Grid */
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 30px; }
        
        /* Glass Card Base Style */
        .glass-card { 
            background: rgba(255, 255, 255, 0.2); 
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-radius: 20px; 
            padding: 20px; 
            border: 1px solid rgba(255, 255, 255, 0.3);
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* Stat Card */
        .stat-card { display: flex; flex-direction: column; justify-content: space-between; }
        .stat-label { font-size: 0.75rem; color: #7f8c8d; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
        .stat-value { font-size: 1.8rem; font-weight: 700; color: #2c3e50; font-variant-numeric: tabular-nums; }
        
        .progress-mini { height: 4px; background: rgba(0,0,0,0.05); margin-top: 15px; border-radius: 10px; overflow: hidden; }
        .progress-inner { height: 100%; width: 0%; background: #c084fc; /* soft violet */ transition: width 1s ease; }

        /* Services Grid */
        .services-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
        
        /* Service Link Card */
        .service-link { 
            display: flex; align-items: center; gap: 18px; text-decoration: none; color: inherit;
        }
        .service-link:hover { 
            background: rgba(255, 255, 255, 0.3); transform: translateY(-3px);
            border-color: #c084fc;
        }
        .service-icon { 
            width: 48px; height: 48px; border-radius: 12px; background: rgba(192, 132, 252, 0.15);
            display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0;
        }
        .service-info h3 { font-size: 0.95rem; font-weight: 600; color: #2c3e50; }
        .service-info p { font-size: 0.75rem; color: #7f8c8d; margin-top: 1px; }
        
        /* Badge - Capsule style */
        .status-badge { 
            display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; 
            padding: 3px 10px; border-radius: 99px; 
            margin-top: 10px; background: rgba(34, 197, 94, 0.1); color: #16a34a; /* success green */
            border: 1px solid rgba(34, 197, 94, 0.2);
        }
        .dot { width: 6px; height: 6px; background: #22c55e; border-radius: 50%; display: inline-block; }

        .demo-badge { font-size: 0.65rem; border: 1px solid rgba(255, 255, 255, 0.4); padding: 2px 8px; border-radius: 4px; color: #7f8c8d; }

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
                <div class="service-icon" style="background:rgba(255,255,255,0.05)">🏢</div>
                <div class="service-info">
                    <h3>Company Renewal v1</h3>
                    <p>Initial Concept Draft</p>
                </div>
                <span class="demo-badge">Draft</span>
            </a>
            <a href="/v2" target="_blank" class="glass-card service-link">
                <div class="service-icon" style="background:rgba(255,255,255,0.05)">🚀</div>
                <div class="service-info">
                    <h3>Company Renewal v2</h3>
                    <p>Final Production Prototype</p>
                </div>
                <span class="demo-badge">Draft</span>
            </a>
        </div>

        <footer>
            Managed by onmiso | onnamu.kr hub v3.5
        </footer>
    </div>

    <script>
        function update() {
            fetch('/stats')
                .then(r => r.json())
                .then(d => {
                    document.getElementById('cpu').innerText = d.cpu + '%';
                    document.getElementById('ram').innerText = d.ram + '%';
                    document.getElementById('disk').innerText = d.disk_percent + '%';
                    document.getElementById('disk-sub').innerText = d.disk_detail;
                    document.getElementById('cpu-bar').style.width = d.cpu + '%';
                    document.getElementById('ram-bar').style.width = d.ram + '%';
                    document.getElementById('disk-bar').style.width = d.disk_percent + '%';
                    document.getElementById('update-time').innerText = 'Last updated: ' + new Date().toLocaleTimeString();
                })
                .catch(() => { /* error handle */ });
        }
        setInterval(update, 10000);
        update();
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

# --- 습작 라우트 유지 (전체 붙여넣기 시 꼬일 수 있으니 이 부분도 원본과 동일하게 구성) ---
@app.route('/v1')
def renewal_v1():
    # templates 폴더 내의 renewal_v1.html 파일을 읽어서 보여줍니다.
    # (반드시templates/renewal_v1.html 파일이 있어야 합니다.)
    return render_template('renewal_v1.html')

@app.route('/v2')
def renewal_v2():
    # templates 폴더 내의 renewal_v2.html 파일을 읽어서 보여줍니다.
    return render_template('renewal_v2.html')

@app.route('/stats')
def stats():
    cpu = psutil.cpu_percent(interval=None)
    ram = psutil.virtual_memory().percent
    try:
        # Docker 환경에 맞게 경로 유지
        disk = psutil.disk_usage('/host_c')
        disk_percent = disk.percent
        disk_detail = f"{disk.used/(1024**3):.1f} GB / {disk.total/(1024**3):.1f} GB"
    except Exception:
        disk_percent = 0
        disk_detail = "Error"
    return jsonify(cpu=cpu, ram=ram, disk_percent=disk_percent, disk_detail=disk_detail)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)