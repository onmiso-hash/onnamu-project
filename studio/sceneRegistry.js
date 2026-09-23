/**
 * 장면(배경) 목록 — 대화 무대의 배경은 이 표 하나만 읽는다.
 *
 * 화면(app.js)의 장면 고르기·무대 배경과 저장(store.js)의 sceneId 검사가 같은 표를 쓴다.
 * 두 벌로 복사하지 말 것.
 *
 * - 장면은 인물 그림이 아니라 배경판이다. 감정 초상과 따로 두고 화면에서 겹친다
 *   (감정 × 장면 전조합 그림을 만들지 않는다).
 * - image가 비어 있으면 gradient로 그린다. 그림을 붙이려면 파일을 공개 목록에 올리고 주소를 적는다.
 * - 'studio'는 은은한 단색 배경이다. 초상은 모든 장면에서 같은 3:4 세운 그림이라
 *   장면을 바꿔도 초상 모양·크기가 흔들리지 않는다(2026-09-23 사용자 결정).
 *
 * 일반 스크립트로 싣는다. 브라우저 window.SceneRegistry, 노드 require('./sceneRegistry').
 */
(function (root) {
    const DEFAULT_SCENE = 'studio';

    const SCENES = [
        { id: 'studio',       label: '스튜디오',     icon: '🎙️', image: '',
          gradient: 'linear-gradient(160deg, #1e293b 0%, #334155 55%, #475569 100%)' },
        { id: 'cafe',         label: '카페',         icon: '☕', image: '',
          gradient: 'linear-gradient(160deg, #6b4423 0%, #a47148 45%, #e0b98a 100%)' },
        { id: 'office',       label: '사무실',       icon: '💼', image: '',
          gradient: 'linear-gradient(160deg, #1f2d3d 0%, #3d5a73 50%, #9fb3c8 100%)' },
        { id: 'classroom',    label: '교실',         icon: '🏫', image: '',
          gradient: 'linear-gradient(160deg, #2f4f3a 0%, #5b8a63 50%, #d8c99b 100%)' },
        { id: 'bedroom',      label: '침실',         icon: '🛏️', image: '',
          gradient: 'linear-gradient(160deg, #2a1f3d 0%, #5c3b6e 50%, #c98fa6 100%)' },
        { id: 'night-street', label: '밤거리',       icon: '🌃', image: '',
          gradient: 'linear-gradient(160deg, #0b1026 0%, #26215c 50%, #d9467a 100%)' },
        { id: 'park-sunset',  label: '공원 석양',    icon: '🌇', image: '',
          gradient: 'linear-gradient(170deg, #3b2a5c 0%, #c2566b 45%, #f4a259 80%, #f7d488 100%)' },
        { id: 'rainy-window', label: '빗소리 창가',  icon: '🌧️', image: '',
          gradient: 'linear-gradient(160deg, #1c2733 0%, #3e5566 50%, #8aa1b1 100%)' }
    ];

    const byId = {};
    SCENES.forEach(s => { byId[s.id] = s; });

    function isKnownScene(id) {
        return typeof id === 'string' && Object.prototype.hasOwnProperty.call(byId, id);
    }

    // 모르는 값·빈 값은 기본 장면으로 본다(옛 대화에는 sceneId가 없다).
    function resolveScene(id) {
        return byId[isKnownScene(id) ? id : DEFAULT_SCENE];
    }

    // 무대 배경으로 칠할 CSS background 값. 배경이 없는 장면이면 ''.
    function sceneBackground(id) {
        const s = resolveScene(id);
        if (s.image) return `url("${s.image}") center / cover no-repeat`;
        return s.gradient || '';
    }

    const api = { DEFAULT_SCENE, SCENES, isKnownScene, resolveScene, sceneBackground };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.SceneRegistry = api;
    }
})(this);
