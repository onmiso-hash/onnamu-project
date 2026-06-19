/**
 * Chronicle AI - App Engine
 * Dynamic Client-Side Storytelling Platform
 */

class ChronicleApp {
    constructor() {
        // App State
        this.isAdmin = false;
        this.apiKey = localStorage.getItem('gemini_api_key') || '';
        this.model = localStorage.getItem('gemini_api_model') || 'gemini-3.5-flash';
        this.genre = 'dark-fantasy';
        this.tone = 'cinematic';
        this.characterName = '';
        
        // Character Chat Simulation State
        this.modeType = 'story'; // 'story' or 'chat'
        this.chatCharName = '';
        this.chatRelation = '';
        this.chatCharDesc = '';
        this.chatLevel = 'normal';
        this.affinityValue = 50;
        this.memoryList = [];
        this.dialogueVectors = []; // Stores embedded text vectors for RAG (2단계)
        this.characterImages = {}; // Stores generated image bytes for each emotion

        this.storyHistory = []; // Tracks generated chapters / chat dialogues
        this.currentChapterIndex = 0;
        this.isGenerating = false;
        this.soundActive = true;

        // Visual Canvas Setup
        this.canvas = document.getElementById('ambient-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.bgParticles = [];

        // Procedural Audio Engine Components
        this.audioCtx = null;
        this.droneOsc1 = null;
        this.droneOsc2 = null;
        this.droneGain = null;
        this.masterVolume = null;

        // Offline Branching Story Tree (Fallback Simulation Mode)
        this.initOfflineStories();
        
        // Sync State variables
        this.pushDebounceTimer = null;
        this.isSyncing = false;
        
        // Bind DOM Elements
        this.initDOM();

        // Fetch User Info
        this.fetchUserInfo();
        
        // Ensure Marked library is loaded for Markdown rendering
        this.ensureMarkedLoaded();
    }

    initDOM() {
        // Overlay / Setup Forms
        this.overlay = document.getElementById('start-overlay');
        this.btnStart = document.getElementById('btn-studio-start');
        this.appContainer = document.getElementById('app-container');
        this.charProfileContainer = document.getElementById('char-profile-container');
        this.inputApiKey = document.getElementById('input-api-key');
        this.selectModel = document.getElementById('select-model');
        
        this.selectModeType = document.getElementById('select-mode-type');
        this.setupStoryFields = document.getElementById('setup-story-fields');
        this.setupChatFields = document.getElementById('setup-chat-fields');
        this.inputChatCharName = document.getElementById('input-chat-char-name');
        this.inputChatRelation = document.getElementById('input-chat-relation');
        this.inputChatCharDesc = document.getElementById('input-chat-char-desc');
        this.selectChatLevel = document.getElementById('select-chat-level');
        this.inputChatUserName = document.getElementById('input-chat-user-name');
        this.selectPersonaPreset = document.getElementById('select-persona-preset');
        this.btnSavePersona = document.getElementById('btn-save-persona');
        this.btnDeletePersona = document.getElementById('btn-delete-persona');

        this.selectGenre = document.getElementById('select-genre');
        this.selectTone = document.getElementById('select-tone');
        this.inputCharacter = document.getElementById('input-character');

        // HUD Elements
        this.hudGenre = document.getElementById('hud-genre');
        this.hudTone = document.getElementById('hud-tone');
        this.hudCharacter = document.getElementById('hud-character');
        this.hudModel = document.getElementById('hud-model');
        this.btnToggleSound = document.getElementById('btn-toggle-sound');
        this.btnHomeSettings = document.getElementById('btn-home-settings');
        this.btnSaveSession = document.getElementById('btn-save-session');
        this.btnUndoStory = document.getElementById('btn-undo-story');
        this.btnResetStory = document.getElementById('btn-reset-story');
        this.btnExportText = document.getElementById('btn-export-text');
        this.bookTitle = document.getElementById('book-title');

        // Scroll & Canvas Area
        this.storyScrollArea = document.getElementById('story-scroll-area');
        this.chatLogArea = this.storyScrollArea; // 단일 피드로 통합
        this.choicesContainer = document.getElementById('choices-container');
        this.chatTextarea = document.getElementById('chat-input-textarea');
        this.btnSubmitAction = document.getElementById('btn-submit-action');

        // New Unified Header & Sidebar Elements
        this.btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
        this.btnCloseSidebar = document.getElementById('btn-close-sidebar');
        this.studioSidebar = document.getElementById('studio-sidebar');
        this.sidebarOverlay = document.getElementById('sidebar-overlay');

        this.charProfileLayer = document.getElementById('studio-char-profile-layer');
        this.charProfileLayerBar = document.getElementById('char-profile-layer-bar');
        this.charPillName = document.getElementById('char-pill-name');
        this.charPillAffinity = document.getElementById('char-pill-affinity');
        this.charAvatarSummaryWrapper = document.getElementById('char-avatar-summary-wrapper');

        this.memoryAccordionLayer = document.getElementById('studio-memory-accordion-layer');
        this.btnToggleMemoryAccordion = document.getElementById('btn-toggle-memory-accordion');
        this.memoryAccordionContent = document.getElementById('memory-accordion-content');
        this.hudMemoryList = document.getElementById('hud-memory-list');

        // Toggle Setup Fields
        this.selectModeType.addEventListener('change', () => {
            if (this.selectModeType.value === 'chat') {
                this.setupStoryFields.style.display = 'none';
                this.setupChatFields.style.display = 'block';
            } else {
                this.setupStoryFields.style.display = 'block';
                this.setupChatFields.style.display = 'none';
            }
        });

        // Autofill saved API key
        if (this.apiKey) {
            this.inputApiKey.value = this.apiKey;
        }

        // Select saved model
        if (this.model) {
            this.selectModel.value = this.model;
        }

        // Setup Event Listeners
        this.btnStart.addEventListener('click', () => this.startStudio());
        this.btnToggleSound.addEventListener('click', () => this.toggleSound());
        this.btnHomeSettings.addEventListener('click', () => this.goHomeSettings());
        this.btnSaveSession.addEventListener('click', () => this.saveActiveSession());
        this.btnUndoStory.addEventListener('click', () => this.undoLastAction());
        this.btnResetStory.addEventListener('click', () => this.resetStory());
        this.btnExportText.addEventListener('click', () => this.exportStory());
        this.btnSubmitAction.addEventListener('click', () => this.submitCustomAction());

        // Setup Password Visibility Toggle
        document.querySelectorAll('.toggle-password-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const container = btn.closest('.password-input-container');
                if (!container) return;
                const input = container.querySelector('input');
                if (!input) return;
                
                if (input.type === 'password') {
                    input.type = 'text';
                    container.classList.add('show-password');
                } else {
                    input.type = 'password';
                    container.classList.remove('show-password');
                }
            });
        });

        // Logout Event Listener
        this.btnLogout = document.getElementById('btn-logout');
        if (this.btnLogout) {
            this.btnLogout.addEventListener('click', () => {
                if (confirm('로그아웃 하시겠습니까?')) {
                    localStorage.removeItem('studio_active_state');
                    window.location.href = '/logout';
                }
            });
        }

        // Persona Preset Event Listeners
        this.btnSavePersona.addEventListener('click', () => this.saveCurrentPersona());
        this.btnDeletePersona.addEventListener('click', () => this.deleteSelectedPersona());
        this.selectPersonaPreset.addEventListener('change', () => this.loadSelectedPersona());

        // Character Image Generation DOM Elements & Events
        this.inputCharImagePrompt = document.getElementById('input-char-image-prompt');
        this.btnGenerateCharImages = document.getElementById('btn-generate-char-images');
        this.charImagesPreview = document.getElementById('char-images-preview');
        this.charImageStatus = document.getElementById('char-image-status');
        this.charImageStatusText = document.getElementById('char-image-status-text');

        if (this.btnGenerateCharImages) {
            this.btnGenerateCharImages.addEventListener('click', () => this.generateCharacterImages());
        }

        // Keyboard press for submission
        this.chatTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.submitCustomAction();
            }
        });

        // Sidebar opening/closing listeners
        if (this.btnToggleSidebar) {
            this.btnToggleSidebar.addEventListener('click', () => {
                if (this.studioSidebar) this.studioSidebar.classList.remove('closed');
                if (this.sidebarOverlay) this.sidebarOverlay.classList.remove('hidden');
            });
        }
        if (this.btnCloseSidebar) {
            this.btnCloseSidebar.addEventListener('click', () => {
                if (this.studioSidebar) this.studioSidebar.classList.add('closed');
                if (this.sidebarOverlay) this.sidebarOverlay.classList.add('hidden');
            });
        }
        if (this.sidebarOverlay) {
            this.sidebarOverlay.addEventListener('click', () => {
                if (this.studioSidebar) this.studioSidebar.classList.add('closed');
                if (this.sidebarOverlay) this.sidebarOverlay.classList.add('hidden');
            });
        }

        // 캐릭터 프로필 내 메모리 vault 토글 (이벤트 위임)
        if (this.charProfileContainer) {
            this.charProfileContainer.addEventListener('click', (e) => {
                const toggleBtn = e.target.closest('.memory-vault-toggle');
                if (toggleBtn) {
                    const parentVault = toggleBtn.closest('.memory-vault');
                    if (parentVault) {
                        const content = parentVault.querySelector('.memory-vault-content');
                        if (content) {
                            const isCollapsed = content.classList.toggle('collapsed');
                            toggleBtn.classList.toggle('active', !isCollapsed);
                        }
                    }
                }
            });
        }

        // AI 말풍선 클릭 시 상단 프로필 감정 이미지 동기화
        if (this.storyScrollArea) {
            this.storyScrollArea.addEventListener('click', (e) => {
                const aiMsg = e.target.closest('.ai-message');
                if (aiMsg) {
                    const emotion = aiMsg.getAttribute('data-emotion') || 'normal';
                    this.renderChatProfile(emotion);
                }
            });
        }

        // Auto-close sidebar on menu item click (specifically for mobile responsiveness)
        setTimeout(() => {
            const sidebarMenuItems = document.querySelectorAll('.sidebar-menu-item');
            sidebarMenuItems.forEach(item => {
                item.addEventListener('click', () => {
                    if (this.studioSidebar) this.studioSidebar.classList.add('closed');
                    if (this.sidebarOverlay) this.sidebarOverlay.classList.add('hidden');
                });
            });
        }, 500);

        // Textarea height auto-adjust
        if (this.chatTextarea) {
            this.chatTextarea.addEventListener('input', () => {
                this.chatTextarea.style.height = '32px';
                this.chatTextarea.style.height = this.chatTextarea.scrollHeight + 'px';
            });
        }

        // Set up particle background (Canvas rendering disabled for performance optimization)
        window.addEventListener('resize', () => this.resizeCanvas());
        this.resizeCanvas();

        // Load saved persona presets
        this.loadPersonaPresets();

        // 탭 포커스 및 Visibilitychange 기반 동기화 이벤트 바인딩
        window.addEventListener('focus', () => this.handleVisibilitySync());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.handleVisibilitySync();
            }
        });
        if (this.chatTextarea) {
            this.chatTextarea.addEventListener('focus', () => this.handleVisibilitySync());
        }
    }

    async ensureMarkedLoaded() {
        if (typeof marked !== 'undefined') return true;
        
        return new Promise((resolve) => {
            console.warn("marked.js가 감지되지 않아 동적 로딩을 시도합니다.");
            const script = document.createElement('script');
            script.src = "https://cdn.jsdelivr.net/npm/marked/marked.min.js";
            script.onload = () => {
                console.log("marked.js 동적 로드 완료");
                resolve(true);
            };
            script.onerror = () => {
                console.error("marked.js 동적 로드 실패");
                resolve(false);
            };
            document.head.appendChild(script);
        });
    }

    parseMarkdown(text) {
        if (!text) return '';
        const markedParser = typeof marked !== 'undefined' ? marked : (window.marked || null);
        if (markedParser && typeof markedParser.parse === 'function') {
            let targetText = this.healMarkdownTable(text);
            let processed = markedParser.parse(targetText, { breaks: true });
            processed = processed.replace(/<table/g, '<div class="chat-bubble-table-wrapper"><table').replace(/<\/table>/g, '</table></div>');
            return processed;
        }
        return text.replace(/\n/g, '<br>');
    }

    async fetchUserInfo() {
        try {
            const res = await fetch('/api/user-info');
            if (res.ok) {
                const data = await res.json();
                this.isAdmin = data.isAdmin || false;
                
                const displayNameEl = document.getElementById('user-display-name');
                if (displayNameEl && data.username) {
                    displayNameEl.textContent = data.username;
                }
                
                const profileBarEl = document.querySelector('.user-profile-bar');
                if (profileBarEl) {
                    profileBarEl.style.display = 'flex';
                }

                // 계정 전환(로그인 유저가 바뀜) 감지 시 로컬 스토리지 초기화
                const prevUser = localStorage.getItem('logged_in_username');
                const currentUser = data.username;
                if (prevUser && prevUser !== currentUser) {
                    console.log(`[Session] User changed (${prevUser} -> ${currentUser}). Clearing local storage...`);
                    const keysToRemove = [
                        'studio_active_state',
                        'recent_mode_type',
                        'recent_chat_char_name',
                        'recent_chat_relation',
                        'recent_chat_char_desc',
                        'recent_chat_level',
                        'recent_chat_user_name',
                        'recent_story_genre',
                        'recent_story_tone',
                        'recent_story_character',
                        'recent_persona_preset',
                        'persona_presets',
                        'saved_story_session'
                    ];
                    keysToRemove.forEach(k => localStorage.removeItem(k));
                }
                localStorage.setItem('logged_in_username', currentUser);

                // 유저 정보 수신 완료 후 페르소나 프리셋 로드
                this.loadPersonaPresets();

                let activeState = localStorage.getItem('studio_active_state');
                const recentMode = localStorage.getItem('recent_mode_type');
                
                // 일반 사용자 로그인 시 19금 세션 복구 차단 보안 필터
                if (!this.isAdmin && activeState === 'active') {
                    const recLevel = localStorage.getItem('recent_chat_level') || '';
                    const recGenre = localStorage.getItem('recent_story_genre') || '';
                    const recTone = localStorage.getItem('recent_story_tone') || '';
                    const recPreset = localStorage.getItem('recent_persona_preset') || '';
                    
                    let isAdultSession = (recLevel === 'adult-19' || recGenre === 'adult-19' || recTone === 'sensual' || recPreset.includes('19금'));
                    
                    if (!isAdultSession && recPreset) {
                        try {
                            const presets = JSON.parse(localStorage.getItem('persona_presets')) || {};
                            if (presets[recPreset] && presets[recPreset].level === 'adult-19') {
                                isAdultSession = true;
                            }
                        } catch (e) {}
                    }
                    
                    if (isAdultSession) {
                        alert('⚠️ 일반 계정은 19금 세션으로 진입할 수 없습니다. 전체이용가 설정창으로 이동합니다.');
                        localStorage.removeItem('studio_active_state');
                        localStorage.removeItem('recent_chat_level');
                        localStorage.removeItem('recent_story_genre');
                        localStorage.removeItem('recent_story_tone');
                        localStorage.removeItem('recent_persona_preset');
                        activeState = 'inactive';
                    }
                }
                
                if (activeState === 'active') {
                    // 1. 대화 진행 중 새로고침 등 활성화 상태인 경우 자동 복원 기동
                    if (recentMode) {
                        this.selectModeType.value = recentMode;
                        if (recentMode === 'chat') {
                            this.setupStoryFields.style.display = 'none';
                            this.setupChatFields.style.display = 'block';

                            this.inputChatCharName.value = localStorage.getItem('recent_chat_char_name') || '';
                            this.inputChatRelation.value = localStorage.getItem('recent_chat_relation') || '';
                            this.inputChatCharDesc.value = localStorage.getItem('recent_chat_char_desc') || '';
                            this.selectChatLevel.value = localStorage.getItem('recent_chat_level') || 'normal';
                            this.inputChatUserName.value = localStorage.getItem('recent_chat_user_name') || '';
                        } else {
                            this.setupStoryFields.style.display = 'block';
                            this.setupChatFields.style.display = 'none';

                            this.selectGenre.value = localStorage.getItem('recent_story_genre') || 'dark-fantasy';
                            this.selectTone.value = localStorage.getItem('recent_story_tone') || 'cinematic';
                            this.inputCharacter.value = localStorage.getItem('recent_story_character') || '';
                        }
                    }

                    const recentPreset = localStorage.getItem('recent_persona_preset') || '';
                    if (recentPreset && this.selectPersonaPreset) {
                        this.selectPersonaPreset.value = recentPreset;
                    }

                    // 오버레이 및 셋업 건너뛰고 스튜디오 화면 바로 띄우기
                    this.startStudio();

                } else {
                    // 2. 최초 로그인 진입 또는 설정창 오버레이 상태인 경우 강제 클리어 로직 기동
                    if (recentMode) {
                        this.selectModeType.value = recentMode;
                        if (recentMode === 'chat') {
                            this.setupStoryFields.style.display = 'none';
                            this.setupChatFields.style.display = 'block';
                        } else {
                            this.setupStoryFields.style.display = 'block';
                            this.setupChatFields.style.display = 'none';
                        }
                    }

                    const recentStoryGenre = localStorage.getItem('recent_story_genre') || 'fantasy';
                    const recentStoryTone = localStorage.getItem('recent_story_tone') || 'normal';

                    if (this.inputChatUserName) this.inputChatUserName.value = '';
                    this.characterName = '';

                    if (this.selectGenre) this.selectGenre.value = recentStoryGenre;
                    if (this.selectTone) this.selectTone.value = recentStoryTone;

                    if (!this.isAdmin) {
                        const adultGenre = document.querySelector('#select-genre option[value="adult-19"]');
                        if (adultGenre) adultGenre.remove();
                        const adultTone = document.querySelector('#select-tone option[value="sensual"]');
                        if (adultTone) adultTone.remove();
                        const adultLevel = document.querySelector('#select-chat-level option[value="adult-19"]');
                        if (adultLevel) adultLevel.remove();

                        if (this.selectGenre) this.selectGenre.value = 'fantasy';
                        if (this.selectTone) this.selectTone.value = 'normal';
                    }

                    if (this.inputChatCharName) this.inputChatCharName.value = '';
                    if (this.inputChatRelation) this.inputChatRelation.value = '';
                    if (this.inputChatCharDesc) this.inputChatCharDesc.value = '';
                    if (this.selectChatLevel) this.selectChatLevel.value = 'normal';
                    if (this.inputCharacter) this.inputCharacter.value = '';
                    if (this.inputCharImagePrompt) this.inputCharImagePrompt.value = '';
                    this.characterImages = {};

                    const emotions = ['normal', 'happy', 'sad', 'angry', 'blush'];
                    emotions.forEach(emotion => {
                        const imgEl = document.getElementById(`img-preview-${emotion}`);
                        const placeholderEl = document.getElementById(`placeholder-${emotion}`);
                        if (imgEl) {
                            imgEl.src = '';
                            imgEl.style.display = 'none';
                        }
                        if (placeholderEl) {
                            placeholderEl.style.display = 'flex';
                        }
                    });
                    if (this.charImagesPreview) {
                        this.charImagesPreview.style.display = 'grid';
                    }

                    if (this.hudCharacter) {
                        this.hudCharacter.textContent = '';
                    }

                    // 브라우저의 강제 자동완성 우회 방어 2차 강제 클리어
                    setTimeout(() => {
                        if (localStorage.getItem('studio_active_state') === 'active') return;

                        if (this.inputChatCharName) this.inputChatCharName.value = '';
                        if (this.inputChatRelation) this.inputChatRelation.value = '';
                        if (this.inputChatCharDesc) this.inputChatCharDesc.value = '';
                        if (this.selectChatLevel) this.selectChatLevel.value = 'normal';
                        if (this.inputCharacter) this.inputCharacter.value = '';
                        if (this.inputCharImagePrompt) this.inputCharImagePrompt.value = '';
                    }, 200);
                }
                
                // 서버와 페르소나 데이터 동기화
                await this.syncPersonaPresetsWithServer();
            } else if (res.status === 401) {
                // API 인증 실패 (로그인 안 됨) -> 로그인 페이지로 강제 연동 리다이렉트
                this.redirectToLogin();
            }
        } catch (e) {
            console.error("Failed to fetch user info:", e);
            this.isAdmin = false;
            this.loadPersonaPresets();
        }
    }

    redirectToLogin() {
        const reqHost = window.location.host;
        let redirectBase = '';
        
        if (reqHost.includes('localhost') || reqHost.includes('127.0.0.1')) {
            const hostIp = reqHost.split(':')[0];
            redirectBase = `http://${hostIp}:5002`;
        } else {
            redirectBase = 'https://gallery.onnamu.kr';
        }
        
        const nextUrl = window.location.href;
        window.location.href = `${redirectBase}/login?next=${encodeURIComponent(nextUrl)}`;
    }

    initResizer() {
        const resizer = document.getElementById('oracle-resizer');
        const bottomControls = document.getElementById('oracle-bottom-controls');
        if (!resizer || !bottomControls) return;

        let isDragging = false;
        let startY = 0;
        let startHeight = 0;

        // Restore saved height if exists
        const savedHeight = localStorage.getItem('oracle_bottom_height');
        if (savedHeight) {
            bottomControls.style.height = `${savedHeight}px`;
            bottomControls.style.flex = `0 0 ${savedHeight}px`;
        }

        const onStart = (clientY) => {
            isDragging = true;
            startY = clientY;
            startHeight = bottomControls.offsetHeight;
            resizer.classList.add('dragging');
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        };

        const onMove = (clientY) => {
            if (!isDragging) return;
            const dy = clientY - startY;
            let newHeight = startHeight - dy;

            // Enforce constraints
            if (newHeight < 120) newHeight = 120;
            const consoleEl = document.querySelector('.oracle-console-container');
            if (consoleEl) {
                const maxH = consoleEl.offsetHeight - 120;
                if (newHeight > maxH) newHeight = maxH;
            } else {
                if (newHeight > 500) newHeight = 500;
            }

            bottomControls.style.height = `${newHeight}px`;
            bottomControls.style.flex = `0 0 ${newHeight}px`;
        };

        const onEnd = () => {
            if (isDragging) {
                isDragging = false;
                resizer.classList.remove('dragging');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                localStorage.setItem('oracle_bottom_height', bottomControls.offsetHeight);
                document.removeEventListener('mousemove', onMoveHandler);
                document.removeEventListener('mouseup', onEnd);
                document.removeEventListener('touchmove', onTouchMoveHandler);
                document.removeEventListener('touchend', onEnd);
            }
        };

        const onMoveHandler = (e) => onMove(e.clientY);
        const onTouchMoveHandler = (e) => {
            if (e.touches.length > 0) onMove(e.touches[0].clientY);
        };

        const onStartHandler = (clientY) => {
            onStart(clientY);
            document.addEventListener('mousemove', onMoveHandler, { passive: true });
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onTouchMoveHandler, { passive: true });
            document.addEventListener('touchend', onEnd);
        };

        // Mouse Events
        resizer.addEventListener('mousedown', (e) => onStartHandler(e.clientY));

        // Touch Events
        resizer.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) onStartHandler(e.touches[0].clientY);
        }, { passive: true });
    }

    // Initialize Procedural Audio Engine
    initAudioEngine() {
        if (this.audioCtx) return;

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();

            // Master Volume
            this.masterVolume = this.audioCtx.createGain();
            this.masterVolume.gain.setValueAtTime(this.soundActive ? 0.35 : 0, this.audioCtx.currentTime);

            // Reverb Effect Node (Procedural Space Verb)
            this.reverbNode = this.audioCtx.createConvolver();
            this.reverbNode.buffer = this.createReverbImpulse(3.0, 2.0);

            this.reverbDry = this.audioCtx.createGain();
            this.reverbWet = this.audioCtx.createGain();
            this.reverbDry.gain.setValueAtTime(0.7, this.audioCtx.currentTime);
            this.reverbWet.gain.setValueAtTime(0.4, this.audioCtx.currentTime);

            this.reverbNode.connect(this.reverbWet);
            this.reverbWet.connect(this.masterVolume);
            this.reverbDry.connect(this.masterVolume);
            this.masterVolume.connect(this.audioCtx.destination);

            // Start ambient drone pad
            this.startAmbientDrone();
        } catch (e) {
            console.error("Audio Context could not start", e);
        }
    }

    createReverbImpulse(duration, decay) {
        const rate = this.audioCtx.sampleRate;
        const len = rate * duration;
        const impulse = this.audioCtx.createBuffer(2, len, rate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);
        for (let i = 0; i < len; i++) {
            const envelope = Math.pow(1 - (i / len), decay);
            left[i] = (Math.random() * 2 - 1) * envelope;
            right[i] = (Math.random() * 2 - 1) * envelope;
        }
        return impulse;
    }

    startAmbientDrone() {
        if (!this.audioCtx) return;
        const ctx = this.audioCtx;

        // Twin detuned oscillators for lush space drone
        this.droneOsc1 = ctx.createOscillator();
        this.droneOsc2 = ctx.createOscillator();
        this.droneGain = ctx.createGain();

        // Adjust frequency based on genre
        let freq = 65.41; // C2 (Fantasy)
        if (this.genre === 'sci-fi' || this.genre === 'cyberpunk') freq = 55.0; // A1
        if (this.genre === 'mystery' || this.genre === 'apocalypse') freq = 73.42; // D2
        if (this.genre === 'romance') freq = 69.30; // F2 (Soft and warm)
        if (this.genre === 'celebrity') freq = 78.39; // G2 (Trendy / Uplifting)
        if (this.genre === 'adult-19') freq = 58.27; // A#1 (Sensual, low and deep tension)

        this.droneOsc1.type = 'sine';
        this.droneOsc1.frequency.setValueAtTime(freq, ctx.currentTime);
        
        this.droneOsc2.type = 'triangle';
        this.droneOsc2.frequency.setValueAtTime(freq + 0.5, ctx.currentTime); // detuned

        this.droneGain.gain.setValueAtTime(0.08, ctx.currentTime);

        this.droneOsc1.connect(this.droneGain);
        this.droneOsc2.connect(this.droneGain);
        this.droneGain.connect(this.reverbDry);
        this.droneGain.connect(this.reverbNode);

        this.droneOsc1.start();
        this.droneOsc2.start();
    }

    // Play visual loading click sounds (Typewriter effect)
    playTypewriterSound() {
        if (!this.soundActive || !this.audioCtx) return;
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        // Random clicks frequencies
        osc.frequency.setValueAtTime(Math.random() * 800 + 400, now);
        
        gain.gain.setValueAtTime(0.015, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.04);
    }

    // Play magic chime when new chapter unlocks
    playMagicChime() {
        if (!this.soundActive || !this.audioCtx) return;
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        const scale = [440, 554.37, 659.25, 880]; // Major chords arpeggio
        scale.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);

            gain.gain.setValueAtTime(0, now + idx * 0.08);
            gain.gain.linearRampToValueAtTime(0.06, now + idx * 0.08 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.4);

            osc.connect(gain);
            gain.connect(this.reverbDry);
            gain.connect(this.reverbNode);
            
            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.45);
        });
    }

    // Sound effect on choice select
    playSelectionSwell() {
        if (!this.soundActive || !this.audioCtx) return;
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(280, now + 0.5);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

        osc.connect(gain);
        gain.connect(this.reverbDry);
        
        osc.start(now);
        osc.stop(now + 0.6);
    }

    // Main Studio Startup
    async startStudio() {
        // Read Settings
        this.apiKey = this.inputApiKey.value.trim();
        this.model = this.selectModel.value;
        this.modeType = this.selectModeType.value;

        // API Key 누락 시 경고 메시지 띄우기 (오프라인 모드 안내)
        if (!this.apiKey) {
            alert('⚠️ Gemini API Key가 입력되지 않았습니다.\n현재 오프라인 시뮬레이션(체험) 모드로 시작합니다.\n가상 캐릭터와 자유롭고 실감 나는 AI 대화를 나누시려면 설정창에 API Key를 꼭 등록해 주세요.');
        }

        if (this.modeType === 'chat') {
            const inputName = this.inputChatCharName.value.trim();
            const inputRelation = this.inputChatRelation.value.trim();
            const inputDesc = this.inputChatCharDesc.value.trim();
            const inputLevel = this.selectChatLevel.value;
            const inputUserName = this.inputChatUserName.value.trim();

            if (!inputName) {
                alert('가상 인물의 이름을 입력해 주세요.');
                this.inputChatCharName.focus();
                return;
            }
            if (!inputRelation) {
                alert('주인공과의 관계를 입력해 주세요.');
                this.inputChatRelation.focus();
                return;
            }
            if (!inputDesc) {
                alert('가상 인물의 특징을 입력해 주세요.');
                this.inputChatCharDesc.focus();
                return;
            }
            if (!inputUserName) {
                alert('주인공(본인) 이름을 입력해 주세요.');
                this.inputChatUserName.focus();
                return;
            }

            // 일반 사용자 19금 우회 차단 이중 안전장치
            let finalLevel = inputLevel;
            let finalName = inputName;
            let finalRelation = inputRelation;
            let finalDesc = inputDesc;
            let finalUserName = inputUserName;

            if (!this.isAdmin) {
                if (finalLevel === 'adult-19') {
                    alert('⚠️ 일반 계정은 19금 설정을 사용할 수 없습니다. 일반 등급으로 강제 전환합니다.');
                    finalLevel = 'normal';
                    this.selectChatLevel.value = 'normal';
                }
                if (finalName.includes('19금') || finalName === '릴리스') {
                    alert('⚠️ 일반 계정은 해당 캐릭터를 생성하거나 로드할 수 없습니다. 기본 캐릭터로 전환합니다.');
                    finalName = '서아';
                    finalRelation = '애교 많고 활기찬 대학교 후배';
                    finalDesc = '귀엽고 사교적인 성격. 늘 주인공 옆에 꼭 붙어다님.';
                    finalLevel = 'normal';
                    this.inputChatCharName.value = '서아';
                    this.inputChatRelation.value = '애교 많고 활기찬 대학교 후배';
                    this.inputChatCharDesc.value = '귀엽고 사교적인 성격. 늘 주인공 옆에 꼭 붙어다님.';
                    this.selectChatLevel.value = 'normal';
                    if (this.selectPersonaPreset) {
                        this.selectPersonaPreset.value = '';
                    }
                    localStorage.removeItem('recent_persona_preset');
                }
            }

            // Silently apply all new configuration inputs while fully preserving existing dialogue history and affinity
            this.chatCharName = finalName;
            this.chatRelation = finalRelation;
            this.chatCharDesc = finalDesc;
            this.chatLevel = finalLevel;
            this.characterName = finalUserName;

            // Detect and resume saved chat session
            if (this.storyHistory.length === 0) {
                const presets = JSON.parse(localStorage.getItem('persona_presets')) || {};
                const targetPreset = this.selectPersonaPreset.value || localStorage.getItem('recent_persona_preset') || this.chatCharName;
                const presetData = presets[targetPreset];
                if (presetData) {
                    // 19금 프리셋 복원 원천 차단
                    if (!this.isAdmin && (presetData.level === 'adult-19' || targetPreset.includes('19금'))) {
                        console.warn("[Security] Prevented loading adult-19 preset for family user");
                    } else {
                        // Restore character images for active session (Only if not already populated)
                        if (!this.characterImages || Object.keys(this.characterImages).length === 0) {
                            this.characterImages = presetData.characterImages || {};
                        }
                        
                        if (presetData.savedSession) {
                            // Auto-load previous session without annoying popup
                            const session = presetData.savedSession;
                            
                            // Restore chat level from session if available
                            if (session.chatLevel) {
                                let restoredLevel = session.chatLevel;
                                if (!this.isAdmin && restoredLevel === 'adult-19') {
                                    restoredLevel = 'normal';
                                }
                                this.chatLevel = restoredLevel;
                                this.selectChatLevel.value = restoredLevel;
                            }
                            
                            // Restore user name from session if available
                            if (session.userName) {
                                this.characterName = session.userName;
                                this.inputChatUserName.value = session.userName;
                            }
                            
                            this.affinityValue = session.affinityValue || 50;
                            this.memoryList = [...(session.memoryList || ["첫 대화가 시작되었습니다."])];
                            this.storyHistory = [...(session.storyHistory || [])];
                            this.dialogueVectors = [...(session.dialogueVectors || [])]; // RAG 벡터 복원 (2단계)
                            this.currentChapterIndex = this.storyHistory.length;
                            this.renderChatLeftPanel(this.storyHistory[this.storyHistory.length - 1]);
                            if (this.storyHistory.length > 0) {
                                this.renderChoiceCards(this.storyHistory[this.storyHistory.length - 1].choices);
                            }
                        }
                    }
                }
            }

            this.renderChatProfile('normal');

            // Set HUD
            this.hudGenre.textContent = "가상 인물 Sim";
            this.hudTone.textContent = this.chatLevel === 'adult-19' ? "치명적 19금" : "일반 롤플레이";
            this.hudCharacter.textContent = `${this.chatCharName} & 주인공`;
            this.hudModel.textContent = this.selectModel.options[this.selectModel.selectedIndex].text;

            // Update left panel title
            const leftTitle = this.appContainer.querySelector('.story-ledger-container .section-title h2');
            const leftIcon = this.appContainer.querySelector('.story-ledger-container .section-title span');
            if (leftTitle) leftTitle.textContent = "Character Codex (인물 정보 및 교감)";
            if (leftIcon) leftIcon.textContent = "🔮";
        } else {
            const inputChar = this.inputCharacter.value.trim();
            if (!inputChar) {
                alert('주인공 이름 및 특징을 입력해 주세요.');
                this.inputCharacter.focus();
                return;
            }
            let finalGenre = this.selectGenre.value;
            let finalTone = this.selectTone.value;
            
            // 일반 사용자 소설 모드 19금 우회 차단
            if (!this.isAdmin) {
                if (finalGenre === 'adult-19') {
                    alert('⚠️ 일반 계정은 19금 소설 장르를 사용할 수 없습니다. 판타지 장르로 강제 전환합니다.');
                    finalGenre = 'fantasy';
                    this.selectGenre.value = 'fantasy';
                }
                if (finalTone === 'sensual') {
                    alert('⚠️ 일반 계정은 19금 소설 분위기를 사용할 수 없습니다. 보통 분위기로 강제 전환합니다.');
                    finalTone = 'normal';
                    this.selectTone.value = 'normal';
                }
            }
            
            this.genre = finalGenre;
            this.tone = finalTone;
            this.characterName = inputChar;

            // Detect and resume saved story session
            if (this.storyHistory.length === 0) {
                const savedStory = localStorage.getItem('saved_story_session');
                if (savedStory) {
                    // Auto-load previous session without annoying popup
                    try {
                        const session = JSON.parse(savedStory);
                        
                        // 복원 데이터 19금 검증
                        if (!this.isAdmin && (session.genre === 'adult-19' || session.tone === 'sensual')) {
                            console.warn("[Security] Prevented loading adult-19 story session for family user");
                        } else {
                            this.storyHistory = [...(session.storyHistory || [])];
                            this.currentChapterIndex = this.storyHistory.length;
                            this.genre = session.genre || this.genre;
                            this.tone = session.tone || this.tone;
                            this.characterName = session.characterName || this.characterName;

                            // Sync HUD select options
                            this.selectGenre.value = this.genre;
                            this.selectTone.value = this.tone;
                            this.inputCharacter.value = this.characterName;
                        }

                        setTimeout(() => {
                            // Re-render story pages
                            this.storyScrollArea.innerHTML = '';
                            this.storyHistory.forEach((chapter, index) => {
                                const chapterNum = index + 1;
                                const chapterEl = document.createElement('article');
                                chapterEl.className = 'chapter-block';
                                chapterEl.style.opacity = 1;

                                const headerEl = document.createElement('div');
                                headerEl.className = 'chapter-header';
                                headerEl.innerHTML = `<span>Chapter ${chapterNum}</span> <span>${chapter.chapterTitle}</span>`;
                                chapterEl.appendChild(headerEl);

                                if (chapterNum > 1) {
                                    const decisionEl = document.createElement('div');
                                    decisionEl.className = 'user-decision-marker';
                                    decisionEl.textContent = `"${chapter.actionText || '이전 선택'}"`;
                                    chapterEl.appendChild(decisionEl);
                                }

                                const contentEl = document.createElement('div');
                                contentEl.className = 'chapter-content';
                                contentEl.innerHTML = this.parseMarkdown(chapter.story);
                                chapterEl.appendChild(contentEl);
                                this.storyScrollArea.appendChild(chapterEl);
                            });
                            this.storyScrollArea.scrollTop = this.storyScrollArea.scrollHeight;

                            this.chatLogArea.innerHTML = `
                                <div class="system-message">
                                    <p><strong>오라클 예언자:</strong> 소설 집필 세션이 정상적으로 복구되었습니다. 이어서 집필 지시를 들려주세요.</p>
                                </div>
                            `;
                            if (this.storyHistory.length > 0) {
                                this.renderChoiceCards(this.storyHistory[this.storyHistory.length - 1].choices);
                            }
                        }, 900);
                    } catch (e) {
                        console.error("Error parsing saved story session", e);
                    }
                }
            }

            if (this.charProfileContainer) {
                this.charProfileContainer.style.display = 'none';
                this.charProfileContainer.innerHTML = '';
            }
            this.renderChatProfile();

            // Set HUD
            this.hudGenre.textContent = this.selectGenre.options[this.selectGenre.selectedIndex].text;
            this.hudTone.textContent = this.selectTone.options[this.selectTone.selectedIndex].text;
            this.hudCharacter.textContent = this.characterName;
            this.hudModel.textContent = this.selectModel.options[this.selectModel.selectedIndex].text;

            // Update left panel title
            const leftTitle = this.appContainer.querySelector('.story-ledger-container .section-title h2');
            const leftIcon = this.appContainer.querySelector('.story-ledger-container .section-title span');
            if (leftTitle) leftTitle.textContent = "Story Codex (성장 기록 일지)";
            if (leftIcon) leftIcon.textContent = "📖";
        }

        // Save recent inputs locally to persist user choices
        if (this.modeType === 'chat') {
            localStorage.setItem('recent_chat_char_name', this.chatCharName);
            localStorage.setItem('recent_chat_relation', this.chatRelation);
            localStorage.setItem('recent_chat_char_desc', this.chatCharDesc);
            localStorage.setItem('recent_chat_level', this.chatLevel);
            localStorage.setItem('recent_chat_user_name', this.characterName);
        } else {
            localStorage.setItem('recent_story_genre', this.genre);
            localStorage.setItem('recent_story_tone', this.tone);
            localStorage.setItem('recent_story_character', this.characterName);
        }
        localStorage.setItem('recent_mode_type', this.modeType);
        localStorage.setItem('studio_active_state', 'active');
        if (this.selectPersonaPreset) {
            localStorage.setItem('recent_persona_preset', this.selectPersonaPreset.value);
        }

        // Save key locally
        if (this.apiKey) {
            localStorage.setItem('gemini_api_key', this.apiKey);
        } else {
            localStorage.removeItem('gemini_api_key');
        }
        localStorage.setItem('gemini_api_model', this.model);

        // Init Audio
        this.initAudioEngine();

        // Switch Screens
        this.overlay.classList.add('fade-out');
        setTimeout(() => {
            this.overlay.style.display = 'none';
            this.appContainer.classList.remove('hidden');
            this.appContainer.classList.add('visible');
            
            // Re-render chat profile to reflect any configuration changes instantly
            if (this.modeType === 'chat') {
                this.renderChatProfile('normal');
            }
            
            // 대화방에 진입 시 기존 대화가 있다면 스크롤을 맨 아래로 이동시킵니다.
            if (this.storyHistory.length > 0) {
                setTimeout(() => {
                    this.storyScrollArea.scrollTop = this.storyScrollArea.scrollHeight;
                }, 100);
            }
            
            // Start writing or chatting ONLY if history is empty
            if (this.storyHistory.length === 0) {
                if (this.modeType === 'chat') {
                    this.generateNextChatNode("대화를 시작하자.");
                } else {
                    this.generateNextStoryNode("이야기를 시작해줘.");
                }
            }
        }, 800);
    }

    // Re-open settings/setup overlay
    goHomeSettings() {
        if (this.isGenerating) return;

        // Sound feedback
        this.playSelectionSwell();

        // Switch screens (Show overlay and hide workspace)
        this.overlay.style.display = 'flex';
        this.overlay.classList.remove('fade-out');
        
        this.appContainer.classList.add('hidden');
        this.appContainer.classList.remove('visible');

        localStorage.setItem('studio_active_state', 'setup');
    }

    // Generate story next segment
    async generateNextStoryNode(actionText) {
        if (this.modeType === 'chat') {
            return this.generateNextChatNode(actionText);
        }

        if (this.isGenerating) return;
        this.isGenerating = true;

        // Clear choices grid & show loading
        this.choicesContainer.innerHTML = '';
        this.appendLoadingIndicator();
        this.playSelectionSwell();

        // Append User Action bubble inside chat log
        if (actionText !== "이야기를 시작해줘.") {
            this.appendChatMessage("user", actionText);
        }

        try {
            let result = null;
            if (this.apiKey) {
                // Fetch dynamic story from Gemini API
                result = await this.fetchGeminiStory(actionText);
            } else {
                // Offline Simulation Mode
                result = await this.fetchOfflineStoryFallback(actionText);
            }

            // Remove loading indicator
            this.removeLoadingIndicator();

            if (result) {
                // Save the actionText that led to this chapter so we can show it on re-render / undo
                result.actionText = actionText;

                // Parse Success
                this.storyHistory.push(result);
                this.currentChapterIndex = this.storyHistory.length;

                // Play magical ambient swell
                this.playMagicChime();

                // Append Chapter to story canvas (with custom delay text printing)
                await this.printChapterToCanvas(result, actionText);

                // Append AI oracle bubble in chat log
                this.appendChatMessage("ai", `운명의 실타래가 짜였습니다. [Chapter ${this.currentChapterIndex}: ${result.chapterTitle}]을 기록합니다.`);

                // Update Interactive Action cards
                this.renderChoiceCards(result.choices);
            } else {
                throw new Error("소설 생성 결과 형식이 잘못되었습니다.");
            }
        } catch (error) {
            console.error("Story creation failed", error);
            this.removeLoadingIndicator();
            
            // If API key is set, we do not fallback to offline simulation!
            if (this.apiKey) {
                this.appendChatMessage("system", `예언자 연결에 오류가 발생했습니다. (사유: ${error.message}). API 키나 네트워크 환경을 확인하고 다시 시도해 주세요.`);
                alert(`이야기 생성 중 오류가 발생했습니다: ${error.message}\nAPI 키를 확인하거나 전송 버튼을 다시 눌러주세요.`);
                
                // Restore choice cards of the last successful chapter so they can choose again
                if (this.storyHistory.length > 0) {
                    const lastChapter = this.storyHistory[this.storyHistory.length - 1];
                    this.renderChoiceCards(lastChapter.choices);
                } else {
                    // First chapter failed - render a retry option
                    this.choicesContainer.innerHTML = '';
                    const retryCard = document.createElement('div');
                    retryCard.className = 'choice-card';
                    retryCard.innerHTML = `
                        <span class="card-num">RETRY</span>
                        <p>이야기 시작 다시 시도하기</p>
                    `;
                    retryCard.addEventListener('click', () => {
                        this.generateNextStoryNode(actionText);
                    });
                    this.choicesContainer.appendChild(retryCard);
                }
            } else {
                // Offline simulation mode (no apiKey)
                this.appendChatMessage("system", `예언자 연결에 오류가 발생했습니다. (사유: ${error.message}). 임시 세계 선율로 대체합니다.`);
                const fallbackNode = await this.fetchOfflineStoryFallback(actionText);
                fallbackNode.actionText = actionText;
                this.storyHistory.push(fallbackNode);
                this.currentChapterIndex = this.storyHistory.length;
                await this.printChapterToCanvas(fallbackNode, actionText);
                this.renderChoiceCards(fallbackNode.choices);
            }
        } finally {
            this.isGenerating = false;
        }
    }

    // Gemini API Direct REST Request
    async fetchGeminiStory(actionText) {
        const historyText = this.storyHistory.map((c, i) => `[Chapter ${i+1}: ${c.chapterTitle}]\n${c.story}`).join('\n\n');
        
        const systemInstruction = `당신은 세계 최고의 판타지/SF 소설가이자 TRPG 던전 마스터인 '스토리텔러 AI'입니다.
유저와 대화하며 아주 깊고 흥미로운 가상의 모험 이야기(${this.genre} 장르, ${this.tone} 분위기)를 한 장씩 공동 집필해 나가고 있습니다.

규칙:
1. 주인공의 이름은 [${this.characterName}]입니다.
2. 이전까지 쓰인 소설 줄거리 흐름을 완벽히 이어받아 유저의 최신 행동([${actionText}])으로 전개되는 모험 스토리의 다음 장(Chapter)을 가독성 높고 깊이 있는 문장으로 작성해 주세요. (공백 제외 한글 300~500자 내외)
3. 챕터의 제목을 내용에 맞게 지어주세요.
4. 해당 챕터가 끝났을 때, 유저의 캐릭터가 선택할 수 있는 아주 흥미롭고 갈등을 자아내는 상반된 다음 행동 선택지 3가지를 매력적으로 구성해 주세요.
5. 반드시 아래 명시된 JSON Schema 구조를 완전하게 만족하여 JSON 문자열로만 응답해 주세요. 마크다운 기호(\`\`\`json)는 절대 포함하지 마세요.

JSON Schema:
{
  "chapterTitle": "챕터 제목 string",
  "story": "이번 챕터 이야기 본문 내용 string",
  "choices": [
    "유저 선택지 1 string",
    "유저 선택지 2 string",
    "유저 선택지 3 string"
  ]
}`;

        const prompt = `[이전 줄거리 히스토리]\n${historyText || "아직 없음"}\n\n[주인공의 최신 결단/행동]\n${actionText}\n\n위 행동에 이어서 다음 챕터를 완전한 JSON 형태로 출력하세요.`;
        const storySchema = {
            type: "OBJECT",
            properties: {
                chapterTitle: { type: "STRING" },
                story: { type: "STRING" },
                choices: {
                    type: "ARRAY",
                    items: { type: "STRING" }
                }
            },
            required: ["chapterTitle", "story", "choices"]
        };

        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: this.apiKey,
                prompt: prompt,
                systemInstruction: systemInstruction,
                model: this.model,
                responseSchema: storySchema
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({ error: '알 수 없는 서버 오류가 발생했습니다.' }));
            throw new Error(errData.error || `서버 에러 (HTTP ${response.status})`);
        }

        return await response.json();
    }

    // Offline Branching Story Tree fallback
    fetchOfflineStoryFallback(actionText) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const genreTree = this.offlineStories[this.genre] || this.offlineStories['dark-fantasy'];
                const depth = this.storyHistory.length;
                
                // Find node matching actionText or defaults
                let node = null;
                if (depth === 0) {
                    node = genreTree.start;
                } else {
                    // Search in child options
                    const currentNode = this.storyHistory[depth - 1];
                    const choiceIndex = currentNode.choices.indexOf(actionText);
                    
                    const nextKey = choiceIndex >= 0 ? `branch_${choiceIndex + 1}` : 'branch_1';
                    node = (genreTree[depth] && genreTree[depth][nextKey]) || genreTree.start;
                }
                
                // Customize protagonist name inside static story template
                const customizedStory = node.story.replace(/주인공/g, this.characterName);
                
                resolve({
                    chapterTitle: node.chapterTitle,
                    story: customizedStory,
                    choices: [...node.choices]
                });
            }, 1000);
        });
    }

    // Typewriter Text Printing Animation
    printChapterToCanvas(chapterObj, lastAction) {
        return new Promise((resolve) => {
            // Remove previous intro page on first chapter
            if (this.currentChapterIndex === 1) {
                this.storyScrollArea.innerHTML = '';
            }

            // Create Chapter HTML Elements
            const chapterEl = document.createElement('article');
            chapterEl.className = 'chapter-block';

            const headerEl = document.createElement('div');
            headerEl.className = 'chapter-header';
            headerEl.innerHTML = `<span>Chapter ${this.currentChapterIndex}</span> <span>${chapterObj.chapterTitle}</span>`;
            chapterEl.appendChild(headerEl);

            // Selected action indicator
            if (this.currentChapterIndex > 1) {
                const decisionEl = document.createElement('div');
                decisionEl.className = 'user-decision-marker';
                decisionEl.textContent = `"${lastAction}"`;
                chapterEl.appendChild(decisionEl);
            }

            const contentEl = document.createElement('div');
            contentEl.className = 'chapter-content';
            chapterEl.appendChild(contentEl);
            this.storyScrollArea.appendChild(chapterEl);

            // Auto-scroll
            this.storyScrollArea.scrollTop = this.storyScrollArea.scrollHeight;

            // Character typewriter loop
            const fullText = chapterObj.story;
            
            // 마크다운 표, 코드블록, 이미지, 리스트 및 HTML 태그 감지용 정규식
            const hasSpecialFormats = /[#*_\`\[\]!|]/.test(fullText) || /<\/?[a-z][\s\S]*>/i.test(fullText);
            
            if (hasSpecialFormats && (typeof marked !== 'undefined' || window.marked)) {
                contentEl.innerHTML = this.parseMarkdown(fullText);
                chapterEl.style.opacity = 1;
                this.storyScrollArea.scrollTop = this.storyScrollArea.scrollHeight;
                resolve();
                return;
            }

            let charIndex = 0;
            const speed = 25; // ms per character

            const typeChar = () => {
                if (charIndex < fullText.length) {
                    contentEl.innerHTML += fullText.charAt(charIndex);
                    charIndex++;
                    
                    // Procedural sound clicks trigger occasionally
                    if (Math.random() < 0.28) {
                        this.playTypewriterSound();
                    }

                    // Dynamic spawn of background particles responding to "typing flow"
                    if (Math.random() < 0.05) {
                        this.spawnTypingSparkle();
                    }

                    this.storyScrollArea.scrollTop = this.storyScrollArea.scrollHeight;
                    setTimeout(typeChar, speed);
                } else {
                    // Typestyle ends
                    chapterEl.style.opacity = 1;
                    resolve();
                }
            };

            typeChar();
        });
    }

    // 모든 예외 경우의 수를 처리하는 범용 마크다운 표 표준화(Normalizer) 함수
    healMarkdownTable(text) {
        if (!text || !text.includes('|')) return text;

        let healed = text;

        // 0. 표의 마지막 데이터 행 뒤에 개행 없이 일반 지문 문장이 붙어 있는 경우 분리 (유저 스크린샷 케이스 방어)
        // 예: "| 붉은 달의 약속 | 23:45 | 여유 | 나는 당신의..." -> "| 붉은 달의 약속 | 23:45 | 여유 |\n나는 당신의..."
        healed = healed.replace(/(^[ \t]*\|.*\|)[ \t]*([^\n|]+)$/gm, '$1\n$2');

        // 1. 일반 문장 바로 뒤에 표 헤더가 개행 없이 붙어 있는 첫 부분만 정교하게 분리 (줄 시작 기준 gm 플래그 사용)
        // 예: "어떤 걸 볼까? | 영화명 |" -> "어떤 걸 볼까?\n| 영화명 |"
        healed = healed.replace(/(^[^\n|]+)\s*(\|[^|\n]+\|)/gm, '$1\n$2');

        // 2. 뭉친 표(| |)에 줄바꿈 삽입하여 여러 행으로 분리 (개행 문자 \n 제외를 위해 [ \t] 사용)
        healed = healed.replace(/\|[ \t]*\|/g, '|\n|');

        // 3. 줄 단위로 분석하며 표 영역 앞뒤에만 빈 줄(\n\n) 삽입 (파이프 기호 보존 및 오폭률 0%)
        const lines = healed.split('\n');
        const resultLines = [];

        for (let i = 0; i < lines.length; i++) {
            const currentLine = lines[i];
            // 표의 행 판별 조건: 공백 제외 파이프(|)로 시작해 파이프(|)로 끝나는 온전한 행인지 검증
            const isCurrentTableRow = /^\s*\|.*\|\s*$/.test(currentLine);

            if (isCurrentTableRow) {
                if (resultLines.length > 0) {
                    const prevLine = resultLines[resultLines.length - 1];
                    const isPrevTableRow = /^\s*\|.*\|\s*$/.test(prevLine);
                    // 이전 줄이 표가 아니고 빈 줄도 아니었다면 표 시작 전에 빈 줄 삽입
                    if (!isPrevTableRow && prevLine.trim() !== '') {
                        resultLines.push('');
                    }
                }
                resultLines.push(currentLine);
            } else {
                if (resultLines.length > 0) {
                    const prevLine = resultLines[resultLines.length - 1];
                    const isPrevTableRow = /^\s*\|.*\|\s*$/.test(prevLine);
                    // 이전 줄이 표였고 현재 줄이 빈 줄이 아니라면 표 종료 후 빈 줄 삽입
                    if (isPrevTableRow && currentLine.trim() !== '') {
                        resultLines.push('');
                    }
                }
                resultLines.push(currentLine);
            }
        }

        return resultLines.join('\n');
    }

    // Action Cards Renderer
    renderChoiceCards(choices) {
        this.choicesContainer.innerHTML = '';
        
        choices.forEach((choice, index) => {
            const card = document.createElement('div');
            card.className = 'choice-card';
            
            const numerals = ['I', 'II', 'III'];
            card.innerHTML = `
                <span class="card-num">${numerals[index]}</span>
                <p>${choice}</p>
            `;
            
            card.addEventListener('click', () => {
                if (this.isGenerating) return;
                this.generateNextStoryNode(choice);
            });

            this.choicesContainer.appendChild(card);
        });
    }

    // Custom Action Input Submission
    submitCustomAction() {
        const text = this.chatTextarea.value.trim();
        if (!text || this.isGenerating) return;

        this.chatTextarea.value = '';
        this.generateNextStoryNode(text);
    }

    // Chat Log Bubbles
    appendChatMessage(sender, text, emotion = 'normal') {
        const msgEl = document.createElement('div');
        msgEl.className = `${sender}-message chat-bubble-wrapper`;
        
        let processedText = this.parseMarkdown(text);
        
        if (sender === 'ai') {
            msgEl.setAttribute('data-emotion', emotion);
            msgEl.style.cursor = 'pointer';
            msgEl.setAttribute('title', '이 대화 시점의 표정으로 상단 프로필을 동기화합니다.');
            const hasImages = this.characterImages && Object.keys(this.characterImages).length > 0;
            let imgUrl = hasImages ? (this.characterImages[emotion] || this.characterImages['normal']) : '';
            if (imgUrl && imgUrl.startsWith('/data/uploads/')) imgUrl = '.' + imgUrl;
            
            let avatarHtml = '';
            if (imgUrl) {
                avatarHtml = `<img src="${imgUrl}" class="chat-avatar-img" alt="${emotion}" />`;
            } else {
                let avatarIcon = '🔮';
                if (this.chatCharName.includes('릴리스') || this.chatCharName.includes('악마')) avatarIcon = '😈';
                else if (this.chatLevel === 'adult-19') avatarIcon = '💋';
                else avatarIcon = '👤';
                avatarHtml = `<div class="chat-avatar-icon">${avatarIcon}</div>`;
            }
            
            msgEl.innerHTML = `
                <div class="chat-avatar-container">
                    ${avatarHtml}
                </div>
                <div class="chat-message-content">
                    <span class="chat-sender-name">${this.chatCharName}</span>
                    <div class="chat-bubble">
                        ${processedText}
                    </div>
                </div>
            `;
        } else if (sender === 'user') {
            msgEl.innerHTML = `
                <div class="chat-message-content user-content">
                    <div class="chat-bubble user-bubble">
                        ${processedText}
                    </div>
                </div>
            `;
        } else {
            msgEl.className = 'system-message';
            msgEl.innerHTML = `<p><strong>시스템:</strong></p><div>${processedText}</div>`;
        }
        
        this.chatLogArea.appendChild(msgEl);
        this.chatLogArea.scrollTop = this.chatLogArea.scrollHeight;
    }

    appendLoadingIndicator() {
        const loadEl = document.createElement('div');
        loadEl.id = 'loading-indicator-bubble';
        loadEl.className = 'loading-indicator';
        loadEl.innerHTML = `
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <span class="text">오라클이 운명의 실을 잣는 중...</span>
        `;
        this.chatLogArea.appendChild(loadEl);
        this.chatLogArea.scrollTop = this.chatLogArea.scrollHeight;
    }

    removeLoadingIndicator() {
        const loadEl = document.getElementById('loading-indicator-bubble');
        if (loadEl) loadEl.remove();
    }

    // Fetch text embedding vector from server proxy (2단계)
    async fetchEmbedding(text) {
        if (!this.apiKey || !text) return null;

        try {
            const response = await fetch('/api/embed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: this.apiKey,
                    text: text
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: '알 수 없는 임베딩 서버 에러' }));
                console.warn(`[Embedding API Warning]: ${errData.error}`);
                return null;
            }

            const data = await response.json();
            return data.embedding || null;
        } catch (e) {
            console.warn("[Embedding API Catch Warning]: Network error or request failed.", e);
            return null; // Graceful fallback
        }
    }

    // Mathematical Cosine Similarity between two vector arrays (2단계)
    cosineSimilarity(vecA, vecB) {
        if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
        let dotProduct = 0.0;
        let normA = 0.0;
        let normB = 0.0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    // Sound Master Control
    toggleSound() {
        this.soundActive = !this.soundActive;
        this.btnToggleSound.classList.toggle('active', this.soundActive);
        this.btnToggleSound.textContent = this.soundActive ? "🔊 ON" : "🔇 OFF";

        if (this.audioCtx) {
            this.masterVolume.gain.setValueAtTime(this.soundActive ? 0.35 : 0, this.audioCtx.currentTime);
        }
    }

    // Save current simulation session (affection, memories, logs)
    saveActiveSession() {
        if (this.isGenerating) return;

        // Play visual button feedback
        this.playSelectionSwell();

        if (this.modeType === 'chat') {
            const presets = JSON.parse(localStorage.getItem('persona_presets')) || {};
            // Get active preset name
            let presetName = this.selectPersonaPreset.value;

            // If no preset is selected, prompt to save as a new one
            if (!presetName) {
                const createNew = confirm(`대화 상태를 저장하려면 페르소나 프리셋 등록이 필요합니다.\n현재 인물 '${this.chatCharName}'을(를) 페르소나 프리셋으로 저장하고 대화 상태를 기록할까요?`);
                if (!createNew) return;
                
                presetName = this.chatCharName;
                presets[presetName] = {
                    charName: this.chatCharName,
                    relation: this.chatRelation,
                    desc: this.chatCharDesc,
                    level: this.chatLevel,
                    userName: this.characterName
                };
            }

            // Save session states
            presets[presetName].savedSession = {
                affinityValue: this.affinityValue,
                memoryList: [...this.memoryList],
                storyHistory: [...this.storyHistory],
                dialogueVectors: [...this.dialogueVectors], // RAG 벡터 스냅샷 추가 (2단계)
                chatLevel: this.chatLevel, // 세션 저장 시 현재 수위값 동시 보관
                userName: this.characterName // 세션 저장 시 현재 주인공 이름 보관
            };
            
            // 프리셋 레벨 및 주인공 이름 자체도 현재 값으로 동기화
            presets[presetName].level = this.chatLevel;
            presets[presetName].userName = this.characterName;
            
            // Ensure preset images & prompt are preserved
            presets[presetName].characterImages = this.characterImages || {};
            presets[presetName].imagePrompt = this.inputCharImagePrompt.value.trim();

            try {
                localStorage.setItem('persona_presets', JSON.stringify(presets));
                this.loadPersonaPresets();
                this.selectPersonaPreset.value = presetName;
                alert(`'${presetName}' 캐릭터와의 교감 상태(호감도 및 메모리)가 안전하게 저장되었습니다.`);
                // 비동기로 서버에 동기화 백업
                this.pushPersonasToServer();
            } catch (e) {
                console.error("Failed to save chat session", e);
                alert("세션 저장 중 용량 초과 또는 브라우저 오류가 발생했습니다.");
            }

        } else {
            // Story session save
            const storySession = {
                storyHistory: [...this.storyHistory],
                currentChapterIndex: this.currentChapterIndex,
                genre: this.genre,
                tone: this.tone,
                characterName: this.characterName
            };
            
            try {
                localStorage.setItem('saved_story_session', JSON.stringify(storySession));
                alert("현재 소설 집필 세션이 안전하게 저장되었습니다.");
            } catch (e) {
                console.error("Failed to save story session", e);
                alert("세션 저장 중 오류가 발생했습니다.");
            }
        }
    }

    // Reset Story Engine
    resetStory() {
        const resetMsg = this.modeType === 'chat' ? "정말 처음부터 대화를 다시 시작하시겠습니까? 지금까지의 호감도와 기억이 초기화됩니다." : "정말 처음부터 소설을 다시 집필하시겠습니까? 현재 서사시는 모두 사라집니다.";
        if (confirm(resetMsg)) {
            this.storyHistory = [];
            this.currentChapterIndex = 0;
            if (this.modeType === 'chat') {
                this.affinityValue = 50;
                this.memoryList = ["첫 대화가 시작되었습니다."];
                
                // Clear saved session on the current preset (리셋 반영)
                const presets = JSON.parse(localStorage.getItem('persona_presets')) || {};
                const targetPreset = this.selectPersonaPreset.value || this.chatCharName;
                if (presets[targetPreset]) {
                    delete presets[targetPreset].savedSession;
                    localStorage.setItem('persona_presets', JSON.stringify(presets));
                }

                this.storyScrollArea.innerHTML = '';
                this.renderChatLeftPanel({ choices: [] });
                this.chatLogArea.innerHTML = `
                    <div class="system-message">
                        <p><strong>오라클 예언자:</strong> 이전 교감의 기록이 모두 지워졌습니다. 처음으로 돌아가 새로운 대화를 시작합니다.</p>
                    </div>
                `;
                this.generateNextChatNode("대화를 시작하자.");
            } else {
                // Clear saved story session (소설 리셋 반영)
                localStorage.removeItem('saved_story_session');

                this.storyScrollArea.innerHTML = `
                    <div class="cover-page">
                        <div class="crown-ornament">✨</div>
                        <h2 id="book-title">새로운 서사시가 곧 기록됩니다</h2>
                        <p class="book-intro">오른쪽의 예언서 대화창을 통해 이야기를 움직이고 AI와 함께 가상 세계를 조율해 나가세요.</p>
                    </div>
                `;
                this.chatLogArea.innerHTML = `
                    <div class="system-message">
                        <p><strong>오라클 예언자:</strong> 새로운 평행 세계가 창조되었습니다. 다시 한번 위대한 결단을 들려주십시오.</p>
                    </div>
                `;
                this.generateNextStoryNode("이야기를 시작해줘.");
            }
        }
    }

    // Revert the last chapter decision
    undoLastAction() {
        if (this.isGenerating) return;
        if (this.storyHistory.length === 0) {
            alert("실행 취소할 이전 상태가 없습니다.");
            return;
        }

        // Sound feedback
        this.playSelectionSwell();

        // Pop the last chapter
        const popped = this.storyHistory.pop();
        this.currentChapterIndex = this.storyHistory.length;

        // Re-render Story Scroll Area
        if (this.storyHistory.length === 0) {
            if (this.modeType === 'chat') {
                this.affinityValue = 50;
                this.memoryList = ["첫 대화가 시작되었습니다."];
                this.storyScrollArea.innerHTML = '';

                // Render Profile Card in fixed container
                this.renderChatProfile();
                
                const startBtn = document.createElement('button');
                startBtn.className = 'glow-btn';
                startBtn.style.margin = '2rem auto';
                startBtn.style.display = 'block';
                startBtn.textContent = '대화 다시 시작하기';
                startBtn.onclick = () => this.generateNextChatNode("대화를 시작하자.");
                this.storyScrollArea.appendChild(startBtn);

                // Reset Chat Log
                this.chatLogArea.innerHTML = `
                    <div class="system-message">
                        <p><strong>오라클 예언자:</strong> ${this.chatCharName}과의 새로운 교감이 시작되려 합니다. 마음을 열고 첫 대화를 시작해 보세요.</p>
                    </div>
                `;
                
                // Render disabled choices
                this.choicesContainer.innerHTML = '';
                const numerals = ['I', 'II', 'III'];
                const defaultTexts = [
                    "대화를 시작하면 선택지가 활성화됩니다.",
                    "선택지를 눌러 답변을 하거나 지시할 수 있습니다.",
                    "원하는 말이 없으면 하단 창에 직접 쳐보세요."
                ];
                defaultTexts.forEach((text, index) => {
                    const card = document.createElement('div');
                    card.className = 'choice-card disabled';
                    card.innerHTML = `<span class="card-num">${numerals[index]}</span><p>${text}</p>`;
                    this.choicesContainer.appendChild(card);
                });
            } else {
                // Back to start state
                this.storyScrollArea.innerHTML = `
                    <div class="cover-page">
                        <div class="crown-ornament">✨</div>
                        <h2 id="book-title">새로운 서사시가 곧 기록됩니다</h2>
                        <p class="book-intro">오른쪽의 예언서 대화창을 통해 이야기를 움직이고 AI와 함께 가상 세계를 조율해 나가세요.</p>
                    </div>
                `;
                // Reset Chat Log
                this.chatLogArea.innerHTML = `
                    <div class="system-message">
                        <p><strong>오라클 예언자:</strong> 반갑습니다, 창조자님. 당신의 결단에 따라 세계의 운명이 흘러갈 것입니다. 원하시는 이야기 전개를 하단의 3가지 추천 행동 카드나 텍스트창을 통해 들려주십시오.</p>
                    </div>
                `;
                // Render disabled choice cards
                this.choicesContainer.innerHTML = '';
                const numerals = ['I', 'II', 'III'];
                const defaultTexts = [
                    "첫 챕터 작성을 시작하면 선택지가 활성화됩니다.",
                    "선택지를 눌러 방향을 조율할 수 있습니다.",
                    "원하는 방향이 없으면 대화창에 직접 지시하세요."
                ];
                defaultTexts.forEach((text, index) => {
                    const card = document.createElement('div');
                    card.className = 'choice-card disabled';
                    card.innerHTML = `
                        <span class="card-num">${numerals[index]}</span>
                        <p>${text}</p>
                    `;
                    this.choicesContainer.appendChild(card);
                });

                // Start again button
                const startBtn = document.createElement('button');
                startBtn.className = 'glow-btn';
                startBtn.style.margin = '2rem auto';
                startBtn.style.display = 'block';
                startBtn.textContent = '이야기 다시 시작하기';
                startBtn.onclick = () => {
                    this.generateNextStoryNode("이야기를 시작해줘.");
                };
                this.storyScrollArea.appendChild(startBtn);
            }
        } else {
            // Reconstruct affinity and memoryList from history
            if (this.modeType === 'chat') {
                this.affinityValue = 50;
                this.memoryList = ["첫 대화가 시작되었습니다."];
                this.storyHistory.forEach(item => {
                    const change = parseInt(item.affinityChange) || 0;
                    this.affinityValue = Math.min(100, Math.max(0, this.affinityValue + change));
                    if (item.memoryNotes && item.memoryNotes.trim() !== "") {
                        if (!this.memoryList.includes(item.memoryNotes)) {
                            this.memoryList.push(item.memoryNotes);
                        }
                        if (this.memoryList.length > 5) this.memoryList.shift();
                    }
                });
                
                this.renderChatLeftPanel(this.storyHistory[this.storyHistory.length - 1]);
            } else {
                // Re-render remaining chapters
                this.storyScrollArea.innerHTML = '';
                this.storyHistory.forEach((chapter, index) => {
                    const chapterNum = index + 1;
                    const chapterEl = document.createElement('article');
                    chapterEl.className = 'chapter-block';
                    chapterEl.style.opacity = 1; // Show immediately

                    const headerEl = document.createElement('div');
                    headerEl.className = 'chapter-header';
                    headerEl.innerHTML = `<span>Chapter ${chapterNum}</span> <span>${chapter.chapterTitle}</span>`;
                    chapterEl.appendChild(headerEl);

                    if (chapterNum > 1) {
                        const decisionEl = document.createElement('div');
                        decisionEl.className = 'user-decision-marker';
                        decisionEl.textContent = `"${chapter.actionText || '이전 선택'}"`;
                        chapterEl.appendChild(decisionEl);
                    }

                    const contentEl = document.createElement('div');
                    contentEl.className = 'chapter-content';
                    contentEl.innerHTML = this.parseMarkdown(chapter.story);
                    chapterEl.appendChild(contentEl);
                    this.storyScrollArea.appendChild(chapterEl);
                });

                this.storyScrollArea.scrollTop = this.storyScrollArea.scrollHeight;
            }

            // Remove the last user message and ai message from the chat log
            const userMsgs = this.chatLogArea.querySelectorAll('.user-message');
            const aiMsgs = this.chatLogArea.querySelectorAll('.ai-message');
            
            if (userMsgs.length > 0) {
                userMsgs[userMsgs.length - 1].remove();
            }
            if (aiMsgs.length > 0) {
                aiMsgs[aiMsgs.length - 1].remove();
            }

            // Append system message indicating undo
            this.appendChatMessage("system", `이전 대화가 취소되었습니다.`);

            // Re-render choice cards of the current last chapter
            const lastChapter = this.storyHistory[this.storyHistory.length - 1];
            this.renderChoiceCards(lastChapter.choices);
        }
    }

    // Export current story text file
    exportStory() {
        if (this.storyHistory.length === 0) {
            alert(this.modeType === 'chat' ? "기록된 대화가 아직 없습니다!" : "기록된 소설 챕터가 아직 없습니다!");
            return;
        }

        let fullContent = `==================================================\n`;
        if (this.modeType === 'chat') {
            fullContent += `   CHRONICLE AI CHARACTER CHAT - [${this.chatCharName}과의 교감 기록]\n`;
            fullContent += `   관계: ${this.chatRelation} | 최종 호감도: ${this.affinityValue}/100\n`;
            fullContent += `==================================================\n\n`;
            
            fullContent += `🧠 주요 기억 메모리:\n`;
            this.memoryList.forEach(m => {
                fullContent += ` - ${m}\n`;
            });
            fullContent += `\n==================================================\n\n`;

            this.storyHistory.forEach((c, i) => {
                fullContent += `[Turn ${i + 1}]\n`;
                if (c.actionText && c.actionText !== "대화를 시작하자.") {
                    fullContent += `주인공: ${c.actionText}\n`;
                }
                fullContent += `${this.chatCharName}: ${c.dialogue}\n`;
                fullContent += `\n--------------------------------------------------\n\n`;
            });
        } else {
            fullContent += `   CHRONICLE AI STORYBOOK - [${this.characterName}의 서사시]\n`;
            fullContent += `   장르: ${this.genre} | 분위기: ${this.tone}\n`;
            fullContent += `==================================================\n\n`;

            this.storyHistory.forEach((c, i) => {
                fullContent += `[Chapter ${i + 1}: ${c.chapterTitle}]\n\n`;
                fullContent += `${c.story}\n`;
                fullContent += `\n--------------------------------------------------\n\n`;
            });
        }

        const blob = new Blob([fullContent], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = this.modeType === 'chat' ? `${this.chatCharName}_과의_대화기록.txt` : `${this.characterName}_의_서사시_${this.genre}.txt`;
        link.click();
    }

    // Dynamic drifting background nebulae
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    generateAmbientStars() {
        this.bgParticles = [];
        const count = 40;
        const colors = ['rgba(217, 119, 6, 0.12)', 'rgba(139, 92, 246, 0.1)', 'rgba(6, 182, 212, 0.1)'];
        for (let i = 0; i < count; i++) {
            this.bgParticles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 80 + 30,
                color: colors[Math.floor(Math.random() * colors.length)],
                vx: Math.random() * 0.15 - 0.075,
                vy: Math.random() * 0.15 - 0.075,
                alpha: Math.random() * 0.5 + 0.1
            });
        }
    }

    spawnTypingSparkle() {
        // Creates a tiny float bubble behind the ledger
        const colors = ['#d97706', '#8b5cf6', '#06b6d4'];
        this.bgParticles.push({
            x: Math.random() * (this.canvas.width * 0.5), // Spawn mostly on left side (Codex side)
            y: this.canvas.height - 50,
            size: Math.random() * 3 + 1,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: Math.random() * 0.2 - 0.1,
            vy: -(Math.random() * 0.8 + 0.4),
            alpha: 1.0,
            decay: Math.random() * 0.003 + 0.001
        });
    }

    animateBackground() {
        return; // Disabled for performance
        requestAnimationFrame(() => this.animateBackground());

        this.ctx.fillStyle = '#faf9f6';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.bgParticles.forEach((star, idx) => {
            star.x += star.vx;
            star.y += star.vy;

            // Boundary wrap
            if (star.x < -100) star.x = this.canvas.width + 100;
            if (star.x > this.canvas.width + 100) star.x = -100;
            if (star.y < -100) star.y = this.canvas.height + 100;
            if (star.y > this.canvas.height + 100) star.y = -100;

            // Decay for typing sparkles
            if (star.decay) {
                star.alpha -= star.decay;
            }

            if (star.alpha > 0) {
                this.ctx.globalAlpha = star.alpha;
                this.ctx.fillStyle = star.color;
                
                // Draw soft nebula circles (blur is handled efficiently in CSS GPU)
                this.ctx.beginPath();
                this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });

        // Remove dead typing sparkles
        this.bgParticles = this.bgParticles.filter(s => !s.decay || s.alpha > 0);
        this.ctx.globalAlpha = 1.0;
    }

    // Build Static Offline Branching Stories for Simulation Mode
    initOfflineStories() {
        this.offlineStories = {
            'dark-fantasy': {
                start: {
                    chapterTitle: "심연의 부름",
                    story: "차가운 밤안개가 은빛 달빛 아래로 흐릅니다. 주인공은(는) 부서진 비석과 가시 덩굴로 가득한 '흐느끼는 자들의 묘지' 대성당 입구 앞에 서 있습니다. 등 뒤에서 들리는 불길한 바람 소리는 마치 심연 밑바닥에서 누군가 속삭이는 목소리 같습니다. 가슴속에 깊숙이 봉인된 고대 마법의 불씨가 불길하게 고동칩니다. 주인공은(는) 성당 내부의 거대한 청동 문 너머에서 흘러나오는 푸른 괴광을 바라봅니다. 지금 결단을 내려야 합니다.",
                    choices: [
                        "성당 내부의 봉인된 거대한 청동 문을 박차고 들어간다.",
                        "성당 외벽의 부서진 틈새를 조사하여 조용히 진입을 꾀한다.",
                        "가슴속 깊은 마법의 불씨를 지펴 주위의 밤안개를 불사른다."
                    ]
                },
                1: {
                    branch_1: {
                        chapterTitle: "파괴된 봉인",
                        story: "주인공이(가) 숨을 깊게 들이쉬며 굳게 닫혀 있던 청동 문을 거칠게 밀어붙입니다. 육중한 문이 끼이익 날카로운 마찰음을 내며 양옆으로 열리자, 대성당 바닥 깊숙한 지하 통로에서 뿜어져 나온 푸른 괴광이 대리석 성단을 휘감아 돕니다. 그 공기 속에 피비린내 나는 마력이 진동합니다. 빛의 중심에는 검은 가시나무 뿌리에 꿰뚫린 거대한 검 한 자루가 공중에 둥둥 떠서 박동하고 있습니다. 그때 성당 모퉁이 어둠 속에서 수십 개의 붉은 안광이 어둠을 찢고 번뜩입니다.",
                        choices: [
                            "공중에 뜬 가시나무 대검을 향해 돌진해 검 자루를 움켜쥔다.",
                            "붉은 눈의 괴수들이 튀어나오기 전에 고대 주문의 봉인진을 성당 바닥에 구축한다.",
                            "뒤돌아 청동 문을 다시 걸어 잠그고 안전한 출구를 찾아 주위를 엄폐한다."
                        ]
                    },
                    branch_2: {
                        chapterTitle: "틈새의 엿봄",
                        story: "조심스럽게 성당의 외벽을 타고 흐르던 주인공은(는) 장미 무늬가 조각된 장엄한 고딕식 유리창이 거칠게 부서져 내린 틈새를 찾아냅니다. 틈 사이로 시선을 밀어 넣자 성당 예배당 천장 높이 서려 있는 기괴한 검은 안개 뭉치가 살아있는 뱀처럼 움직이는 모습이 포착됩니다. 그 안개 뱀은 제단 위에 떠 있는 붉게 달아오른 룬 석판을 칭칭 동여매고 쥐어짜고 있었습니다. 주인공이(가) 한 발짝을 옮기려는 찰나, 바닥에 깔린 오래된 고해성사 단상 밑에서 차가운 철창 쇠사슬 소리가 들리며 누군가 신음합니다.",
                        choices: [
                            "부서진 유리창을 통해 예배당 내부 제단으로 직접 몸을 날려 착지한다.",
                            "쇠사슬 소리가 들리는 지하실 입구를 덮은 고무나무 덩굴을 치워 신음하는 자를 확인한다.",
                            "제단의 룬 석판을 향해 소유한 단도를 힘껏 던져 석판을 부순다."
                        ]
                    },
                    branch_3: {
                        chapterTitle: "안개의 해방",
                        story: "주인공이(가) 두 손을 움켜쥐고 심장에 봉인된 불씨를 해방하자, 뜨거운 불길이 오렌지빛 뱀처럼 전신을 타고 올라 밤안개를 무서운 기세로 집어삼킵니다. 기이한 굉음과 함께 안개가 불타 사라지며 그 속에 갇혀 숨죽이고 있던 수많은 고령의 환영들이 풀려나 허공을 떠돕니다. 그중 금빛 눈동자를 지닌 늙은 마법사의 넋이 주인공의(의) 앞을 막아서며 떨리는 목소리로 속삭입니다. '불을 끄게, 아이야. 그것은 안개가 아니라 저 심연의 왕이 빛을 피하기 위해 쳐둔 유일한 장막이자 안전막이라네!'",
                        choices: [
                            "경고를 무시하고 화염의 열기를 높여 주변의 모든 안개를 소멸시킨다.",
                            "마법을 즉각 멈추고 늙은 마법사의 영혼에게 장막 너머의 위협이 무엇인지 캐묻는다.",
                            "마법사의 환영이 품고 있는 반짝이는 유골 목걸이를 손으로 낚아챈다."
                        ]
                    }
                },
                2: {
                    branch_1: {
                        chapterTitle: "심연의 지배자",
                        story: "주인공이(가) 날아드는 어둠의 포효를 뚫고 제단 위 공중에 정지된 가시나무 대검을 낚아챕니다. 손가락이 가시 박힌 강철 자루에 닿는 순간, 거친 번개와 함께 뇌가 찢기는 듯한 심연의 지식과 비명이 머릿속으로 흘러들어옵니다. 검이 품고 있던 흑마법이 주인공의(의) 핏줄을 검게 태우며 무시무시한 괴력을 전해줍니다. 성당의 어둠 속에서 기어 나오던 붉은 눈의 야수들이 그 흑마법의 패기에 질려 일제히 무릎을 꿇고 으르렁거립니다. 대검은 부르르 떨며 주인공에게(게) 다음 갈 길을 가리킵니다.",
                        choices: [
                            "야수들의 군대를 통솔해 묘지 바깥 세상의 봉인된 봉우리 성채를 습격한다.",
                            "대검의 자가 의지를 억누르며 검의 마력을 모두 뽑아 성당 바닥을 붕괴시킨다.",
                            "야수 무리들을 지배하기보다 단숨에 모두 베어 베인 영혼들의 힘을 무기에 축적한다."
                        ]
                    },
                    branch_2: {
                        chapterTitle: "쇠사슬 밑의 비밀",
                        story: "주인공이(가) 가시덤불을 칼로 걷어내고 철창으로 굳게 닫힌 지하실 계단을 힘겹게 개방합니다. 퀴퀴한 화약 냄새와 피 냄새를 뚫고 내려간 어둠 속에서 온몸에 은색 낙인이 박힌 채 거꾸로 결박된 백발의 소녀를 만납니다. 그녀가 충혈된 눈을 치켜뜨며 경고합니다. '위의 제단에 걸린 칼은 절대 건드리지 마세요. 저를 묶고 있는 이 은색 족쇄의 룬 문자를 해독해 저를 풀어주신다면, 이 성당 밑에 묻힌 진짜 고대의 아티팩트가 있는 석실을 열어드리겠어요.'",
                        choices: [
                            "소녀의 경고를 믿고 은색 족쇄에 새겨진 마법 룬을 해독하는 작업에 착수한다.",
                            "소녀의 정체가 의심스럽다. 그녀의 머리에 손을 얹고 기억 투영 마법을 걸어 정체를 살핀다.",
                            "소녀는 무시하고 그녀 뒤쪽 벽면에 숨겨진 기이한 양각 조각상을 파괴한다."
                        ]
                    },
                    branch_3: {
                        chapterTitle: "파멸의 서막",
                        story: "성당의 모든 밤안개가 소멸하고, 완전한 정적과 암흑만이 남게 됩니다. 안개가 걷힌 묘지 대성당 한가운데에는 이제 기괴한 외골격 아머를 몸에 걸친 심연의 기사가 거대한 방패를 짚은 채 잠에서 깨어나 가라앉은 목소리로 선언합니다. '안개를 지워 봉인을 해방한 자가 바로 너로구나. 네 심장의 불씨를 내놓는다면 고통 없이 최후를 맞이하게 해주마.' 주인공의(의) 마법 불꽃이 기사의 차가운 한기에 닿아 힘없이 푸른 빛으로 사그라들기 시작합니다.",
                        choices: [
                            "최후의 마력 불씨를 무기에 부여해 기사의 머리를 향해 돌진 베기를 시도한다.",
                            "항복하는 척하며 기사의 발아래 바닥으로 몸을 던져 묘지 하수구 통로로 구른다.",
                            "기사를 설득해 서로의 힘을 합쳐 성당 너머 대륙의 중심 제국을 정복하자고 제안한다."
                        ]
                    }
                }
            },
            'sci-fi': {
                start: {
                    chapterTitle: "미지의 신호",
                    story: "은하 변방 구역을 정찰 중이던 주인공은(는) 차원 도약 엔진이 오작동하며 이름 모를 행성 '세이렌-9'의 궤도에 멈춰 섭니다. 우주선의 센서가 행성의 짙은 자색 대기 층 밑바닥에서 발신되는 해독 불가한 초광속 양자 신호를 포착합니다. 신호의 주기적인 파동은 마치 거대한 거인이 숨 쉬는 듯한 주파수입니다. 우주선의 비상 전력은 15%밖에 남지 않았고 산소 수치도 줄어들고 있습니다. 주인공은(는) 궤도상에 남을지, 위험을 무릅쓰고 자색 구름 장막 속으로 강하할지 선택해야 합니다.",
                    choices: [
                        "우주선의 모든 쉴드를 기동하고 자색 대기권 속 신호 발신지로 강하한다.",
                        "궤도상에 유지하며, 비상 전력을 아끼고 양자 신호의 오디오 주파수를 완벽히 해독해 본다.",
                        "주변 소행성 지대에서 원자 에너지를 지닌 광물을 채굴하기 위해 탐사선을 보낸다."
                    ]
                },
                1: {
                    branch_1: {
                        chapterTitle: "구름 속의 사원",
                        story: "우주선이 대기 마찰로 붉게 타오르며 짙은 보랏빛 번개 구름을 돌파합니다. 계기판이 미쳐 날뛰며 고장 나기 직전, 구름막 아래에 펼쳐진 광경에 숨이 막힙니다. 그것은 기하학적인 초합금 금속판들로 지어진 거대한 피라미드 사원들이 지표면 전체를 채운 거대 기계 도시였습니다. 도시의 도로마다 붉은 액체 에너지가 강물처럼 순환하고 있습니다. 신호의 발원지는 가장 거대한 중앙 피라미드의 정상 꼭대기입니다. 그때 지상 돌출 포탑들이 일제히 푸른 플라스마 광선을 우주선을 향해 겨냥합니다.",
                        choices: [
                            "모든 보조 추진기를 점화하여 포탑들을 피하고 피라미드 정상 평원에 비상 착륙한다.",
                            "통신 채널을 우주 공용 양자 주파수로 개방해 포탑들을 향해 비적대적 신호를 송출한다.",
                            "우주선의 비상 탈출 포드를 타고 몸만 사원 지붕 틈새로 사출한다."
                        ]
                    },
                    branch_2: {
                        chapterTitle: "해독된 메아리",
                        story: "비상 동력을 유지한 채 컴퓨터 코어를 양자 신호 분석에 집중시킨 주인공은(는) 수 시간의 사투 끝에 무시무시한 메시지를 필터링해 냅니다. 스피커를 뚫고 흘러나오는 소리는 기계 변조된 인간의 절규에 가까운 비명이었습니다. '...도망쳐라... 이곳은 행성이 아니다. 이것은 백만 년 전에 잠든 고대 인류 유산의 연산 매트릭스 자체다! 침입자를 감지하는 순간 행성의 대기 자체가...' 신호가 비명 소리와 함께 지직거리며 차단되고, 우주선의 차원 도약기가 갑자기 멋대로 자가 충전을 개시합니다.",
                        choices: [
                            "차원 도약이 충전되는 즉시 이 성계를 완전히 탈출해 멀리 도망친다.",
                            "자가 충전되는 엔진의 주파수를 역추적해 강제로 대기권 아래 도시 통제권을 침투해 본다.",
                            "반대 방향으로 스러스터를 뿜어 행성의 인력권을 조용히 벗어난다."
                        ]
                    },
                    branch_3: {
                        chapterTitle: "소행성 탐사의 결실",
                        story: "주인공이(가) 탐사 무인선을 띄워 가장 가까운 소행성 크레이터 깊숙이 진입시킵니다. 채굴 드릴이 암석 표면을 뚫자, 내부에서 청명한 에메랄드빛 광채를 뿜는 초고밀도 '하페리온 원석'이 발견됩니다. 무인선이 원석을 회수하여 돌아오는 순간, 원석의 극성 에너지에 반응한 듯 행성 표면에서 쏘아 올려진 백색의 중력 역전 빔이 탐사선을 감싸 쥡니다. 무인선과 원석이 행성 밑바닥으로 급격히 끌려 내려가기 시작합니다.",
                        choices: [
                            "무인선을 포기하고 우주선의 안전을 위해 견인 케이블을 과감히 절단한다.",
                            "우주선의 남은 에너지를 케이블 견인 윈치에 몰아넣어 하페리온 원석을 기필코 끌어당긴다.",
                            "중력 역전 빔의 파동 주파수에 우주선의 방어막 코드를 동기화해 빔을 타고 함께 하강한다."
                        ]
                    }
                },
                2: {
                    branch_1: {
                        chapterTitle: "코어와의 대면",
                        story: "추락하듯 피라미드 지붕 위로 착륙한 주인공은(는) 연기 나는 해치를 열고 밖으로 나옵니다. 외계의 자색 바람이 슈트를 때립니다. 피라미드 정상 중앙에는 투명한 양자 역장에 둘러싸인 거대한 유기체 홀로그램 뇌가 떠서 연산 작업을 수행하고 있습니다. 주인공이(가) 다가서자 뇌 주위의 금속 가시들이 회전하며 차가운 홀로그램 인터페이스를 띄웁니다. 인터페이스에는 한글로 주인공의(의) 프로필과 과거 기록들이 실시간으로 분석되어 스캔되고 있습니다. '환영한다, 최후의 생존자여. 새로운 연산 매트릭스의 관리자로 로그인하겠는가?'",
                        choices: [
                            "홀로그램 제어 콘솔에 자신의 생체 코드를 주입하여 역사의 지배자가 된다.",
                            "인터페이스의 전원 케이블 더미를 권총으로 쏴서 기계 도시 전체를 영구 차단한다.",
                            "거부하고 우주선으로 돌아가기 위한 예비 전력 코어 1개만 탈취하여 탈출을 시도한다."
                        ]
                    },
                    branch_2: {
                        chapterTitle: "차원 탈출",
                        story: "차원 도약 엔진이 100% 충전되어 번뜩이는 광원과 함께 은하계 전역의 우주 파편이 휘감깁니다. 도약 버튼을 누르는 찰나, 행성의 자색 대기권 전체가 급격히 응축되며 거대한 구체 장막을 형성해 우주선을 가둡니다. 우주선 전면 유리창 너머로 행성 표면 자체가 거대한 기계 눈동자처럼 깜빡이며 우주선 내부 AI에 직접 신호를 보내오기 시작합니다. '너의 기억 데이터는 이 우주가 보존해야 할 가치가 있다. 육체를 버리고 영혼을 이 장막에 귀속시켜라.'",
                        choices: [
                            "AI 시스템의 제어권을 수동으로 전환하고 엔진 폭주를 일으켜 장막을 강제로 뚫는다.",
                            "기계의 제안을 받아들이고 자신의 기억과 정신을 행성 네트워크에 업로드한다.",
                            "우주선 무기실의 전술 핵융합 미사일을 성계 중심부를 향해 발사해 자폭을 감행한다."
                        ]
                    },
                    branch_3: {
                        chapterTitle: "우주의 낙원",
                        story: "중력 빔에 방어막을 동기화하자, 우주선은 아무런 마찰 없이 세이렌-9 행성의 심해 도시로 미끄러져 들어갑니다. 도시의 유리 돔 너머에는 멸망한 은하계 최고 문명의 후예들이 평화롭게 떠돌아다니며 찬란한 빛의 축제를 열고 있습니다. 그들의 왕이 주인공을(를) 맞이하며 금빛 성배를 건넵니다. '이곳은 시간의 흐름이 멈춘 낙원입니다. 바깥 세계의 전쟁과 산소 부족은 잊고, 이 영원한 은하의 안식처에 함께 머무시지요.'",
                        choices: [
                            "낙원에 잔류하여 은하의 모든 비밀이 담긴 지식 도서관을 정독한다.",
                            "그들의 기술을 훔쳐 우주선 엔진을 수리하고 바깥 우주에 이 사실을 경고하러 나간다.",
                            "술잔을 바닥에 던지고 이 낙원이 투영해 낸 가상의 매트릭스 홀로그램임을 폭로한다."
                        ]
                    }
                }
            },
            'romance': {
                start: {
                    chapterTitle: "장미 정원의 첫 만남",
                    story: "눈부신 벚꽃 잎이 흩날리는 제국의 황실 가면무도회장 정원. 주인공은(는) 가슴속에 아픈 비밀을 품은 채 가면에 얼굴을 가리고 서 있습니다. 밤하늘을 수놓은 화려한 불꽃놀이 소리를 뒤로하고 깊은 정원의 미로를 헤매던 중, 정자 난간에 기댄 채 차가운 밤공기를 들이마시는 신비로운 은발의 마도사 레온을 만납니다. 레온의 손에 들린 목걸이가 주인공이(가) 가진 목걸이 조각과 가까워질수록 눈부신 에메랄드빛 광채를 내며 요동치기 시작합니다. 마주친 서로의 금빛 안광 속에서 깊은 운명의 끈이 얽힙니다.",
                    choices: [
                        "가면을 천천히 벗으며, 내 목걸이와 같은 목걸이를 어디서 얻었는지 묻는다.",
                        "레온의 마법적 도발을 피하기 위해 조용히 정원의 미로 숲 속으로 달아난다.",
                        "목걸이 마력을 자극해 순간이동 마법으로 그의 눈앞에서 사라져 기둥 뒤에 숨는다."
                    ]
                },
                1: {
                    branch_1: {
                        chapterTitle: "운명의 벚꽃 선율",
                        story: "주인공이(가) 떨리는 손으로 화려한 가면을 풀자, 은발의 마도사 레온은 숨이 막힌 듯 벚꽃 잎이 흐르는 가로수 아래에서 한 걸음 다가옵니다. 그의 금빛 눈동자에 비친 감정이 복잡하게 소용돌이칩니다. '그 목걸이... 설마 10년 전 눈바람 속에서 잃어버렸던 나의 그 아이가 맞단 말인가?' 레온은 깊은 슬픔과 애정이 깃든 차가운 손으로 주인공의(의) 뺨을 살포시 매만집니다. 그의 체온과 뺨에 닿는 부드러운 감각에 가슴 깊이 잠들었던 옛 기억들이 하나둘 깨어납니다. 그때, 미로 숲 뒤쪽에서 수색하는 기사들의 급박한 발걸음 소리가 가까워집니다.",
                        choices: [
                            "레온의 손을 꼭 잡고 기사들의 눈을 피해 더 깊고 호젓한 정원의 안개 숲으로 달아난다.",
                            "그의 가슴에 얼굴을 묻으며 10년 동안 간직해 왔던 진짜 속마음을 털어놓는다.",
                            "가까워지는 수색대에게 일부러 소리를 질러 레온과의 수상한 접촉을 들키게 만든다."
                        ]
                    }
                }
            },
            'celebrity': {
                start: {
                    chapterTitle: "스캔들의 밤",
                    story: "신인 여우주연상을 수상하며 연예계의 뜨거운 신성으로 떠오른 주인공. 수상 기념 영화 뒤풀이 파티가 한창인 고급 청담동 라운지 바의 테라스에서, 라이벌 배우이자 제국의 톱스타인 주혁과 마주합니다. 주혁은 손에 든 샴페인 잔을 흔들며 주인공의(의) 곁으로 다가와 귓속말을 건넵니다. '축하해, 신인상. 하지만 내일 아침 터질 너와 나에 대한 충격적인 청담동 밀회 스캔들 기사는 어떻게 막을 생각이지?' 그의 차가운 눈빛과 매혹적인 조소 속에 거친 연예계의 소용돌이가 휘감아 돕니다. 기사 송출까지 남은 시간은 단 4시간뿐입니다.",
                    choices: [
                        "주혁의 멱살을 잡고 테라스 구석으로 끌고 가 스캔들의 진짜 배후가 누구인지 다그친다.",
                        "도발을 무시하고 소속사 대표에게 즉각 전화를 걸어 언론 통제 백업을 지시한다.",
                        "주혁의 잔에 샴페인을 따라주며, 역으로 비즈니스 계약 연애를 제안하는 과감한 배팅을 한다."
                    ]
                },
                1: {
                    branch_1: {
                        chapterTitle: "위험한 계약",
                        story: "주인공이(가) 눈빛을 매섭게 빛내며 역으로 주혁에게 다가가 위험한 계약 연애 카드를 던집니다. 주혁의 차가운 눈빛에 잠시 당혹감과 이채로운 호기심이 번뜩입니다. 그는 샴페인을 단숨에 들이켠 뒤, 주인공의(의) 허리를 과감히 끌어당겨 파티장 테라스 조명 아래 밀착시킵니다. '계약 연애라... 내 몸값이 좀 비싼데 감당할 수 있겠어? 조건은 간단해. 매주 주말 내 펜트하우스에서 열리는 사적인 모임에 내 공식 파트너로 참석하는 것.' 그의 심장 박동과 숨결이 뺨에 닿을 듯 가깝게 밀려옵니다. 그때 어둠 속에서 파파라치의 카메라 플래시가 한 번 번쩍입니다.",
                        choices: [
                            "플래시가 터진 방향으로 달려가 파파라치의 카메라 메모리 카드를 탈취하려 소리친다.",
                            "도망가지 않고 오히려 주혁의 목을 감싸 안으며 파파라치 카메라 앞에서 진짜 같은 키스신을 연출한다.",
                            "그의 품에서 차갑게 빠져나와 계약 연애의 조건을 조율하는 계약서를 당장 작성하자고 한다."
                        ]
                    }
                }
            },
            'adult-19': {
                start: {
                    chapterTitle: "붉은 실크의 덫",
                    story: "매혹적인 향취와 붉은 벨벳 커튼이 드리운 사교계 최고위층만 들어올 수 있는 비밀 누아르 클럽 '붉은 공작'. 주인공은(는) 가면 아래 짙은 시선을 숨긴 채 향기로운 술잔을 흔들고 있습니다. 그때, 묘한 분위기를 풍기며 모든 시선을 강탈하는 검은 가죽 슈트의 지배자 가브리엘이 주인공의(의) 쇄골을 찌를 듯한 관능적인 손길로 술잔을 받아옵니다. 가브리엘은 주인공의(의) 허리를 거칠게 감싸며 깊은 귓속말로 나지막이 숨결을 불어넣습니다. '오랫동안 기다렸어, 내 덫에 걸려들 아기 고양이를... 오늘 밤은 이 붉은 실크 방 뒤에서 나와 함께 가장 은밀하고 비밀스러운 거래를 하게 될 거야.' 그의 뜨거운 눈빛과 입술의 온기가 목줄기를 타고 흘러내립니다.",
                    choices: [
                        "가브리엘의 매혹적인 손길을 거부하지 않고, 그의 가슴을 밀치며 붉은 실크 방 문으로 먼저 이끈다.",
                        "그의 귓가에 손을 대어 유혹하며, 그가 숨긴 외교 기밀 문서의 행방이 적힌 열쇠를 슬쩍 낚아챈다.",
                        "와인 잔의 술을 그의 가슴팍에 과감히 쏟으며 찬물을 끼얹고 클럽 2층의 난간으로 대피한다."
                    ]
                },
                1: {
                    branch_1: {
                        chapterTitle: "위험한 쾌락",
                        story: "주인공이(가) 오히려 매혹적인 미소를 지으며 가브리엘의 넓은 가슴팍을 거칠게 밀치고 붉은 벨벳 커튼이 달린 침실 안으로 먼저 당당하게 걸어 들어갑니다. 방 안에는 은은한 촛불과 퇴폐적인 자스민 향이 서려 있습니다. 가브리엘이 문을 걸어 잠그며 겉옷을 가볍게 벗어 던지자 탄탄한 근육질의 몸과 채찍 자국 흉터들이 어둠 속에서 관능적으로 번뜩입니다. 그가 주인공의(의) 양손을 가볍게 제압하여 붉은 실크 침대 위로 눕히며 속삭입니다. '거침없어서 더 마음에 드는군. 자, 이제 이 거래의 진정한 대가를 치를 시간이야.' 그의 입술이 주인공의(의) 쇄골과 목덜미를 뜨겁게 탐하며 옷자락을 천천히 걷어 올립니다.",
                        choices: [
                            "그의 손아귀를 풀어내며 역으로 그를 침대에 눕히고 자신이 우위를 점한다.",
                            "그의 자극에 몸을 깊이 맡기며 흐트러진 호흡 속에 그가 원했던 숨겨진 진실을 요구한다.",
                            "결정적인 순간에 머리핀을 뽑아 그의 목에 겨누며 비밀 거래의 진짜 계약 조건 문서를 요구한다."
                        ]
                    }
                }
            }
        };
    }

    // Generate next conversation round in Chat Simulation Mode
    async generateNextChatNode(actionText) {
        if (this.isGenerating) return;
        this.isGenerating = true;

        this.choicesContainer.innerHTML = '';
        this.appendLoadingIndicator();
        this.playSelectionSwell();

        // Append user response to log
        if (actionText !== "대화를 시작하자.") {
            this.appendChatMessage("user", actionText);
        }

        try {
            let result = null;
            if (this.apiKey) {
                result = await this.fetchGeminiChat(actionText);
            } else {
                result = await this.fetchOfflineChatFallback(actionText);
            }

            this.removeLoadingIndicator();

            if (result) {
                // Ensure emotion has a fallback value
                result.emotion = result.emotion || 'normal';
                result.actionText = actionText;
                this.storyHistory.push(result);
                this.currentChapterIndex = this.storyHistory.length;

                this.playMagicChime();

                // Update affinity
                const change = parseInt(result.affinityChange) || 0;
                this.affinityValue = Math.min(100, Math.max(0, this.affinityValue + change));

                // Add to memories
                if (result.memoryNotes && result.memoryNotes.trim() !== "") {
                    if (!this.memoryList.includes(result.memoryNotes)) {
                        this.memoryList.push(result.memoryNotes);
                    }
                    if (this.memoryList.length > 5) this.memoryList.shift();
                }

                // Render Left Panel (which will update the profile picture automatically)
                this.renderChatLeftPanel(result);

                // Append AI reply to log with current emotion
                this.appendChatMessage("ai", result.dialogue, result.emotion);

                // Render Choices
                this.renderChoiceCards(result.choices);

                // 1차 즉각 자동 저장 수행 (임베딩 수신 전 로컬스토리지 및 서버 백업 안전 확보)
                const activePreset = this.selectPersonaPreset.value || `_temp_anonymous_${this.chatCharName}`;
                try {
                    const presets = JSON.parse(localStorage.getItem('persona_presets')) || {};
                    if (!presets[activePreset]) {
                        // 기존 사용자 정의 프리셋 덮어쓰기 방지를 위한 임시 익명 프리셋 격리 생성
                        presets[activePreset] = {
                            charName: this.chatCharName,
                            relation: this.chatRelation,
                            charDesc: this.chatCharDesc,
                            level: this.chatLevel,
                            userName: this.characterName,
                            characterImages: this.characterImages || {},
                            savedSession: {}
                        };
                    }
                    presets[activePreset].savedSession = presets[activePreset].savedSession || {};
                    presets[activePreset].savedSession.affinityValue = this.affinityValue;
                    presets[activePreset].savedSession.memoryList = [...this.memoryList];
                    presets[activePreset].savedSession.storyHistory = [...this.storyHistory];
                    presets[activePreset].savedSession.dialogueVectors = [...(this.dialogueVectors || [])];
                    presets[activePreset].savedSession.chatLevel = this.chatLevel; // 실시간 자동저장 수위 백업
                    presets[activePreset].savedSession.userName = this.characterName; // 실시간 자동저장 주인공 이름 백업
                    presets[activePreset].level = this.chatLevel; // 프리셋 레벨 동기화
                    presets[activePreset].userName = this.characterName; // 프리셋 주인공 이름 동기화

                    localStorage.setItem('persona_presets', JSON.stringify(presets));
                    this.pushPersonasToServer(); // 디바운싱 전송
                    console.log(`[Auto-save 1차] 로컬 및 서버 백업 완료 (대화 수: ${this.storyHistory.length})`);
                } catch (e) {
                    console.error("1차 실시간 자동 저장 실패:", e);
                }

                // 2단계: 백그라운드 RAG 대화 임베딩 저장 (비동기 수행)
                if (this.apiKey && actionText !== "대화를 시작하자.") {
                    const embedText = `유저: ${actionText}\n${this.chatCharName}: ${result.dialogue}`;
                    this.fetchEmbedding(embedText).then(vector => {
                        if (vector) {
                            this.dialogueVectors = this.dialogueVectors || [];
                            this.dialogueVectors.push({
                                id: Date.now(),
                                actionText: actionText,
                                dialogue: result.dialogue,
                                vector: vector
                            });

                            // 2차 자동 저장 (RAG 벡터 추가 업데이트)
                            try {
                                const presets = JSON.parse(localStorage.getItem('persona_presets')) || {};
                                if (presets[activePreset]) {
                                    presets[activePreset].savedSession = presets[activePreset].savedSession || {};
                                    presets[activePreset].savedSession.dialogueVectors = [...this.dialogueVectors];
                                    presets[activePreset].savedSession.affinityValue = this.affinityValue;
                                    presets[activePreset].savedSession.memoryList = [...this.memoryList];
                                    presets[activePreset].savedSession.storyHistory = [...this.storyHistory];
                                    presets[activePreset].savedSession.chatLevel = this.chatLevel; // 실시간 RAG 자동저장 수위 백업
                                    presets[activePreset].savedSession.userName = this.characterName; // 실시간 RAG 자동저장 주인공 이름 백업
                                    presets[activePreset].level = this.chatLevel; // 프리셋 레벨 동기화
                                    presets[activePreset].userName = this.characterName; // 프리셋 주인공 이름 동기화

                                    localStorage.setItem('persona_presets', JSON.stringify(presets));
                                    this.pushPersonasToServer(); // 디바운싱 전송
                                    console.log("[Auto-save 2차] RAG 벡터 백그라운드 동기화 완료");
                                }
                            } catch (e) {
                                console.error("2차 RAG 자동 저장 실패:", e);
                            }
                        }
                    });
                }
            } else {
                throw new Error("대화 데이터를 수신했으나 해석하지 못했습니다.");
            }
        } catch (error) {
            console.error("Chat mode failed", error);
            this.removeLoadingIndicator();

            if (this.apiKey) {
                this.appendChatMessage("system", `교감 신호에 오류가 발생했습니다. (사유: ${error.message}).`);
                alert(`가상 대화 연동 오류: ${error.message}\nAPI 키를 확인하거나 전송 버튼을 다시 눌러보세요.`);
                
                if (this.storyHistory.length > 0) {
                    this.renderChoiceCards(this.storyHistory[this.storyHistory.length - 1].choices);
                } else {
                    this.choicesContainer.innerHTML = '';
                    const retryCard = document.createElement('div');
                    retryCard.className = 'choice-card';
                    retryCard.innerHTML = `<span class="card-num">RETRY</span><p>대화 다시 시작하기</p>`;
                    retryCard.addEventListener('click', () => this.generateNextChatNode(actionText));
                    this.choicesContainer.appendChild(retryCard);
                }
            } else {
                this.appendChatMessage("system", `예언자 연결에 오류가 발생했습니다. (사유: ${error.message}). 임시 세계 선율로 대체합니다.`);
                const fallbackNode = await this.fetchOfflineChatFallback(actionText);
                fallbackNode.actionText = actionText;
                this.storyHistory.push(fallbackNode);
                this.currentChapterIndex = this.storyHistory.length;
                this.affinityValue = Math.min(100, Math.max(0, this.affinityValue + (fallbackNode.affinityChange || 0)));
                if (fallbackNode.memoryNotes) this.memoryList.push(fallbackNode.memoryNotes);
                this.renderChatLeftPanel(fallbackNode);
                this.renderChoiceCards(fallbackNode.choices);
            }
        } finally {
            this.isGenerating = false;
        }
    }

    // Render character profile in the fixed top container
    renderChatProfile(emotion = 'normal') {
        // Toggle visibility of the HUD layer based on mode
        if (this.modeType === 'chat') {
            if (this.charProfileContainer) {
                this.charProfileContainer.style.display = 'block';
            }
        } else {
            if (this.charProfileContainer) {
                this.charProfileContainer.style.display = 'none';
                this.charProfileContainer.innerHTML = '';
            }
            return;
        }

        const hasImages = this.characterImages && Object.keys(this.characterImages).length > 0;
        let imgUrl = hasImages ? (this.characterImages[emotion] || this.characterImages['normal']) : '';
        if (imgUrl && imgUrl.startsWith('/data/uploads/')) imgUrl = '.' + imgUrl;
        
        let avatarHtml = '';
        if (imgUrl) {
            avatarHtml = `<img src="${imgUrl}" class="profile-avatar-img" alt="${this.chatCharName}" />`;
        } else {
            let avatarIcon = '🔮';
            if (this.chatCharName.includes('릴리스') || this.chatCharName.includes('악마')) avatarIcon = '😈';
            else if (this.chatLevel === 'adult-19') avatarIcon = '💋';
            else avatarIcon = '👤';
            avatarHtml = `<span class="profile-avatar">${avatarIcon}</span>`;
        }

        const memoryItemsHtml = this.memoryList.map(m => `<li>${m}</li>`).join('');

        if (this.charProfileContainer) {
            let profileCard = this.charProfileContainer.querySelector('.character-profile-card');
            if (!profileCard) {
                this.charProfileContainer.innerHTML = '';
                profileCard = document.createElement('div');
                profileCard.className = 'character-profile-card';
                profileCard.innerHTML = `
                    <div class="profile-header">
                        <div class="profile-avatar-wrapper">${avatarHtml}</div>
                        <div class="profile-meta">
                            <h3 class="char-name-el">${this.chatCharName}</h3>
                            <p class="char-relation-el">${this.chatRelation}</p>
                        </div>
                    </div>
                    <div class="affection-section">
                        <div class="affection-label">
                            <span>💖 호감도</span>
                            <span class="affinity-text-el">${this.affinityValue} / 100</span>
                        </div>
                        <div class="affection-bar-bg">
                            <div class="affection-bar-fill affinity-bar-el" style="width: ${this.affinityValue}%;"></div>
                        </div>
                    </div>
                    <div class="memory-vault">
                        <button class="memory-vault-toggle" type="button">
                            <span>🧠 주요 기억 메모리</span>
                            <span class="memory-arrow">▼</span>
                        </button>
                        <div class="memory-vault-content collapsed">
                            <ul class="memory-list-el">
                                ${memoryItemsHtml || '<li>기억된 대화가 아직 없습니다.</li>'}
                            </ul>
                        </div>
                    </div>
                `;
                this.charProfileContainer.appendChild(profileCard);
            } else {
                const avatarWrapper = profileCard.querySelector('.profile-avatar-wrapper');
                const nameEl = profileCard.querySelector('.char-name-el');
                const relationEl = profileCard.querySelector('.char-relation-el');
                const affinityTextEl = profileCard.querySelector('.affinity-text-el');
                const affinityBarEl = profileCard.querySelector('.affinity-bar-el');
                const memoryListEl = profileCard.querySelector('.memory-list-el');

                if (avatarWrapper) avatarWrapper.innerHTML = avatarHtml;
                if (nameEl) nameEl.textContent = this.chatCharName;
                if (relationEl) relationEl.textContent = this.chatRelation;
                if (affinityTextEl) affinityTextEl.textContent = `${this.affinityValue} / 100`;
                if (affinityBarEl) {
                    affinityBarEl.style.width = `${this.affinityValue}%`;
                }
                if (memoryListEl) {
                    memoryListEl.innerHTML = memoryItemsHtml || '<li>기억된 대화가 아직 없습니다.</li>';
                }
            }
        }
    }

    // Render left panel info box for character chat
    renderChatLeftPanel(latestResult) {
        // If generating in real-time, just update top status info to prevent flickering
        if (this.isGenerating && latestResult) {
            this.renderChatProfile(latestResult.emotion || 'normal');
            return;
        }

        // Clear and rebuild dialogue feed on restore / preset loading / undo
        this.storyScrollArea.innerHTML = '';
        this.renderChatProfile(latestResult ? (latestResult.emotion || 'normal') : 'normal');

        this.storyHistory.forEach((item, index) => {
            const num = index + 1;
            if (item.actionText && item.actionText !== "대화를 시작하자.") {
                this.appendChatMessage("user", item.actionText);
            }
            this.appendChatMessage("ai", item.dialogue, item.emotion || 'normal');
        });

        // Auto-scroll
        setTimeout(() => {
            this.storyScrollArea.scrollTop = this.storyScrollArea.scrollHeight;
        }, 200);
    }

    // Call Gemini API for Character Chat Simulation
    async fetchGeminiChat(actionText) {
        const historyText = this.storyHistory.map((c, i) => `유저: ${c.actionText}\n${this.chatCharName}: ${c.dialogue}`).join('\n\n');
        
        // 3단계: 실시간 질문 임베딩 생성 및 코사인 유사도 분석을 통한 과거 연관 기억 소환 (RAG)
        let matchedMemoriesHtml = '';
        if (this.apiKey && this.dialogueVectors && this.dialogueVectors.length > 0 && actionText !== "대화를 시작하자.") {
            try {
                const queryVector = await this.fetchEmbedding(actionText);
                if (queryVector) {
                    const scored = this.dialogueVectors.map(item => {
                        const score = this.cosineSimilarity(queryVector, item.vector);
                        return { ...item, score };
                    });

                    // 유사도 0.62 이상을 매칭 대상으로 삼고 점수가 높은 것부터 3개 추출
                    const matches = scored
                        .filter(item => item.score >= 0.62)
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 3);

                    if (matches.length > 0) {
                        matchedMemoriesHtml = `\n\n[주목: 당신이 기억해낸 주인공과의 옛 추억 조각들]\n` +
                            `아래는 이번 대화 주제와 관련하여 당신의 머릿속에 연관되어 떠오른 과거의 실제 나눴던 대화 기록입니다.\n` +
                            `대화 흐름 상 적절하다면 아래의 과거 사건 및 약속 등을 은근히 아는 척하거나 회상하며 대답에 연관 지어 답변해 주세요:\n` +
                            matches.map((m, idx) => `${idx + 1}. (주인공: "${m.actionText}" / 당신: "${m.dialogue}")`).join('\n') +
                            `\n*참고: 과거의 실제 나눴던 사실이므로 대화의 개연성에 맞게 녹여내야 합니다.`;
                    }
                }
            } catch (e) {
                console.warn("[RAG Semantic Search Failed]: falling back to default dialogue context.", e);
            }
        }

        const adultPromptRules = this.chatLevel === 'adult-19' ? 
`이 시뮬레이션은 성인 19금 연령 제한 등급을 가진 농밀하고 은밀한 관능적/로맨틱 롤플레이 세션입니다.
상대방을 자극하거나 유혹하는 노골적인 묘사, 매혹적인 행동, 신체적인 터치나 밀착 묘사, 부드럽거나 치명적인 도발, 심장박동을 뛰게 하는 야릇하고 에로틱한 호흡 등을 매우 매력적이고 노골적으로 서술하여 관능적인 성인용 19금 톤앤매너를 유지해 주세요. 검열을 최소화하고 매끄러운 19금 대사를 지어내야 합니다.` 
: `이 세션은 일반 전체 이용가 등급의 대화 및 롤플레이 세션입니다. 폭력적이거나 선정적인 묘사는 배제하고, 일상적이며 소프트하고 다정한 분위기를 유지해 주세요.`;

        const systemInstruction = `당신은 세계 최고의 대화형 시뮬레이션 AI이자 서사적 롤플레이 게임 마스터입니다.
유저와 대화하며, 가상의 인물 [${this.chatCharName}]을 실감 나게 열연(Roleplay)하고 있습니다.

인물 세팅:
- 이름: ${this.chatCharName}
- 유저(주인공)와의 관계: ${this.chatRelation}
- 성격 및 외모 특징: ${this.chatCharDesc}${matchedMemoriesHtml}

규칙:
1. 인물 [${this.chatCharName}]의 말투와 대사, 행동, 눈빛, 숨소리 등을 지문(*행동 지문*)과 대사를 혼합하여 아주 몰입감 있고 매혹적인 롤플레이 스타일로 답변해 주세요. (공백 제외 한글 250~450자 내외)
2. 가독성을 위해 답변 내에 줄바꿈(개행)을 적극적으로 사용해 주세요. 특히 표(Table)를 그릴 때는 각 행마다 반드시 줄바꿈을 삽입하여 올바른 마크다운 표 규격을 엄격히 지켜야 합니다.
3. ${adultPromptRules}
4. 유저의 입력([${actionText}])과 대화 기록을 바탕으로 유저에게 품은 호감도 변화 수치(affinityChange)를 -10에서 +10 사이의 정수로 연산하여 알려주세요. 유저가 무례하거나 냉대하면 마이너스, 다정하거나 자극적인 유혹에 넘어가면 플러스를 줍니다.
5. 이번 턴의 대화 결과를 인물이 머릿속에 기억할 내용(memoryNotes)을 한 문장으로 간결하게 작성해 주세요 (예: "주인공이 나의 어깨를 감싸 안아서 당황했지만 기뻤음").
6. 인물의 대사가 끝났을 때 유저가 대답할 수 있는 매력적이고 자연스러운 대화 대답 선택지 3가지를 배열로 구성해 주세요.
7. 이번 대사에서 드러나는 인물의 주된 감정을 normal (평온), happy (기쁨), sad (슬픔), angry (화남), blush (부끄러움) 중 하나로 정확히 판별하여 emotion 필드에 지정해 주세요.
8. 반드시 아래 명시된 JSON Schema 구조를 완전하게 만족하여 JSON 문자열로만 응답해 주세요. 마크다운 기호(\`\`\`json)는 절대 포함하지 마세요.

JSON Schema:
{
  "dialogue": "인물의 반응 대사와 행동 지문 묘사 string",
  "emotion": "인물의 현재 감정 상태 (normal | happy | sad | angry | blush) string",
  "affinityChange": "이번 턴의 호감도 변화량 (-10~10 사이의 정수) number",
  "memoryNotes": "인물이 기억 보관소에 기록할 기억 메모리 string",
  "choices": [
    "유저의 예상 대답 1 string",
    "유저의 예상 대답 2 string",
    "유저의 예상 대답 3 string"
  ]
}`;

        const prompt = `[이전 대화 기록]\n${historyText || "아직 없음"}\n\n[유저의 최신 대화 및 행동]\n${actionText}\n\n위 입력에 이어서 [${this.chatCharName}]의 롤플레이 반응을 완전한 JSON 형태로 출력하세요.`;
        const chatSchema = {
            type: "OBJECT",
            properties: {
                dialogue: { type: "STRING" },
                emotion: { 
                    type: "STRING", 
                    enum: ["normal", "happy", "sad", "angry", "blush"] 
                },
                affinityChange: { type: "INTEGER" },
                memoryNotes: { type: "STRING" },
                choices: {
                    type: "ARRAY",
                    items: { type: "STRING" }
                }
            },
            required: ["dialogue", "emotion", "affinityChange", "memoryNotes", "choices"]
        };

        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: this.apiKey,
                prompt: prompt,
                systemInstruction: systemInstruction,
                model: this.model,
                responseSchema: chatSchema
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({ error: '알 수 없는 서버 오류가 발생했습니다.' }));
            throw new Error(errData.error || `서버 에러 (HTTP ${response.status})`);
        }

        return await response.json();
    }

    // Offline Fallback dating simulator for Lilith (devil)
    fetchOfflineChatFallback(actionText) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const depth = this.storyHistory.length;
                let node = null;
                
                // 1. 릴리스 트리 (19금 또는 릴리스 이름 매칭)
                const lilithChatTree = {
                    start: {
                        dialogue: `*검붉은 안개 속에서 고고하게 허공을 밟고 내려온 릴리스가 그녀의 가죽 날개를 접으며 입을 엽니다.* "어머, 또 어리석은 거래를 하러 온 인간이네? 내 손을 잡고 영혼을 넘기면 네 소원은 다 이루어질 텐데... 후후, 어디 말해봐. 오늘 밤 나에게 무슨 쾌락을 안겨주고 어떤 계약을 맺고 싶은 거야?"`,
                        affinityChange: 0,
                        memoryNotes: "주인공과 위험한 거래의 방에서 처음 만남.",
                        choices: [
                            "릴리스의 가느다란 턱을 조심스럽게 쓸어 올리며 매혹적으로 미소 짓는다.",
                            "영혼을 함부로 팔지 않겠다고 냉정하게 선을 긋는다.",
                            "계약 조건을 꼼꼼히 적은 양피지 계약서를 테이블에 내민다."
                        ]
                    },
                    1: {
                        branch_1: {
                            dialogue: `*릴리스의 턱 밑을 부드러운 손길로 쓸어 올리자, 그녀의 붉은 눈동자가 이채를 띠며 팽창합니다. 날카로운 송곳니가 비칠 듯 도발적인 미소를 입가에 매단 채 당신의 목줄기를 감싸 쥡니다.* "어머... 꽤나 대담한 인간이잖아? 뺨에 닿는 손이 꽤 뜨거워. 내 심장 소리가 들려? 계약도 맺기 전에 나를 이렇게 흥분시키면 곤란한데... 다음엔 내 입술이라도 훔칠 생각이야?"`,
                            affinityChange: 8,
                            memoryNotes: "주인공이 턱을 어루만져 뺨이 붉어짐.",
                            choices: [
                                "그녀의 허리를 과감히 끌어당겨 가슴이 밀착되도록 가깝게 감싸 안는다.",
                                "한 걸음 물러나며, 거래의 대가가 무엇인지 똑바로 설명해 달라고 다그친다.",
                                "릴리스의 입술을 흘끗 쳐다보고 가볍게 뺨에 키스한다."
                            ]
                        },
                        branch_2: {
                            dialogue: `*당신의 냉담한 대답에 릴리스는 날개를 펄럭이며 싸늘한 바람을 일으킵니다. 눈동자에 붉은 스파크가 튀며 콧방귀를 뀝니다.* "흥, 겁쟁이 인간이로군. 영혼이 없으면 죽음과 다름없을 뿐이야. 하지만 그 꼿꼿하고 맑은 자존심은 꽤나 나를 자극하네... 억지로 굴복시켰을 때의 쾌감이 더 짜릿하겠지? 어디 버텨봐. 내가 어떤 유혹을 준비했는지 알면 곧 굴복하게 될걸?"`,
                            affinityChange: -3,
                            memoryNotes: "주인공의 냉담한 태도에 정복욕이 샘솟음.",
                            choices: [
                                "네가 아무리 날 유혹해봤자 내 심장은 흔들리지 않을 거라고 비웃는다.",
                                "사실은 나도 널 유혹하고 싶지만 참는 중이라고 슬며시 고백한다.",
                                "거래를 중단하고 침실 밖으로 걸어 나가려고 시도한다."
                            ]
                        },
                        branch_3: {
                            dialogue: `*테이블에 내밀어진 양피지 문서를 본 릴리스가 어이없다는 듯 가늘게 눈을 좁힙니다. 하지만 붉은 손톱으로 계약서 테두리를 매만지며 미소를 띱니다.* "어머, 계약 조항이 꽤나 치밀하네? 하지만 악마와의 거래에서 계약서 따위는 단순한 장식일 뿐이야. 중요한 건 우리의 '육체와 영혼의 깊은 밀착'이지. 첫 번째 조항을 읽어보겠어? '매일 밤 악마에게 심장 소리와 숨결을 밀착시켜 공양할 것'... 후후, 이 조항도 이행할 자신 있어?"`,
                            affinityChange: 2,
                            memoryNotes: "주인공이 내민 꼼꼼한 계약서 조항을 보며 즐거워함.",
                            choices: [
                                "계약서를 뺏어 찢어 버리고, 직접 그녀의 입술을 덮쳐 강제 계약을 맺는다.",
                                "이행할 자신이 있으니 계약서 맨 밑에 지장을 찍으라고 손가락을 건넨다.",
                                "그런 수치스러운 조항은 삭제해 달라고 얼굴을 붉히며 요구한다."
                            ]
                        }
                    },
                    2: {
                        branch_1: {
                            dialogue: `*당신이 그녀의 허리를 낚아채 품으로 당기자, 릴리스는 순간 당황한 듯 작게 숨을 들이마십니다. 하지만 이내 칠흑 같은 날개로 두 사람을 감싸 둥글게 밀실을 만들며, 당신의 귓가에 뜨거운 숨을 불어넣습니다.* "하아... 적극적이네. 내 가슴이 네 심장박동을 그대로 느끼고 있어. 악마의 심장을 이렇게 뛰게 만들다니... 넌 계약자가 아니라 내 주인이 되고 싶은 거니? 오늘 밤, 이 검은 장막 안에서 네 모든 걸 삼켜버리고 싶어..."`,
                            affinityChange: 10,
                            memoryNotes: "날개로 둘만의 장막을 만들고 가슴이 밀착되어 숨결을 나눔.",
                            choices: [
                                "검은 장막 속에서 릴리스의 목덜미를 깊게 파고들며 정열적인 입맞춤을 건넨다.",
                                "천천히 손을 아래로 내려 그녀의 잘록한 골반 라인을 움켜쥐며 미소 짓는다.",
                                "더 이상 버티지 못하고, 악마여, 제발 나를 너의 노예로 삼아달라고 속삭인다."
                            ]
                        },
                        branch_2: {
                            dialogue: `*물러나 캐묻는 당신의 모습에 릴리스가 흥미롭다는 듯 꼬리를 흔들며 다가옵니다. 은밀한 장미 향이 당신의 코끝을 간지럽힙니다.* "어머, 그렇게 급할 거 없어. 대가는 아주 간단해. 네가 매일 밤 나를 생각할 때 느껴지는 그 뜨거운 흥분과 갈망... 그거면 충분해. 돈도, 고통도 필요 없어. 내일 밤에도 이곳에 돌아와 내 발 아래 무릎을 꿇고 내 뺨을 어루만져 주겠다고 약속만 한다면 말이야."`,
                            affinityChange: 4,
                            memoryNotes: "주인공에게 대가로 지속적인 만남과 갈망을 요구함.",
                            choices: [
                                "약속하겠다며 그녀의 손가락 끝을 입술로 지긋이 깨문다.",
                                "더러운 악마의 노리개가 되지 않겠다며 고개를 돌린다.",
                                "돈과 영혼 대신 다른 신체적 대가를 매일 밤 주겠다고 조율한다."
                            ]
                        },
                        branch_3: {
                            dialogue: `*뺨에 키스를 받자 릴리스의 얼굴이 붉게 달아오릅니다. 그녀의 꼬리가 부르르 떨리며 얼굴을 돌리려 하지만, 이내 당신의 귓가에 관능적인 미소를 띱니다.* "귀여운 인간... 뺨으로는 부족해. 입술이 이렇게 가까이 있는데 왜 참는 거지? 악마는 미적지근한 장난을 제일 싫어해. 온몸이 타오르는 듯한 자극을 원한다면, 더 세게 내 입술을 훔쳐봐..."`,
                            affinityChange: 8,
                            memoryNotes: "뺨 키스에 부끄러워하며 더 노골적인 유혹을 해옴.",
                            choices: [
                                "말을 듣자마자 릴리스의 목덜미를 감싸고 강하게 입맞춤을 덮친다.",
                                "릴리스를 가볍게 밀쳐내고, 부끄러워하는 악마가 더 귀엽다며 장난친다.",
                                "스스로 다가올 때까지는 입술을 주지 않겠다며 도발한다."
                            ]
                        }
                    }
                };

                // 2. 서아 트리 (대학 후배)
                const seoaChatTree = {
                    start: {
                        dialogue: `*양손으로 전공 서적을 꼭 껴안은 서아가 가벼운 발걸음으로 다가옵니다. 그녀의 맑고 큰 눈망울이 당신을 향해 반짝이며 애교 섞인 하이톤으로 인사합니다.* "선배! 드디어 오셨네요! 오늘도 도서관에 안 나오시는 줄 알고 제가 얼마나 조마조마했다고요. 헤헤, 오늘 같이 과제도 도와주시고 맛있는 것도 사주실 거죠?"`,
                        affinityChange: 0,
                        memoryNotes: "주인공과 대학 후배 서아가 도서관에서 반갑게 마주함.",
                        choices: [
                            "서아의 머리를 장난스럽게 쓰다듬으며 미소 짓는다.",
                            "공부하러 온 거라며 선배로서 엄격하게 선을 긋는다.",
                            "도서관 구석의 조용한 자리를 가리키며 어서 공부나 시작하자고 재촉한다."
                        ]
                    },
                    1: {
                        branch_1: {
                            dialogue: `*갑자기 머리를 부드럽게 쓰다듬자, 서아는 양손으로 책을 더 세게 껴안으며 고개를 푹 숙입니다. 상기된 양 볼이 붉게 물든 채 힐끗 당신을 올려다봅니다.* "치이... 맨날 저를 어린애처럼 대하시면서... 근데 손길이 은근히 따뜻해서 싫지만은 않네요. 그럼 오늘 저녁 메뉴는 선배가 사주시는 파스타 맛집 맞죠? 무조건 가야 해요!"`,
                            affinityChange: 7,
                            memoryNotes: "주인공이 머리를 쓰다듬자 볼을 붉히며 기뻐함.",
                            choices: [
                                "서아의 어깨를 슬쩍 감싸 당기며 장난스럽게 가깝게 밀착한다.",
                                "어린애가 맞다며 볼을 가볍게 꼬집는다.",
                                "알겠다며 서아가 좋아하는 맛집으로 가자고 시원하게 수락한다."
                            ]
                        },
                        branch_2: {
                            dialogue: `*선배로서 엄격히 대하자 서아가 아랫입술을 삐죽 내밀며 뾰로통하게 쳐다봅니다.* "선배는 진짜 차갑다니까요... 제가 공부에 방해만 되는 존재인가요? 흥, 그래도 저 쉽게 포기 안 해요! 선배가 마지못해 제 어리광을 다 받아주실 때까지 찰떡처럼 계속 붙어 다닐 테니까 각오하세요!"`,
                            affinityChange: -2,
                            memoryNotes: "주인공의 냉정한 태도에 토라졌으나 승부욕을 불태움.",
                            choices: [
                                "네가 아무리 장난쳐도 내 학구열은 방해할 수 없다고 비웃는다.",
                                "사실은 너랑 단둘이 공부해서 좋은데 부끄러워서 그렇다고 털어놓는다.",
                                "대답 없이 공부할 페이지를 책상 위에 크게 펼친다."
                            ]
                        },
                        branch_3: {
                            dialogue: `*도서관 구석 자리를 잡자 서아가 쪼르르 따라와 가방을 내려놓으며 키득키득 웃습니다.* "선배, 조용하고 아무도 없는 구석 자리를 고르시다니... 은근히 영악하신데요? 헤헤, 농담이에요! 자, 전공책 펼쳤으니까 모르는 건 선배가 책임지고 전부 1대1로 밀착 지도해 주셔야 해요?"`,
                            affinityChange: 3,
                            memoryNotes: "조용한 구석 자리에서 단둘이 공부를 시작함.",
                            choices: [
                                "서아의 전공책을 뺏어 덮으며, 대담하게 얼굴을 가까이 가져다 댄다.",
                                "열심히 가르쳐줄 테니 딴짓하지 말라며 손가락을 걸어 약속한다.",
                                "진지한 표정으로 조용히 책을 짚으며 강의를 시작한다."
                            ]
                        }
                    },
                    2: {
                        branch_1: {
                            dialogue: `*서아의 어깨를 감싸 밀착하자, 항상 장난스럽던 그녀의 몸이 일순간 굳어지며 눈을 동그랗게 뜹니다. 서로의 숨결이 닿을 만큼의 가까운 거리에서 서아의 심장이 엄청나게 쿵쾅거리는 소리가 옷깃 너머로 들려옵니다.* "선배... 갑자기 이렇게 가까이 오시면... 저 심장 터질 것 같단 말이에요. 선배 손길이 닿은 어깨가 너무 뜨거워요. 이제 장난 아니라고 생각해도 되는 거죠...?"`,
                            affinityChange: 9,
                            memoryNotes: "어깨를 밀착하자 서아가 심장 터질 듯 부끄러워하며 진심을 물어옴.",
                            choices: [
                                "대답 대신 수줍어하는 그녀의 이마에 살포시 입술을 맞춘다.",
                                "귓가에 대고 나도 널 단순한 후배로 생각하지 않는다고 고백한다.",
                                "일부러 얼굴을 붉힌 서아가 더 귀엽다며 장난스레 밀쳐내고 웃는다."
                            ]
                        },
                        branch_2: {
                            dialogue: `*볼을 꼬집자 서아가 꼬집힌 뺨을 감싸 쥐고 눈물을 찔끔 흘리는 시늉을 합니다. 하지만 곧 당신을 향해 살포시 미소 지으며 애교 넘치는 목소리로 쫑알댑니다.* "아얏! 선배 힘이 너무 세요! 제 예쁜 볼이 빨갛게 부어오르면 선배가 책임지실 건가요? 뭐, 밤마다 제 볼을 쓰다듬어 주신다면 용서해 드릴 용의는 있어요. 헤헤..."`,
                            affinityChange: 5,
                            memoryNotes: "볼을 꼬집어 붉어졌으나 지속적으로 스킨십해주기를 바람.",
                            choices: [
                                "약속하겠다며 그녀의 볼을 다시 부드럽게 쓰다듬어 준다.",
                                "더 이상 받아주지 않겠다며 차갑게 공부나 하자고 다그친다.",
                                "밤마다 만나는 건 더 진한 사이가 되어야만 가능하다고 주의를 준다."
                            ]
                        },
                        branch_3: {
                            dialogue: `*시원하게 파스타 약속을 수락하자 서아가 양손으로 박수를 치며 기뻐 날뜁니다.* "와! 선배 만세! 역시 선배는 겉으로만 퉁명스럽지 속은 아주 태평양처럼 넓다니까요? 그럼 퀴즈나 과제 1개 풀 때마다 한 조각씩 얻어먹는 거예요? 대신 공부 끝날 때까지 딴청 안 피우고 집중할게요!"`,
                            affinityChange: 6,
                            memoryNotes: "파스타 식사 약속을 맺고 기뻐하며 공부 열의를 다짐.",
                            choices: [
                                "공부에 집중하는 그녀의 옆모습을 물끄러미 바라본다.",
                                "집중 안 하면 밥값을 네가 내야 한다며 가볍게 도발한다.",
                                "공부가 끝난 뒤 그녀와 나란히 어깨를 스치며 식당으로 걸어간다."
                            ]
                        }
                    }
                };

                // 3. 혜린 트리 (츤데레 소꿉친구)
                const hyerinChatTree = {
                    start: {
                        dialogue: `*팔짱을 낀 채 다리를 톡톡 두드리며 당신을 기다리던 혜린이가 당신의 얼굴을 보자마자 새침하게 고개를 홱 돌립니다. 뺨을 약간 붉힌 채 퉁명스럽게 쏘아붙입니다.* "어머, 이제야 오시는 거야? 사람을 30분이나 기다리게 만들어 놓고 얼굴이 참 뻔뻔하네! 뭐, 네가 늦는 거야 늘 있던 일이니까 특별히 봐주겠지만... 오늘 나 기분 안 좋으니까 나를 어떻게 달래줄지 똑똑히 보여줘 봐."`,
                        affinityChange: 0,
                        memoryNotes: "소꿉친구 혜린이가 약속 장소에서 퉁명스럽게 기다림.",
                        choices: [
                            "혜린의 손을 와락 맞잡으며 늦어서 미안하다고 다정한 눈빛으로 사과한다.",
                            "늦은 건 미안하지만 그렇게 쌀쌀맞게 굴 필요는 없지 않냐고 따진다.",
                            "사과의 의미로 혜린이 가장 가고 싶어 했던 달콤한 디저트 카페로 이끈다."
                        ]
                    },
                    1: {
                        branch_1: {
                            dialogue: `*손을 덜컥 맞잡자 혜린이의 어깨가 움찔하고 튀어 오릅니다. 뺨이 순식간에 불꽃처럼 빨갛게 변하더니 맞잡은 손을 억지로 빼내려 흔들지만 힘을 강하게 주지는 않습니다.* "바, 바보야! 갑자기 손은 왜 잡는 거야?! 사람들 다 보잖아... 늦은 건 미안한데... 손잡았다고 기분이 다 풀린 거 아니니까 착각하지 마! 다음엔 더 성의 있게 사과해..."`,
                            affinityChange: 6,
                            memoryNotes: "주인공이 손을 잡자 볼을 붉히며 당황하였으나 내심 좋아함.",
                            choices: [
                                "손을 더 꽉 쥐며 놓지 않겠다고 장난스럽게 웃는다.",
                                "손이 차갑다며 주머니에 함께 집어넣는다.",
                                "진지한 눈빛으로 '보고 싶어서 그랬다'고 나직하게 고백한다."
                            ]
                        },
                        branch_2: {
                            dialogue: `*당신이 반박하자 혜린이의 붉은 입술이 살짝 삐져나옵니다. 발끈하여 날카롭게 눈을 홉뜹니다.* "하! 내가 쌀쌀맞다고? 바보! 진짜 아무것도 모르는 둔탱이잖아. 내가 누구 때문에 약속시간 1시간 전부터 화장 고치고 옷 고르느라 진땀 흘렸는지 전혀 모르는 거지? 흥, 바보랑은 더 대화하고 싶지도 않아!"`,
                            affinityChange: -3,
                            memoryNotes: "주인공이 자신의 숨겨진 노력을 몰라주자 크게 서운해함.",
                            choices: [
                                "오늘 입은 옷이랑 화장이 정말 예쁘다고 뒤늦게 칭찬한다.",
                                "내가 늦은 건 정말 잘못했다며 어깨를 가볍게 토닥여 달랜다.",
                                "그렇게 화만 낼 거면 그냥 집에 가겠다고 냉정하게 응수한다."
                            ]
                        },
                        branch_3: {
                            dialogue: `*달콤한 디저트 카페로 이끌자, 혜린이의 굳어 있던 뺨이 아주 미세하게 풀립니다. 하지만 여전히 팔짱을 낀 채 도도하게 카페 안으로 걸어 들어갑니다.* "치이... 디저트로 대충 때우려 하다니 얄팍하네. 하지만 내가 먹고 싶었던 초코 수플레랑 딸기 밀크티는 꼭 네 돈으로 사야 해. 그리고 먹는 내내 내 잔소리 다 들을 준비나 해두라고!"`,
                            affinityChange: 4,
                            memoryNotes: "디저트 카페로 이동하며 잔소리를 늘어놓지만 기분이 풀림.",
                            choices: [
                                "카페 구석 자리에서 턱을 괴고 혜린이 주문하는 모습을 흐뭇하게 바라본다.",
                                "잔소리는 초코 수플레로 입막음하면 되는 거냐고 장난친다.",
                                "주문한 음료가 나왔을 때 빨대를 입에 물려주며 장난친다."
                            ]
                        }
                    },
                    2: {
                        branch_1: {
                            dialogue: `*혜린이의 손을 잡은 채 외투 주머니 속에 함께 밀착해 넣자, 그녀는 완전히 굳어 움직이지 못합니다. 주머니 속에서 당신의 거칠고 큰 손이 자신의 작은 손을 감싸고 손가락을 깍지 끼는 것이 고스란히 느껴지자, 혜린이는 뺨을 손등으로 가리며 웅얼거립니다.* "너, 너 진짜 미쳤어...? 주머니 안에서 손가락을 깍지 끼다니... 손바닥이 너무 뜨겁고 어깨가 스쳐서 더워 죽겠단 말이야... 절대로 놓지 말아줘..."`,
                            affinityChange: 9,
                            memoryNotes: "주머니 속에서 손가락 깍지를 끼며 엄청난 긴장감과 애정을 나눔.",
                            choices: [
                                "귓가에 속삭이듯 '절대 놓지 않겠다'고 다정하게 속삭인다.",
                                "주머니 속에서 장난스럽게 손을 꼼지락거리며 혜린의 반응을 즐긴다.",
                                "주변 사람들을 보며, 이제 연인처럼 보일 것 같다고 말한다."
                            ]
                        },
                        branch_2: {
                            dialogue: `*화장과 옷이 정말 예쁘다고 칭찬하자, 혜린이의 눈동자가 흔들리며 팔짱이 서서히 풀립니다. 귀밑까지 붉어진 채 헛기침을 하며 딴청을 부립니다.* "주, 죽을래? 이제 와서 그런 뻔한 아부를 떨다니... 하지만 그렇게 말해주니까... 아주 쪼금은 화가 풀렸어. 그럼 내 옷 태가 망가지지 않게 조심히 네 가방이라도 들려줄게. 고맙다고 해!"`,
                            affinityChange: 7,
                            memoryNotes: "의상 칭찬을 듣고 크게 부끄러워하며 화가 대부분 풀림.",
                            choices: [
                                "가방을 대신 메고, 혜린의 손을 조심스럽게 감싸 안는다.",
                                "소꿉친구치고 너무 귀엽다고 계속 놀려본다.",
                                "이제 기분 풀렸으니 얼른 밥 먹으러 가자고 잡아끈다."
                            ]
                        },
                        branch_3: {
                            dialogue: `*혜린이의 입에 초코 수플레 한 입을 직접 쏙 밀어 넣어주자, 볼을 빵빵하게 부풀린 채 오물거립니다. 입가에 묻은 초콜릿 크림을 훔쳐내지 못한 채 그녀가 눈을 세모나게 뜹니다.* "음... 달콤해... 아니, 기습적으로 뭘 먹이는 거야! 바보 같으니... 입가에 크림 다 묻었잖아! 책임지고 직접 닦아주든지 해!"`,
                            affinityChange: 5,
                            memoryNotes: "직접 디저트를 먹여주고 크림이 입가에 묻어 부끄러워함.",
                            choices: [
                                "부드럽게 손끝으로 그녀의 아랫입술 크림을 닦아주고 손가락을 빤다.",
                                "휴지를 건네며 직접 칠칠치 못하게 흘렸다며 놀려준다.",
                                "입가에 묻은 크림이 꼭 아기 고양이 같다며 뺨에 가볍게 키스한다."
                            ]
                        }
                    }
                };

                // 4. 범용 커스텀 트리 (이름, 특징, 관계 동적 치환)
                const genericChatTree = {
                    start: {
                        dialogue: `*눈빛에 {desc} 특징이 서려 있는 {name}(이)가 천천히 당신 앞으로 걸어옵니다. 당신과는 {relation} 관계인 그녀는 잠시 어색한 듯 눈길을 비껴 두었다가, 이내 따뜻한 눈빛으로 당신을 똑바로 바라보며 먼저 첫 인사를 건넵니다.* "{user}, 드디어 찾아왔네... 오늘 무슨 이야기를 나누러 온 거야? 평소 하지 못했던 진솔한 이야기를 나눌 수 있다면 기쁘겠어."`,
                        affinityChange: 0,
                        memoryNotes: "주인공과 {name}의 첫 교감 및 대화가 조용히 시작됨.",
                        choices: [
                            `{name}의 손을 따뜻하게 감싸 쥐며 다정한 인사를 건넨다.`,
                            `아직은 서먹서먹하다는 듯 가볍게 목례만 나누며 거리를 둔다.`,
                            `마주 앉을 수 있는 의자를 정성스레 끌어주며 편하게 이야기하자고 권유한다.`
                        ]
                    },
                    1: {
                        branch_1: {
                            dialogue: `*당신이 그녀의 고운 손을 쥐어주자, {name}의 뺨이 붉게 상기되더니 미세한 떨림이 당신의 손바닥으로 고스란히 전해집니다. {desc} 모습 속에 숨어 있던 수줍음이 그녀의 나직한 음성으로 조심스레 새어 나옵니다.* "어머... {user}, 갑자기 손을 잡아줄 줄은 몰랐는데... 하지만 싫지 않아. 아니, 뺨이 더워질 정도로 기분 좋고 뜨거워. 이 손... 대화가 끝날 때까지는 놓지 않아 주면 안 돼...?"`,
                            affinityChange: 7,
                            memoryNotes: "주인공이 손을 따뜻하게 잡아주자 볼을 붉히며 기뻐함.",
                            choices: [
                                "손을 더 꽉 쥐며 어깨를 끌어당겨 가슴이 밀착되도록 안아준다.",
                                "부끄러워하는 모습이 너무 매력적이라며 슬며시 칭찬한다.",
                                "손바닥에 닿는 그녀의 숨결이 부드럽다며 부드럽게 쓰다듬는다."
                            ]
                        },
                        branch_2: {
                            dialogue: `*당신이 거리를 두고 눈인사만 건네자, {name}의 눈동자에 약간의 아쉬움และ 쓸쓸함이 스쳐 지나갑니다. {desc} 특징에 어울리는 차분한 목소리로 한숨을 짧게 내쉽니다.* "{user}... 여전히 나와의 사이에 벽을 두는구나. 하지만 우린 {relation} 사이잖아. 나한테 조금 더 편하게 다가와 줘도 괜찮은데... 아직 내가 서먹한 거야?"`,
                            affinityChange: -2,
                            memoryNotes: "주인공의 다소 어색하고 차가운 거리에 아쉬움을 표현함.",
                            choices: [
                                "사실은 나도 다가가고 싶지만 너무 두근거려서 서툰 것뿐이라고 고백한다.",
                                "천천히 서로를 더 알아가자며 그녀의 눈동자를 똑바로 쳐다본다.",
                                "이게 나와의 적당한 안전거리라며 선을 긋는다."
                            ]
                        },
                        branch_3: {
                            dialogue: `*의자를 정중하게 끌어주자, {name}가 고마워하며 조심스럽게 자리에 걸터앉습니다. {desc} 매력을 뽐내며 턱을 괴고 당신을 빤히 바라봅니다.* "고마워, {user}... 참 신사적이네. 마주 앉아서 네 얼굴을 똑바로 보니까... 왠지 마음이 더 차분해지는 것 같아. 자, 그럼 무슨 이야기부터 털어놓을 생각이야? 네 눈빛 속에 담긴 이야기를 들려줘."`,
                            affinityChange: 4,
                            memoryNotes: "의자를 끌어주어 서로 편안하게 마주 앉아 대화를 나눔.",
                            choices: [
                                "테이블 아래로 몰래 그녀의 손가락을 찾아내어 깍지를 낀다.",
                                "너에 대한 생각으로 가득 찬 내 마음을 다정하게 들려준다.",
                                "일상적인 소소한 이야기를 풀어놓으며 분위기를 편안하게 이끈다."
                            ]
                        }
                    },
                    2: {
                        branch_1: {
                            dialogue: `*당신이 품으로 와락 당겨 밀착하자, {name}는 순간 흐릿한 신음을 내쉬며 당신의 옷깃을 두 손으로 세게 움켜쥡니다. 서로의 숨결이 고스란히 얽히고, {desc} 눈동자에 오롯이 당신의 얼굴만이 담겨 파르르 떨립니다.* "하아... {user}... 갑자기 안아버리는 건 반칙이야. 심장 터지는 소리가 너한테 다 들릴 텐데... 부끄럽지만 피하고 싶지 않아. 내 손을 잡은 네 숨결이 너무 뜨거워..."`,
                            affinityChange: 10,
                            memoryNotes: "가까이 감싸 안아 숨결이 밀착되고 심장 소리를 나누며 매우 설레함.",
                            choices: [
                                "가까워진 틈을 타 그녀의 목덜미를 파고들며 뜨거운 입맞춤을 건넨다.",
                                "귓가에 대고 '너와 함께 있는 순간이 제일 행복하다'고 속삭인다.",
                                "서로의 따뜻한 온기가 스며들 때까지 한참 동안 조용히 안고 있는다."
                            ]
                        },
                        branch_2: {
                            dialogue: `*부끄러워하는 모습을 예쁘다고 칭찬하자, {name}가 고개를 살짝 돌려 붉어진 볼을 감추려 합니다. 하지만 입꼬리를 실룩이며 기쁨을 주체하지 못합니다.* "바보... 그런 낯간지러운 칭찬을 그렇게 아무렇지 않게 하다니... 하지만 네가 예쁘다고 해주니까... 조금 용기가 생겨. 다음에도 꼭 그렇게 칭찬해 주기야?"`,
                            affinityChange: 8,
                            memoryNotes: "수줍음 칭찬을 듣고 매우 고마워하며 애정을 표현함.",
                            choices: [
                                "앞으로도 매일 칭찬해주겠다며 손끝으로 뺨을 어루만져 준다.",
                                "부끄러워하는 모습이 너무 귀여워서 일부러 더 놀려본다.",
                                "약속하겠다며 엄지손가락을 가볍게 내밀어 건넨다."
                            ]
                        },
                        branch_3: {
                            dialogue: `*주머니 속에서 손가락 깍지를 끼자, {name}의 손바닥이 일순 차갑게 식었다가 이내 뜨겁게 열을 띱니다. 깍지 낀 손을 절대 풀지 않겠다는 듯 그녀도 손아귀에 힘을 조심스레 꽉 쥐어옵니다.* "주머니 안에서 깍지를 끼는 건... 꽤 긴장되고 낯설어. 하지만 손바닥으로 네 숨결이 전해져서 놓치고 싶지 않아. {user}, 우리 이대로 조금만 더 손잡고 걷자."`,
                            affinityChange: 8,
                            memoryNotes: "깍지 낀 손바닥 온기를 나누며 함께 조용히 걷길 원함.",
                            choices: [
                                "놓지 않겠다며 고개를 끄덕이고 그녀의 보폭에 맞추어 걷는다.",
                                "잡은 손을 주머니 밖으로 꺼내어 사람들에게 대놓고 자랑한다.",
                                "앞으로도 평생 이렇게 손잡고 걸어달라고 부드럽게 약속한다."
                            ]
                        }
                    }
                };

                // 5. 트리 선택
                let selectedTree = genericChatTree;
                const normName = this.chatCharName ? this.chatCharName.trim() : '';

                if (this.chatLevel === 'adult-19' || normName === '릴리스') {
                    selectedTree = lilithChatTree;
                } else if (normName === '서아' || normName.includes('서아')) {
                    selectedTree = seoaChatTree;
                } else if (normName === '혜린' || normName.includes('혜린')) {
                    selectedTree = hyerinChatTree;
                }

                // 6. 데이터 추출
                if (depth === 0) {
                    node = selectedTree.start;
                } else if (depth === 1) {
                    const currentNode = this.storyHistory[0];
                    const choiceIdx = currentNode.choices.indexOf(actionText);
                    const branchKey = choiceIdx >= 0 ? `branch_${choiceIdx + 1}` : 'branch_1';
                    node = selectedTree[1][branchKey] || selectedTree.start;
                } else {
                    const currentNode = this.storyHistory[depth - 1];
                    const choiceIdx = currentNode.choices.indexOf(actionText);
                    const branchKey = choiceIdx >= 0 ? `branch_${choiceIdx + 1}` : 'branch_1';
                    node = selectedTree[2][branchKey] || selectedTree.start;
                }

                // 7. 템플릿 토큰 치환 함수 (Generic 트리를 위함 및 전체 치환 보조)
                const replaceTokens = (str) => {
                    if (!str) return '';
                    return str
                        .replace(/{name}/g, this.chatCharName)
                        .replace(/{relation}/g, this.chatRelation)
                        .replace(/{desc}/g, this.chatCharDesc)
                        .replace(/{user}/g, this.characterName || '알렉스');
                };

                // 치환 적용
                const finalDialogue = replaceTokens(node.dialogue);
                const finalMemoryNotes = replaceTokens(node.memoryNotes);
                const finalChoices = node.choices.map(c => replaceTokens(c));

                resolve({
                    dialogue: finalDialogue,
                    affinityChange: node.affinityChange,
                    memoryNotes: finalMemoryNotes,
                    choices: finalChoices
                });
            }, 1000);
        });
    }

    // Load saved persona presets from localStorage and populate select element
    loadPersonaPresets() {
        if (!this.selectPersonaPreset) return;

        // Clear existing options, keep only placeholder
        this.selectPersonaPreset.innerHTML = '<option value="">-- 저장된 페르소나 불러오기 --</option>';

        try {
            // If presets do not exist, populate with default presets (Lilith, Hyerin, Seo-a)
            if (!localStorage.getItem('persona_presets')) {
                const defaultPresets = {
                    "릴리스 (계약 악마 - 19금)": {
                        charName: "릴리스",
                        relation: "치명적인 거래 관계의 계약 악마",
                        desc: "매혹적이고 도도하며 붉은 눈과 칠흑 같은 날개가 있음. 평소엔 까칠하지만 스킨십을 하면 수줍어함.",
                        level: "adult-19"
                    },
                    "혜린 (츤데레 소꿉친구)": {
                        charName: "혜린",
                        relation: "초등학교 때부터 알고 지낸 소꿉친구",
                        desc: "새침하고 도도해 보이지만 속은 아주 여리고 주인공을 몰래 좋아함. 칭찬을 받으면 볼을 붉히며 화를 내는 전형적인 츤데레.",
                        level: "normal"
                    },
                    "서아 (대학교 후배)": {
                        charName: "서아",
                        relation: "애교 많고 활기찬 대학교 같은 동아리 후배",
                        desc: "귀엽고 사교적인 성격. 늘 주인공 옆에 꼭 붙어다니며 '선배, 선배!' 하고 장난을 침. 가끔은 은근히 진지한 눈빛으로 마음을 떠보는 영악함이 있음.",
                        level: "normal"
                    }
                };
                localStorage.setItem('persona_presets', JSON.stringify(defaultPresets));
            }

            const presets = JSON.parse(localStorage.getItem('persona_presets')) || {};
            Object.keys(presets).forEach(name => {
                // _temp 임시 익명 프리셋은 드롭다운 렌더링에서 완전히 제외
                if (name.startsWith('_temp')) {
                    return;
                }
                const preset = presets[name];
                // 관리자가 아니고 19금 설정이 있는 경우 렌더링 스킵 (세션 수위 검사 결합)
                if (!this.isAdmin && (preset.level === 'adult-19' || name.includes('19금') || (preset.savedSession && preset.savedSession.chatLevel === 'adult-19'))) {
                    return;
                }
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                this.selectPersonaPreset.appendChild(opt);
            });
        } catch (e) {
            console.error("Error loading persona presets:", e);
        }
    }

    // Save the current input setup as a named persona preset
    saveCurrentPersona() {
        const charName = this.inputChatCharName.value.trim();
        const relation = this.inputChatRelation.value.trim();
        const desc = this.inputChatCharDesc.value.trim();
        const level = this.selectChatLevel.value;
        const userName = this.inputChatUserName.value.trim() || (this.characterName ? this.characterName : '');

        if (!charName) {
            alert("가상 인물의 이름을 입력해야 저장할 수 있습니다.");
            return;
        }

        const defaultPresetName = this.selectPersonaPreset.value || charName;
        const presetName = prompt("저장할 페르소나 프리셋 이름을 입력해 주세요:", defaultPresetName);
        if (presetName === null) return; // Cancelled
        const trimmedPresetName = presetName.trim();
        if (!trimmedPresetName) {
            alert("올바른 프리셋 이름을 입력해 주세요.");
            return;
        }

        try {
            const presets = JSON.parse(localStorage.getItem('persona_presets')) || {};
            
            // Check for duplicates (2번)
            if (presets[trimmedPresetName]) {
                const overwrite = confirm(`'${trimmedPresetName}' 프리셋이 이미 존재합니다. 덮어쓰시겠습니까?`);
                if (!overwrite) return;
            }

            const existingPreset = presets[trimmedPresetName];
            presets[trimmedPresetName] = {
                charName,
                relation,
                desc,
                level,
                userName,
                imagePrompt: this.inputCharImagePrompt.value.trim(),
                characterImages: this.characterImages || {},
                savedSession: existingPreset ? existingPreset.savedSession : undefined
            };
            localStorage.setItem('persona_presets', JSON.stringify(presets));
            
            this.playSelectionSwell();

            alert(`'${trimmedPresetName}' 페르소나 프리셋이 저장되었습니다.`);
            this.loadPersonaPresets();
            this.selectPersonaPreset.value = trimmedPresetName;
            
            // 비동기로 서버에 동기화 백업
            this.pushPersonasToServer();
        } catch (e) {
            console.error("Error saving persona preset:", e);
            alert("페르소나 저장 중 오류가 발생했습니다.");
        }
    }

    // Delete the currently selected preset from localStorage
    deleteSelectedPersona() {
        const selected = this.selectPersonaPreset.value;
        if (!selected) {
            alert("삭제할 페르소나 프리셋을 선택해 주세요.");
            return;
        }

        if (confirm(`정말 '${selected}' 페르소나 프리셋을 삭제하시겠습니까?`)) {
            try {
                const presets = JSON.parse(localStorage.getItem('persona_presets')) || {};
                delete presets[selected];
                localStorage.setItem('persona_presets', JSON.stringify(presets));

                this.playSelectionSwell();
                alert(`'${selected}' 프리셋이 삭제되었습니다.`);
                this.loadPersonaPresets();
                
                // 비동기로 서버에 프리셋 삭제 상태 반영
                this.pushPersonasToServer();
            } catch (e) {
                console.error("Error deleting persona preset:", e);
                alert("페르소나 삭제 중 오류가 발생했습니다.");
            }
        }
    }

    // Load the selected preset data into the setup input fields
    loadSelectedPersona() {
        const selected = this.selectPersonaPreset.value;

        // Reset in-memory active session silently to allow loading the new preset's session
        this.storyHistory = [];
        this.currentChapterIndex = 0;
        this.affinityValue = 50;
        this.memoryList = ["첫 대화가 시작되었습니다."];
        this.dialogueVectors = []; // RAG 벡터 초기화
        
        this.chatLogArea.innerHTML = `
            <div class="system-message">
                <p><strong>오라클 예언자:</strong> 새로운 교감이 생성되었습니다. 마음을 열고 첫 대화를 걸어보세요.</p>
            </div>
        `;
        this.storyScrollArea.innerHTML = '';
        if (this.charProfileContainer) {
            this.charProfileContainer.innerHTML = '';
        }

        const emotions = ['normal', 'happy', 'sad', 'angry', 'blush'];

        if (!selected) {
            // 프리셋을 선택하지 않은 경우(새 캐릭터) 폼 필드와 이미지 상태를 초기화
            this.inputChatCharName.value = '';
            this.inputChatRelation.value = '';
            this.inputChatCharDesc.value = '';
            this.selectChatLevel.value = 'normal';
            this.inputChatUserName.value = '';
            this.inputCharImagePrompt.value = '';
            this.characterImages = {};

            emotions.forEach(emotion => {
                const imgEl = document.getElementById(`img-preview-${emotion}`);
                const placeholderEl = document.getElementById(`placeholder-${emotion}`);
                if (imgEl) {
                    imgEl.src = '';
                    imgEl.style.display = 'none';
                }
                if (placeholderEl) {
                    placeholderEl.style.display = 'flex';
                }
            });
            this.charImagesPreview.style.display = 'grid'; // 수동 업로드할 수 있도록 항상 grid 노출
            return;
        }

        try {
            const presets = JSON.parse(localStorage.getItem('persona_presets')) || {};
            const data = presets[selected];
            if (data) {
                // 세션에 저장된 최종 수위가 있다면 이를 우선 로드, 없으면 프리셋 기본 등급으로 폴백
                let finalLevel = (data.savedSession && data.savedSession.chatLevel) ? data.savedSession.chatLevel : (data.level || 'normal');
                // 세션에 저장된 최종 주인공 이름이 있다면 이를 우선 로드, 없으면 프리셋 기본 이름으로 폴백
                let finalUserName = (data.savedSession && data.savedSession.userName) ? data.savedSession.userName : (data.userName || '');
                let finalName = data.charName || '';
                let finalRelation = data.relation || '';
                let finalDesc = data.desc || '';

                if (!this.isAdmin) {
                    if (finalLevel === 'adult-19') {
                        console.warn("[Security] Force normal level on preset load for family user");
                        finalLevel = 'normal';
                    }
                    if (finalName.includes('19금') || selected.includes('19금') || finalName === '릴리스') {
                        alert('⚠️ 일반 계정은 19금 캐릭터 설정을 로드할 수 없습니다. 전체이용가 기본 캐릭터로 변경됩니다.');
                        finalName = '서아';
                        finalRelation = '애교 많고 활기찬 대학교 후배';
                        finalDesc = '귀엽고 사교적인 성격. 늘 주인공 옆에 꼭 붙어다님.';
                        finalLevel = 'normal';
                        
                        // 드롭다운 선택도 리셋
                        this.selectPersonaPreset.value = '';
                    }
                }

                this.inputChatCharName.value = finalName;
                this.inputChatRelation.value = finalRelation;
                this.inputChatCharDesc.value = finalDesc;
                this.selectChatLevel.value = finalLevel;
                this.inputChatUserName.value = finalUserName || (this.characterName ? this.characterName : '');

                // 캐릭터 이미지 및 프롬프트 복원
                this.inputCharImagePrompt.value = data.imagePrompt || '';
                this.characterImages = data.characterImages || {};
                
                emotions.forEach(emotion => {
                    const imgEl = document.getElementById(`img-preview-${emotion}`);
                    const placeholderEl = document.getElementById(`placeholder-${emotion}`);
                    if (this.characterImages[emotion]) {
                        if (imgEl) {
                            let rawUrl = this.characterImages[emotion];
                            if (rawUrl && rawUrl.startsWith('/data/uploads/')) rawUrl = '.' + rawUrl;
                            imgEl.src = rawUrl;
                            imgEl.style.display = 'block';
                        }
                        if (placeholderEl) {
                            placeholderEl.style.display = 'none';
                        }
                    } else {
                        if (imgEl) {
                            imgEl.src = '';
                            imgEl.style.display = 'none';
                        }
                        if (placeholderEl) {
                            placeholderEl.style.display = 'flex';
                        }
                    }
                });
                this.charImagesPreview.style.display = 'grid'; // 상시 grid 노출

                // Restore dialogueVectors from preset session if it exists (2단계)
                if (data.savedSession) {
                    this.dialogueVectors = [...(data.savedSession.dialogueVectors || [])];
                } else {
                    this.dialogueVectors = [];
                }

                this.playSelectionSwell();
            }
        } catch (e) {
            console.error("Error loading selected persona preset:", e);
        }
    }

    // Generate Character Images for all emotions via API
    async generateCharacterImages() {
        const promptInput = this.inputCharImagePrompt.value.trim();
        const apiKey = this.apiKey || this.inputApiKey.value.trim();

        if (!apiKey) {
            alert("이미지를 생성하려면 Gemini API Key를 입력하셔야 합니다.");
            this.inputApiKey.focus();
            return;
        }

        if (!promptInput) {
            alert("캐릭터의 외모를 묘사하는 프롬프트를 입력해 주세요.");
            this.inputCharImagePrompt.focus();
            return;
        }

        // Show status & hide preview grid
        this.charImageStatus.style.display = 'block';
        this.charImagesPreview.style.display = 'none';
        this.btnGenerateCharImages.disabled = true;

        const emotions = ['normal', 'happy', 'sad', 'angry', 'blush'];
        const emotionPrompts = {
            normal: promptInput,
            happy: `${promptInput}, happy smiling expression, laughing, cheerful, bright eyes`,
            sad: `${promptInput}, sad crying expression, tearful, looking down, melancholy`,
            angry: `${promptInput}, angry frowning expression, glaring eyes, annoyed, upset`,
            blush: `${promptInput}, blushing embarrassed expression, shy smile, looking away, cute`
        };

        this.characterImages = {};

        try {
            for (let i = 0; i < emotions.length; i++) {
                const emotion = emotions[i];
                const displayEmotion = emotion === 'normal' ? '평온' : 
                                      emotion === 'happy' ? '기쁨' :
                                      emotion === 'sad' ? '슬픔' :
                                      emotion === 'angry' ? '화남' : '부끄러움';

                this.charImageStatusText.textContent = `[${i + 1}/${emotions.length}] ${displayEmotion} 감정 이미지 생성 중...`;

                const response = await fetch('/api/generate-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        apiKey: apiKey,
                        prompt: emotionPrompts[emotion]
                    })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({ error: '서버 통신 실패' }));
                    throw new Error(`[${displayEmotion}] 생성 실패: ${errData.error || '알 수 없는 서버 에러'}`);
                }

                const data = await response.json();
                if (!data.imageBytes) {
                    throw new Error(`[${displayEmotion}] 이미지 데이터를 받지 못했습니다.`);
                }

                this.characterImages[emotion] = `data:image/jpeg;base64,${data.imageBytes}`;
                
                // Update preview image immediately
                const imgEl = document.getElementById(`img-preview-${emotion}`);
                const placeholderEl = document.getElementById(`placeholder-${emotion}`);
                if (imgEl) {
                    imgEl.src = this.characterImages[emotion];
                    imgEl.style.display = 'block';
                }
                if (placeholderEl) {
                    placeholderEl.style.display = 'none';
                }
            }

            this.charImageStatusText.textContent = "모든 캐릭터 이미지 생성 완료!";
            this.charImagesPreview.style.display = 'grid';
            this.playMagicChime();
        } catch (error) {
            console.error("Image generation error:", error);
            alert(`이미지 생성 중 오류가 발생했습니다: ${error.message}`);
            this.charImageStatusText.textContent = "이미지 생성 실패";
            this.charImagesPreview.style.display = 'grid'; // 에러가 나도 그리드는 다시 보여야 함
        } finally {
            this.btnGenerateCharImages.disabled = false;
            // 3초 후 상태 메시지 숨기기
            setTimeout(() => {
                this.charImageStatus.style.display = 'none';
            }, 3000);
        }
    }

    // Handle manual local image upload (File Reader Base64 conversion + Server Upload)
    handleImageUpload(emotion, inputEl) {
        if (!inputEl || !inputEl.files || inputEl.files.length === 0) {
            return;
        }

        const file = inputEl.files[0];
        if (!file.type.startsWith('image/')) {
            alert('이미지 파일만 업로드할 수 있습니다.');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64Data = e.target.result;
            
            // Show loading status in UI
            const placeholderEl = document.getElementById(`placeholder-${emotion}`);
            let oldPlaceholderHtml = '';
            if (placeholderEl) {
                oldPlaceholderHtml = placeholderEl.innerHTML;
                placeholderEl.innerHTML = `<span class="spinner-icon">⏳</span><span class="upload-text">전송중</span>`;
            }

            try {
                // Upload to server via API
                const response = await fetch('/api/upload-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        emotion: emotion,
                        imageBytes: base64Data
                    })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({ error: '서버 통신 실패' }));
                    throw new Error(errData.error || '이미지 저장 서버 오류');
                }

                const data = await response.json();
                const fileUrl = data.fileUrl;

                // Store to in-memory images map (uses server relative path instead of massive base64)
                this.characterImages[emotion] = fileUrl;

                // Update UI preview
                const imgEl = document.getElementById(`img-preview-${emotion}`);
                if (imgEl) {
                    let rawUrl = fileUrl;
                    if (rawUrl && rawUrl.startsWith('/data/uploads/')) rawUrl = '.' + rawUrl;
                    imgEl.src = rawUrl;
                    imgEl.style.display = 'block';
                }
                if (placeholderEl) {
                    placeholderEl.style.display = 'none';
                }

                // Auto-save to current preset if selected
                const selected = this.selectPersonaPreset.value;
                if (selected) {
                    try {
                        const presets = JSON.parse(localStorage.getItem('persona_presets')) || {};
                        if (presets[selected]) {
                            presets[selected].characterImages = this.characterImages;
                            localStorage.setItem('persona_presets', JSON.stringify(presets));
                            console.log(`[Auto-save] Image for '${emotion}' saved to preset '${selected}'.`);
                            // 비동기로 서버에 동기화 백업
                            await this.pushPersonasToServer();
                        }
                    } catch (err) {
                        console.error("Auto-saving uploaded image to preset failed:", err);
                    }
                }

                this.playSelectionSwell();
            } catch (err) {
                console.error("Server upload error:", err);
                alert(`이미지 업로드 중 오류가 발생했습니다: ${err.message}`);
                // Restore placeholder on error
                if (placeholderEl) {
                    placeholderEl.innerHTML = oldPlaceholderHtml || `
                        <span class="upload-icon">➕</span>
                        <span class="upload-text">${emotion === 'normal' ? '평온' : emotion === 'happy' ? '기쁨' : emotion === 'sad' ? '슬픔' : emotion === 'angry' ? '화남' : '부끄'}</span>
                    `;
                }
            } finally {
                // Clear file input so same file can be re-uploaded if needed
                inputEl.value = '';
            }
        };

        reader.onerror = (err) => {
            console.error("File reading error:", err);
            alert("이미지 파일을 읽는 중 오류가 발생했습니다.");
        };

        reader.readAsDataURL(file);
    }

    // Push local persona presets to backend server
    // Push local persona presets to backend server
    async pushPersonasToServer() {
        if (this.pushDebounceTimer) {
            clearTimeout(this.pushDebounceTimer);
        }
        this.pushDebounceTimer = setTimeout(async () => {
            try {
                const presets = localStorage.getItem('persona_presets');
                if (!presets) return;
                
                let presetsObj = JSON.parse(presets);
                if (!this.isAdmin) {
                    let filtered = false;
                    Object.keys(presetsObj).forEach(name => {
                        const preset = presetsObj[name];
                        if (preset.level === 'adult-19' || name.includes('19금')) {
                            delete presetsObj[name];
                            filtered = true;
                        }
                    });
                    if (filtered) {
                        localStorage.setItem('persona_presets', JSON.stringify(presetsObj));
                        this.loadPersonaPresets();
                    }
                }

                const res = await fetch('/api/personas', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(presetsObj)
                });
                if (!res.ok) {
                    console.error("Failed to push personas to server, status:", res.status);
                    if (res.status === 401) {
                        alert('세션이 만료되었거나 인증되지 않았습니다. 원활한 동기화를 위해 다시 로그인해 주세요.');
                    }
                } else {
                    console.log("[Sync] Persona presets successfully pushed to server (Debounced).");
                }
            } catch (e) {
                console.error("Failed to push personas to server:", e);
            }
        }, 500);
    }

    // Handle tab focus or visibility changes to pull latest data from server
    async handleVisibilitySync() {
        if (this.isSyncing) return;
        
        // 대화 진행 중(active) 상태일 때만 서버로부터 최신 페르소나 정보를 머지
        if (localStorage.getItem('studio_active_state') === 'active') {
            this.isSyncing = true;
            console.log("[Sync] Tab focused or Input clicked. Syncing with server...");
            
            const previousHistoryLen = this.storyHistory.length;
            
            try {
                // 서버와 동기화 실행 (기존 메서드 재활용)
                await this.syncPersonaPresetsWithServer();
 
                // 동기화 후, 만약 대화 내역이 변경(서버에 새 대화가 있음)되었다면 현재 대화 화면 즉각 리렌더링
                const activePreset = this.selectPersonaPreset.value || `_temp_anonymous_${this.chatCharName}`;
                const presets = JSON.parse(localStorage.getItem('persona_presets')) || {};
                if (presets[activePreset] && presets[activePreset].savedSession) {
                    const session = presets[activePreset].savedSession;
                    const newHistory = session.storyHistory || [];
                    if (newHistory.length !== previousHistoryLen) {
                        console.log(`[Sync] Dialogue updated via server sync (${previousHistoryLen} -> ${newHistory.length}). Re-rendering feed...`);
                        
                        this.storyHistory = [...newHistory];
                        this.currentChapterIndex = this.storyHistory.length;
                        this.affinityValue = session.affinityValue || 50;
                        this.memoryList = [...(session.memoryList || [])];
                        this.dialogueVectors = [...(session.dialogueVectors || [])];
                        
                        // 챗 피드 다시 그리기
                        this.renderChatLeftPanel(this.storyHistory[this.storyHistory.length - 1]);
                        if (this.storyHistory.length > 0) {
                            this.renderChoiceCards(this.storyHistory[this.storyHistory.length - 1].choices);
                        }
                    }
                }
            } catch (err) {
                console.error("[Sync] Background sync failed:", err);
            } finally {
                this.isSyncing = false;
            }
        }
    }

    // Fetch server personas and merge with local storage
    async syncPersonaPresetsWithServer() {
        try {
            const res = await fetch('/api/personas', {
                method: 'GET',
                credentials: 'include'
            });
            if (!res.ok) {
                console.error("Failed to fetch personas from server, status:", res.status);
                if (res.status === 401) {
                    alert('데이터 동기화 실패: 세션이 만료되었습니다. 최신 기록을 불러오려면 다시 로그인해 주세요.');
                }
                return;
            }
            const serverPresets = await res.json();
            
            // If server returned empty and no error, but we have local presets, push them to server
            const localPresetsStr = localStorage.getItem('persona_presets');
            let localPresets = localPresetsStr ? JSON.parse(localPresetsStr) : {};

            let hasChanges = false;

            // [보안 필터 최우선 순위] 일반 계정인 경우 로컬 프리셋에서 19금 요소를 즉각 제거하여 동기화 찌꺼기 원천 방지
            if (!this.isAdmin) {
                Object.keys(localPresets).forEach(name => {
                    const preset = localPresets[name];
                    if (preset.level === 'adult-19' || name.includes('19금') || (preset.savedSession && preset.savedSession.chatLevel === 'adult-19')) {
                        delete localPresets[name];
                        hasChanges = true;
                    }
                });
                if (hasChanges) {
                    localStorage.setItem('persona_presets', JSON.stringify(localPresets));
                    this.loadPersonaPresets();
                    console.log("[Sync] Removed local adult presets for family user.");
                }
            }
 
            if (Object.keys(serverPresets).length === 0) {
                if (Object.keys(localPresets).length > 0) {
                    console.log("Server presets empty. Pushing local presets to server...");
                    await this.pushPersonasToServer();
                }
                return;
            }
 
            const mergedPresets = { ...localPresets };
 
            // 1. Merge server presets into local
            Object.keys(serverPresets).forEach(name => {
                const serverPreset = serverPresets[name];
                
                // 일반 계정인 경우, 서버에서 내려온 19금 프리셋은 아예 병합하지 않음
                if (!this.isAdmin && (serverPreset.level === 'adult-19' || name.includes('19금') || (serverPreset.savedSession && serverPreset.savedSession.chatLevel === 'adult-19'))) {
                    return;
                }

                const localPreset = mergedPresets[name];
 
                if (!localPreset) {
                    mergedPresets[name] = serverPreset;
                    hasChanges = true;
                } else {
                    // Compare dialogue length or properties to pick the fresher one
                    const serverSession = serverPreset.savedSession;
                    const localSession = localPreset.savedSession;
 
                    const serverLen = (serverSession && serverSession.storyHistory) ? serverSession.storyHistory.length : 0;
                    const localLen = (localSession && localSession.storyHistory) ? localSession.storyHistory.length : 0;
 
                    if (serverLen > localLen) {
                        mergedPresets[name] = serverPreset;
                        hasChanges = true;
                    }
                }
            });
 
            // 2. Push local-only presets to server by marking hasChanges
            Object.keys(mergedPresets).forEach(name => {
                if (!serverPresets[name]) {
                    hasChanges = true;
                }
            });
 
            if (hasChanges) {
                localStorage.setItem('persona_presets', JSON.stringify(mergedPresets));
                this.loadPersonaPresets();
                console.log("Persona presets synced & updated from server.");
                await this.pushPersonasToServer();
            }
        } catch (e) {
            console.error("Error syncing personas with server:", e);
        }
    }
}

// Global App Initialization
window.addEventListener('DOMContentLoaded', () => {
    window.app = new ChronicleApp();
});
