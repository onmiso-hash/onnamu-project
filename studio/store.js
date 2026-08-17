// 파일 기반 저장소 — 기록장(append-only log) 방식
//
//   users/<username>/
//     characters/<charId>.json          인물 설정 1건 (작다 → 통째로 원자적 쓰기)
//     conversations/<convId>/
//       turns.jsonl                     한 줄 = 한 턴.   {"n":0,"t":{...}}
//       vectors.jsonl                   한 줄 = 한 벡터. {"n":0,"v":[...]}
//       meta.json                       제목·모드·charId·호감도·기억메모·visibleTurns·updatedAt
//     legacy-imported.json              옛 파일 이관을 마쳤다는 표시 + 이관 이력
//
// 왜 기록장인가 (1판을 버린 이유):
//   ① 화면이 스냅샷을 통째로 보내고 서버가 "무엇이 새것인지" 역추적하던 구조를 버린다.
//      줄마다 번호(n)가 있어 화면이 "n번 턴을 붙여라"라고 직접 지목한다.
//   ② 턴 하나 추가에 대화 문서 전체를 다시 쓰던 O(N²)를 버린다. 여기서는 한 줄 이어쓰기다.
//   ③ turns[i] ↔ vectors[i] 를 "위치"로 묶던 것을 버린다. 벡터가 n으로 턴을 가리키므로
//      한 번 어긋나면 조용히 영구히 밀리던 사고가 구조적으로 불가능해진다.
//
// 이 파일에서 지키는 세 가지 약속:
//   - 지금 몇 턴짜리 대화인가는 **meta.visibleTurns 하나만** 이 답한다. 기록장 파일에는
//     그보다 뒤(되돌리기로 감춘 턴)의 줄이 남아 있을 수 있다 — 되돌리기 취소용이다.
//   - 같은 턴을 두 번 보내도 두 번 쌓이지 않는다(n < visibleTurns 면 무시).
//   - 쓰다 만 마지막 줄은 읽을 때 걸러지고, 다음 이어쓰기가 그 줄을 덮치지 않는다
//     (줄바꿈으로 끝나지 않으면 줄바꿈부터 넣고 쓴다).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_ROOT = process.env.STUDIO_DATA_DIR || path.join(__dirname, 'data');

// 사용자명은 그대로 디렉터리 이름으로 쓰인다. 허용 문자 밖이거나 상위 경로 이동(..)이
// 섞여 있으면 조용히 넘어가지 않고 예외를 던진다.
const USERNAME_RE = /^[A-Za-z0-9_.@-]+$/;
// convId·charId는 직접 만든 UUID(crypto.randomUUID) 또는 이관용 결정적 id만 허용한다.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// 오류에 종류를 붙여 던진다. server.js가 이 종류만 보고 상태 코드를 정한다 —
// 오류 문구를 글자로 대조해 분류하면 문구를 다듬는 순간 조용히 500으로 바뀐다.
//   INVALID  = 요청 값이 잘못됐다 (400)
//   NOT_FOUND = 그런 대상이 없다 (404)
//   CONFLICT = 이미 있어서 못 한다 (409)
function fail(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

function assertValidUsername(username) {
    if (typeof username !== 'string' || username.length === 0) {
        throw fail('INVALID', '사용자명이 비어 있습니다.');
    }
    if (username.includes('..')) {
        throw fail('INVALID', `사용자명에 상위 경로 이동 문자가 포함되어 있습니다: ${username}`);
    }
    if (!USERNAME_RE.test(username)) {
        throw fail('INVALID', `사용자명에 허용되지 않는 문자가 포함되어 있습니다: ${username}`);
    }
    // '.' 하나만 있는 사용자명은 정규식은 통과하지만 path.join에서 users/ 디렉터리
    // 자체로 정규화되어버린다(예: '.' -> path.join(usersRoot,'.') === usersRoot).
    // 문자열 검사만으로는 이런 정규화 결과를 다 막지 못하므로, 실제로 계산되는
    // 경로가 users/ 바로 아래의 "새 하위 디렉터리"가 맞는지 직접 확인한다.
    const usersRoot = path.resolve(DATA_ROOT, 'users');
    const resolved = path.resolve(usersRoot, username);
    if (resolved === usersRoot || path.dirname(resolved) !== usersRoot) {
        throw fail('INVALID', `사용자 경로가 허용된 범위를 벗어났습니다: ${username}`);
    }
}

function assertValidId(id, label) {
    if (typeof id !== 'string' || !ID_RE.test(id)) {
        throw fail('INVALID', `${label || 'id'} 형식이 올바르지 않습니다: ${id}`);
    }
}

// charId·convId로 만든 최종 경로가 실제로 그 상위 디렉터리 바로 아래에 있는지 다시
// 확인한다. ID_RE가 이미 '.'·'/'를 막아 이론상 벗어날 수 없지만, 정규식이 나중에
// 느슨해지더라도 여기서 한 번 더 막히도록 한다.
function assertDirectChild(dir, target, label) {
    const resolvedDir = path.resolve(dir);
    const resolvedTarget = path.resolve(target);
    if (path.dirname(resolvedTarget) !== resolvedDir) {
        throw fail('INVALID', `${label} 경로가 허용된 디렉터리를 벗어났습니다.`);
    }
}

// ---- 경로 헬퍼 ----
function userDirPath(username) {
    return path.join(DATA_ROOT, 'users', username);
}
function charactersDirPath(username) {
    return path.join(userDirPath(username), 'characters');
}
function conversationsDirPath(username) {
    return path.join(userDirPath(username), 'conversations');
}
function characterFilePath(username, charId) {
    const dir = charactersDirPath(username);
    const filePath = path.join(dir, `${charId}.json`);
    assertDirectChild(dir, filePath, 'charId');
    return filePath;
}
function conversationDirPath(username, convId) {
    const dir = conversationsDirPath(username);
    const convDir = path.join(dir, convId);
    assertDirectChild(dir, convDir, 'convId');
    return convDir;
}
function metaFilePath(username, convId) {
    return path.join(conversationDirPath(username, convId), 'meta.json');
}
function turnsFilePath(username, convId) {
    return path.join(conversationDirPath(username, convId), 'turns.jsonl');
}
function vectorsFilePath(username, convId) {
    return path.join(conversationDirPath(username, convId), 'vectors.jsonl');
}
function legacyImportedPath(username) {
    return path.join(userDirPath(username), 'legacy-imported.json');
}
function legacyPersonaFilePath(username) {
    return path.join(DATA_ROOT, `personas_${username}.json`);
}

// ---- 작은 파일: 원자적 쓰기 ----
// 같은 디렉터리에 임시 파일로 먼저 쓴 뒤 rename으로 교체한다. 도중에 프로세스가 죽어도
// 원본이 반쪽짜리로 남지 않는다. 기록장(.jsonl)에는 쓰지 않는다 — 그쪽은 이어쓰기다.
function writeTextAtomic(filePath, text) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpName = `.${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    const tmpPath = path.join(dir, tmpName);
    fs.writeFileSync(tmpPath, text, 'utf8');
    fs.renameSync(tmpPath, filePath);
}

function writeJsonAtomic(filePath, obj) {
    writeTextAtomic(filePath, JSON.stringify(obj, null, 2));
}

// 있을 수도 있는 BOM을 제거하고 읽는다. 파일이 없으면 fallback을 돌려준다.
function readJson(filePath, fallback) {
    if (!fs.existsSync(filePath)) return fallback;
    let raw = fs.readFileSync(filePath, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) {
        raw = raw.slice(1);
    }
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
}

function safeReaddir(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        return [];
    }
}

// ---- 기록장(.jsonl) 기본 동작 ----

// 파일이 줄바꿈으로 끝나는지 마지막 1바이트만 읽어 확인한다. 쓰다 만 줄(줄바꿈 없이
// 끊긴 줄) 뒤에 그냥 이어 쓰면 두 줄이 붙어 한 줄이 되면서 **멀쩡한 새 줄까지** 못 읽게
// 된다. 그래서 이어쓰기 전에 이걸 보고 필요하면 줄바꿈부터 넣는다.
function endsWithNewline(filePath) {
    let st;
    try {
        st = fs.statSync(filePath);
    } catch (err) {
        return true; // 파일이 없으면 붙일 앞줄도 없다
    }
    if (st.size === 0) return true;
    const fd = fs.openSync(filePath, 'r');
    try {
        const buf = Buffer.alloc(1);
        fs.readSync(fd, buf, 0, 1, st.size - 1);
        return buf[0] === 0x0A;
    } finally {
        fs.closeSync(fd);
    }
}

function appendLogLine(filePath, obj) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const prefix = endsWithNewline(filePath) ? '' : '\n';
    fs.appendFileSync(filePath, `${prefix}${JSON.stringify(obj)}\n`, 'utf8');
}

// 한 줄을 해석한다. 깨진 줄(쓰다 만 마지막 줄 등)·번호 없는 줄은 null을 돌려 걸러낸다.
function parseLogLine(line) {
    const s = line.trim();
    if (!s) return null;
    let obj;
    try {
        obj = JSON.parse(s);
    } catch (err) {
        return null;
    }
    if (!obj || typeof obj !== 'object') return null;
    if (!Number.isInteger(obj.n) || obj.n < 0) return null;
    return obj;
}

function readLogLines(filePath) {
    if (!fs.existsSync(filePath)) return [];
    let raw = fs.readFileSync(filePath, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    return raw.split('\n');
}

// 같은 n이 여러 줄 있으면 **뒤에 쓴 줄이 이긴다**. 되돌린 뒤 다시 쓴 턴이 옛 줄을
// 덮는 방식이 이것이다(파일을 고쳐 쓰지 않고 덮어쓴 셈이 된다).
function readLogMap(filePath, valueKey) {
    const byN = new Map();
    for (const line of readLogLines(filePath)) {
        const obj = parseLogLine(line);
        if (!obj || !Object.prototype.hasOwnProperty.call(obj, valueKey)) continue;
        byN.set(obj.n, obj[valueKey]);
    }
    return byN;
}

// 기록장 **마지막 줄**의 번호를 파일 끝에서 조금만 읽어 알아낸다.
// "가장 큰 번호"가 아니라 "마지막 줄의 번호"인 것이 중요하다 — 되돌린 뒤 새 턴을 쓰면
// 그 뒤에 남아 있던 옛 줄들은 버려진 갈래이므로, 되돌리기 취소가 그 갈래로 넘어가면
// 서로 다른 두 갈래가 이어붙는다. 마지막 줄 기준이면 그 사고가 저절로 막힌다.
// 줄이 하나도 없거나 전부 깨졌으면 -1.
function lastLoggedN(filePath) {
    let st;
    try {
        st = fs.statSync(filePath);
    } catch (err) {
        return -1;
    }
    if (st.size === 0) return -1;

    const fd = fs.openSync(filePath, 'r');
    try {
        let window = 65536;
        for (;;) {
            const start = Math.max(0, st.size - window);
            const len = st.size - start;
            const buf = Buffer.alloc(len);
            fs.readSync(fd, buf, 0, len, start);
            const lines = buf.toString('utf8').split('\n');
            // 파일 중간부터 읽었다면 첫 조각은 잘린 줄이므로 버린다
            if (start > 0) lines.shift();
            for (let i = lines.length - 1; i >= 0; i--) {
                const obj = parseLogLine(lines[i]);
                if (obj) return obj.n;
            }
            if (start === 0) return -1;
            window *= 4;
        }
    } finally {
        fs.closeSync(fd);
    }
}

// ---- 인물 문서 ----

// presetName이 없으면(옛 문서 하위 호환) charName으로 채운다. presetName은 옛 시스템에서
// 프리셋 딕셔너리의 키였던 자리다 — 사용자가 붙인 이름이라 보존해야 하고, 19금 판정도
// 이 값을 본다. 여기서 채워두면 어디서 읽든 항상 문자열이라는 게 보장된다.
function readCharacterDoc(filePath) {
    const doc = readJson(filePath, null);
    if (!doc) return null;
    if (typeof doc.presetName !== 'string' || !doc.presetName) {
        doc.presetName = doc.charName;
    }
    return doc;
}

// level이 'adult-19'거나 (프리셋 이름 또는 인물 이름)에 '19금'이 들어가면 성인 인물로 본다.
// 옛 server.js가 딕셔너리 키에 '19금'이 있으면 성인으로 치던 것을 그대로 이어받은 판정으로,
// 판정이 갈리지 않게 이 함수 하나로 일원화한다.
function isAdult19Character(character) {
    if (!character) return false;
    if (character.level === 'adult-19') return true;
    if (typeof character.charName === 'string' && character.charName.includes('19금')) return true;
    if (typeof character.presetName === 'string' && character.presetName.includes('19금')) return true;
    return false;
}

// ---- 옛 데이터 이사 ----

// 이관 id는 randomUUID가 아니라 (종류, username, presetName)으로부터 결정적으로 만든다.
// 이관이 중간에 끊겨 다시 돌아도 같은 프리셋은 매번 같은 id로 떨어지므로, 다시 만들거나
// 지울 필요 없이 "이미 있으면 건너뛰기"만으로 재시도가 안전해진다.
function migrationId(kind, username, presetName) {
    return crypto.createHash('sha1').update(`${kind}:${username}:${presetName}`).digest('hex').slice(0, 32);
}

// 옛 프리셋 한 건을 인물 문서로 옮긴다.
function legacyPresetToCharacter(charId, presetName, preset, now) {
    // 옛 server.js는 preset.level === 'adult-19' 뿐 아니라 프리셋 "키 이름"에 '19금'이
    // 들어가도 성인으로 쳤다. 이관 뒤엔 그 키가 presetName 필드로만 남으므로 판정 결과를
    // level에 새겨 넣는다 — 안 그러면 신호가 영구히 사라진다.
    const looksAdult = preset.level === 'adult-19'
        || String(presetName).includes('19금')
        || (typeof preset.charName === 'string' && preset.charName.includes('19금'));
    return {
        id: charId,
        charName: preset.charName || presetName,
        presetName: presetName,
        relation: preset.relation || '',
        desc: preset.desc || '',
        level: looksAdult ? 'adult-19' : (preset.level || 'normal'),
        userName: preset.userName || '',
        imagePrompt: preset.imagePrompt || '',
        characterImages: preset.characterImages || {},
        createdAt: now,
        updatedAt: now
    };
}

// 이미 있는 대화 뭉치 하나를 폴더 하나로 통째로 옮긴다. 옮기기는 딱 한 번이라 한 줄씩
// 이어쓸 이유가 없어 한 번에 다 쓴다.
// 옛 구조에서 벡터는 턴과 "위치"로만 묶여 있었다. 옮기는 이 순간에만 그 위치를 번호로
// 번역하고, 이후로는 번호가 정본이 된다. 턴보다 벡터가 많으면 짝 없는 벡터이므로 버린다.
function bulkWriteConversation(username, convId, meta, turns, vectors) {
    fs.mkdirSync(conversationDirPath(username, convId), { recursive: true });

    if (turns.length > 0) {
        const text = turns.map((t, i) => JSON.stringify({ n: i, t })).join('\n') + '\n';
        writeTextAtomic(turnsFilePath(username, convId), text);
    }
    const paired = (Array.isArray(vectors) ? vectors : [])
        .slice(0, turns.length)
        .map((v, i) => ({ n: i, v }))
        .filter(e => Array.isArray(e.v) && e.v.length > 0);
    if (paired.length > 0) {
        const text = paired.map(e => JSON.stringify(e)).join('\n') + '\n';
        writeTextAtomic(vectorsFilePath(username, convId), text);
    }

    writeJsonAtomic(metaFilePath(username, convId), { ...meta, visibleTurns: turns.length });
}

// 옛 세션 하나를 대화 폴더 하나로 옮긴다.
// 이미 그 폴더가 있으면 손대지 않는다 — 재시도가 사용자의 최근 작업을 덮는 사고를 막는다.
function importLegacySession(username, convId, meta, session) {
    if (fs.existsSync(conversationDirPath(username, convId))) return false;
    const turns = Array.isArray(session.storyHistory) ? session.storyHistory : [];
    bulkWriteConversation(username, convId, meta, turns, session.dialogueVectors);
    return true;
}

// data/personas_<username>.json (BOM 포함, 프리셋 딕셔너리를 통째 덮어쓰던 옛 형식)을
// 새 구조로 옮긴다. 원본은 지우지 않고 .bak 스냅샷만 남긴다.
//
// _temp_anonymous_<이름> 은 프리셋을 안 고른 채 대화해서 갈라져 나온 유령 키다. 실측하면
// 원본보다 턴이 더 많은 경우도 있어서(temp 157 vs 원본 155) 지우거나 병합하면 잃는 게
// 생긴다. 새 구조는 인물 1명이 여러 대화를 가질 수 있으므로 **같은 인물의 두 번째 대화**로
// 옮긴다. 어느 쪽이 필요한지는 사용자가 목록에서 보고 정한다.
const TEMP_PREFIX = '_temp_anonymous_';

function importLegacyIfNeeded(username) {
    if (fs.existsSync(legacyImportedPath(username))) return null;

    const legacyFile = legacyPersonaFilePath(username);
    const report = { importedAt: new Date().toISOString(), characters: 0, conversations: 0, tempConversations: 0 };

    if (!fs.existsSync(legacyFile)) {
        writeJsonAtomic(legacyImportedPath(username), { ...report, note: '옮길 옛 파일이 없었습니다.' });
        return report;
    }

    let raw = fs.readFileSync(legacyFile, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    const personas = raw.trim() ? JSON.parse(raw) : {};
    if (!personas || typeof personas !== 'object') {
        writeJsonAtomic(legacyImportedPath(username), { ...report, note: '옛 파일 내용이 딕셔너리가 아니었습니다.' });
        return report;
    }

    const now = new Date().toISOString();
    const names = Object.keys(personas);
    // 유령 키가 어느 인물에 붙을지 알아야 하므로 정상 프리셋을 먼저 다 만든다.
    const normalNames = names.filter(n => !n.startsWith(TEMP_PREFIX));
    const tempNames = names.filter(n => n.startsWith(TEMP_PREFIX));
    const charIdByCharName = new Map();

    for (const presetName of normalNames) {
        const preset = personas[presetName];
        if (!preset || typeof preset !== 'object') continue;

        const charId = migrationId('char', username, presetName);
        const doc = legacyPresetToCharacter(charId, presetName, preset, now);
        // 이미 있으면(=이전 이관에서 만들어졌거나 사용자가 그 뒤 수정했으면) 건드리지 않는다.
        const charFile = characterFilePath(username, charId);
        if (!fs.existsSync(charFile)) {
            writeJsonAtomic(charFile, doc);
            report.characters++;
        }
        if (!charIdByCharName.has(doc.charName)) charIdByCharName.set(doc.charName, charId);

        const session = preset.savedSession;
        if (session && Array.isArray(session.storyHistory) && session.storyHistory.length > 0) {
            const convId = migrationId('conv', username, presetName);
            const created = importLegacySession(username, convId, {
                id: convId,
                mode: 'chat',
                charId,
                title: presetName,
                createdAt: now,
                updatedAt: now,
                affinityValue: typeof session.affinityValue === 'number' ? session.affinityValue : 50,
                memoryList: Array.isArray(session.memoryList) ? session.memoryList : [],
                chatLevel: session.chatLevel || preset.level || 'normal',
                userName: session.userName || preset.userName || ''
            }, session);
            if (created) report.conversations++;
        }
    }

    for (const presetName of tempNames) {
        const preset = personas[presetName];
        if (!preset || typeof preset !== 'object') continue;
        const session = preset.savedSession;
        if (!session || !Array.isArray(session.storyHistory) || session.storyHistory.length === 0) continue;

        const baseName = presetName.slice(TEMP_PREFIX.length);
        let charId = charIdByCharName.get(preset.charName) || charIdByCharName.get(baseName) || null;
        if (!charId) {
            // 짝지을 인물이 없으면(원본 프리셋이 이미 지워진 경우) 유령 키로 인물을 새로 만든다.
            // 대화만 남기고 인물을 버리면 화면에서 열 방법이 없어진다.
            charId = migrationId('char', username, presetName);
            const doc = legacyPresetToCharacter(charId, presetName, preset, now);
            doc.charName = preset.charName || baseName;
            const charFile = characterFilePath(username, charId);
            if (!fs.existsSync(charFile)) {
                writeJsonAtomic(charFile, doc);
                report.characters++;
            }
        }

        const convId = migrationId('conv', username, presetName);
        const created = importLegacySession(username, convId, {
            id: convId,
            mode: 'chat',
            charId,
            title: `${baseName} (자동 저장본)`,
            createdAt: now,
            updatedAt: now,
            affinityValue: typeof session.affinityValue === 'number' ? session.affinityValue : 50,
            memoryList: Array.isArray(session.memoryList) ? session.memoryList : [],
            chatLevel: session.chatLevel || preset.level || 'normal',
            userName: session.userName || preset.userName || ''
        }, session);
        if (created) report.tempConversations++;
    }

    // 되돌릴 길을 남기려고 원본을 지우지 않고 스냅샷만 복사한다.
    try {
        fs.copyFileSync(legacyFile, `${legacyFile}.bak`);
    } catch (err) {
        console.warn(`[store] 옛 파일 스냅샷 복사 실패(${username}):`, err.message);
    }

    // 표시는 맨 마지막에만 남긴다 — 도중에 실패하면 이 줄에 닿지 못해 다음에 다시 시도한다.
    writeJsonAtomic(legacyImportedPath(username), report);
    return report;
}

// 사용자 디렉터리를 준비하고(없으면 생성), 1회 이관을 시도한다.
function ensureUser(username) {
    assertValidUsername(username);
    fs.mkdirSync(charactersDirPath(username), { recursive: true });
    fs.mkdirSync(conversationsDirPath(username), { recursive: true });
    importLegacyIfNeeded(username);
}

// ---- 인물(캐릭터) ----

function listCharacters(username, opts) {
    ensureUser(username);
    const isAdmin = !!(opts && opts.isAdmin);
    const dir = charactersDirPath(username);
    let characters = safeReaddir(dir)
        .filter(e => e.isFile() && e.name.endsWith('.json'))
        .map(e => readCharacterDoc(path.join(dir, e.name)))
        .filter(Boolean);
    // 일반 계정에는 19금 인물을 감춘다
    if (!isAdmin) {
        characters = characters.filter(c => !isAdult19Character(c));
    }
    return characters;
}

function getCharacter(username, charId) {
    ensureUser(username);
    assertValidId(charId, 'charId');
    return readCharacterDoc(characterFilePath(username, charId));
}

// 전체 교체: 넘어온 배열을 새 목록으로 삼는다. id가 없는 항목은 새로 발급한다.
// isAdmin이 거짓이면 adult-19 인물은 저장을 거부한다. 단, 그 계정 눈에 애초에 보이지
// 않던 기존 19금 파일은 "교체 대상"에서 빼 지우지 않는다.
function saveCharacters(username, characters, opts) {
    ensureUser(username);
    if (!Array.isArray(characters)) {
        throw fail('INVALID', 'characters는 배열이어야 합니다.');
    }
    const isAdmin = !!(opts && opts.isAdmin);
    const dir = charactersDirPath(username);

    const existingById = {};
    for (const e of safeReaddir(dir)) {
        if (!e.isFile() || !e.name.endsWith('.json')) continue;
        const id = e.name.slice(0, -'.json'.length);
        const doc = readCharacterDoc(path.join(dir, e.name));
        if (doc) existingById[id] = doc;
    }
    const visibleExistingIds = new Set(
        Object.keys(existingById).filter(id => isAdmin || !isAdult19Character(existingById[id]))
    );

    const now = new Date().toISOString();
    const result = [];
    const keptIds = new Set();

    for (const c of characters) {
        if (!c || typeof c !== 'object') continue;
        if (!isAdmin && isAdult19Character(c)) continue;

        let id = c.id;
        if (id) {
            assertValidId(id, 'charId');
        } else {
            id = crypto.randomUUID();
        }
        const prev = existingById[id];
        const doc = { ...c, id };
        delete doc.savedSession; // 인물 파일에는 대화를 담지 않는다 — 대화는 대화 폴더에만 산다
        if (typeof doc.presetName !== 'string' || !doc.presetName) {
            doc.presetName = doc.charName;
        }
        doc.createdAt = (prev && prev.createdAt) || c.createdAt || now;
        doc.updatedAt = now;

        writeJsonAtomic(characterFilePath(username, id), doc);
        keptIds.add(id);
        result.push(doc);
    }

    for (const id of visibleExistingIds) {
        if (!keptIds.has(id)) {
            try {
                fs.unlinkSync(characterFilePath(username, id));
            } catch (err) {
                // 이미 없으면 무시
            }
        }
    }

    return result;
}

function deleteCharacter(username, charId) {
    ensureUser(username);
    assertValidId(charId, 'charId');
    const filePath = characterFilePath(username, charId);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
}

// ---- 대화 ----

function readMeta(username, convId) {
    return readJson(metaFilePath(username, convId), null);
}

// 대화 한 건의 겉정보(턴은 빼고)를 돌려준다. 없으면 null.
function getConversation(username, convId) {
    ensureUser(username);
    assertValidId(convId, 'convId');
    return readMeta(username, convId);
}

function requireMeta(username, convId) {
    assertValidId(convId, 'convId');
    const meta = readMeta(username, convId);
    if (!meta) {
        throw fail('NOT_FOUND', `대화를 찾을 수 없습니다: ${convId}`);
    }
    return meta;
}

// 각 대화의 작은 meta.json만 훑는다 — 따로 목록 파일(index.json)을 두지 않으므로,
// 목록이 실제와 어긋나는 문제가 원인째 없다.
function listConversationMetas(username) {
    const dir = conversationsDirPath(username);
    const metas = [];
    for (const e of safeReaddir(dir)) {
        if (!e.isDirectory()) continue;
        let meta;
        try {
            meta = readJson(path.join(dir, e.name, 'meta.json'), null);
        } catch (err) {
            console.warn(`[store] 대화 정보를 읽지 못했습니다(${username}/${e.name}):`, err.message);
            continue;
        }
        if (meta && meta.id) metas.push(meta);
    }
    return metas;
}

// 대화에 적어 두는 인물 이름. 화면이 그대로 보여주고 묶음 머리글로도 쓰므로 길이를 자른다.
function normalizeCharName(value) {
    if (typeof value !== 'string') return null;
    const name = value.trim();
    if (!name) return null;
    return name.length > 100 ? name.slice(0, 100) : name;
}

// 대화 목록(요약).
function listConversations(username) {
    ensureUser(username);
    const charNameById = new Map();
    const list = [];

    for (const meta of listConversationMetas(username)) {
        let charName = null;
        if (meta.charId) {
            if (!charNameById.has(meta.charId)) {
                const ch = readCharacterDoc(characterFilePath(username, meta.charId));
                charNameById.set(meta.charId, ch ? ch.charName : null);
            }
            charName = charNameById.get(meta.charId);
        }
        // 인물 번호가 없거나 그 인물이 지워졌으면 대화에 적어 둔 이름을 쓴다.
        if (!charName) charName = meta.charName || null;
        list.push({
            id: meta.id,
            title: meta.title,
            mode: meta.mode,
            charId: meta.charId || null,
            charName,
            createdAt: meta.createdAt,
            updatedAt: meta.updatedAt,
            // 수위는 목록 단계에서 감출지 정하는 데 쓰인다(19금 대화 가리기)
            chatLevel: meta.chatLevel || 'normal',
            // 옮겨온 대화라면 그때 붙인 이름표. 화면이 "이 옛 대화는 이미 옮겼는지"를
            // 이 값으로 알아본다 — 없으면 이미 옮긴 대화를 못 찾아 매번 다시 올리려 든다.
            importKey: meta.importKey || null,
            turnCount: meta.visibleTurns || 0
        });
    }

    list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return list;
}

function createConversation(username, opts) {
    ensureUser(username);
    const mode = opts && opts.mode;
    if (mode !== 'story' && mode !== 'chat') {
        throw fail('INVALID', `mode는 'story' 또는 'chat'이어야 합니다: ${mode}`);
    }
    let charId = opts && opts.charId ? opts.charId : null;
    let charName = null;
    if (charId) {
        assertValidId(charId, 'charId');
        const ch = getCharacter(username, charId);
        charName = ch ? ch.charName : null;
    }
    // 인물 목록에 저장하지 않고 이름만 적어 대화하는 경우가 있어 인물 번호가 없다.
    // 그때는 그 이름을 대화에 그대로 적어 둔다 — 이것이 없으면 "이 대화가 누구의 것인가"를
    // 제목으로 짐작하게 되고, 제목이 첫 마디로 바뀌는 순간 그 짐작이 무너진다.
    if (!charName) charName = normalizeCharName(opts && opts.charName);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const meta = {
        id,
        mode,
        charId,
        charName,
        title: (opts && opts.title) || charName || '새 대화',
        createdAt: now,
        updatedAt: now,
        visibleTurns: 0,
        affinityValue: 50,
        memoryList: [],
        chatLevel: (opts && opts.chatLevel) || 'normal',
        userName: (opts && opts.userName) || ''
    };
    fs.mkdirSync(conversationDirPath(username, id), { recursive: true });
    writeJsonAtomic(metaFilePath(username, id), meta);
    return meta;
}

// 브라우저에만 남아 있던 옛 대화를 서버로 한 번 올린다(1회 이사 전용).
// importKey는 그 대화를 가리키는 화면 쪽 이름표다. 같은 이름표가 이미 있으면 거부한다 —
// **덮어쓰기를 아예 없애서** "두 번 눌렀더니 대화가 사라졌다" 류의 사고를 원천 차단한다.
// 이어쓰기는 이 통로가 아니라 appendTurn으로만 한다.
function importConversation(username, opts) {
    ensureUser(username);
    const o = opts || {};
    if (typeof o.importKey !== 'string' || !o.importKey.trim() || o.importKey.length > 200) {
        throw fail('INVALID', 'importKey는 1~200자 문자열이어야 합니다.');
    }
    if (o.mode !== 'story' && o.mode !== 'chat') {
        throw fail('INVALID', `mode는 'story' 또는 'chat'이어야 합니다: ${o.mode}`);
    }
    if (!Array.isArray(o.turns)) {
        throw fail('INVALID', 'turns는 배열이어야 합니다.');
    }
    let charId = o.charId || null;
    let charName = null;
    if (charId) {
        assertValidId(charId, 'charId');
        const ch = getCharacter(username, charId);
        if (!ch) throw fail('NOT_FOUND', `인물을 찾을 수 없습니다: ${charId}`);
        charName = ch.charName;
    }
    if (!charName) charName = normalizeCharName(o.charName);

    const importKey = o.importKey.trim();
    const already = listConversationMetas(username).find(m => m.importKey === importKey);
    if (already) {
        throw fail('CONFLICT', `이미 옮긴 대화입니다: ${importKey}`);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const meta = {
        id,
        mode: o.mode,
        charId,
        charName,
        title: o.title || charName || '옮겨온 대화',
        createdAt: now,
        updatedAt: now,
        importKey,
        affinityValue: typeof o.affinityValue === 'number' ? o.affinityValue : 50,
        memoryList: Array.isArray(o.memoryList) ? o.memoryList : [],
        chatLevel: o.chatLevel || 'normal',
        userName: o.userName || ''
    };
    bulkWriteConversation(username, id, meta, o.turns, o.vectors);
    return { ...meta, visibleTurns: o.turns.length };
}

function deleteConversation(username, convId) {
    ensureUser(username);
    assertValidId(convId, 'convId');
    const dir = conversationDirPath(username, convId);
    if (!fs.existsSync(dir)) return false;
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
}

// meta에 담을 수 있는 값만 골라 덮어쓴다. 여기 없는 키는 조용히 버린다 — 화면이 보낸
// 아무 값이나 meta에 눌러앉지 않게 한다.
const META_PATCH_KEYS = ['title', 'affinityValue', 'memoryList', 'chatLevel', 'userName'];

function applyMetaPatch(meta, patch) {
    if (!patch || typeof patch !== 'object') return false;
    let changed = false;
    for (const key of META_PATCH_KEYS) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
            meta[key] = patch[key];
            changed = true;
        }
    }
    return changed;
}

function updateConversation(username, convId, patch) {
    ensureUser(username);
    const meta = requireMeta(username, convId);
    applyMetaPatch(meta, patch);
    meta.updatedAt = new Date().toISOString();
    writeJsonAtomic(metaFilePath(username, convId), meta);
    return meta;
}

// ---- 턴 이어붙이기 ----

// 화면이 "n번 턴을 붙여라"라고 직접 지목한다. 지금 몇 턴인지는 meta.visibleTurns가 답한다.
//   n < visibleTurns : 이미 받은 턴이다. 아무것도 하지 않는다(재전송·중복 클릭).
//   n = visibleTurns : 이어 붙인다.
//   n > visibleTurns : 사이에 구멍이 생긴다. 거부한다.
// 되돌린 뒤 다시 쓰는 경우도 이 규칙 하나로 처리된다 — 되돌리기가 visibleTurns를 k로
// 줄여놓았으므로, 새 턴의 번호 k가 곧 "이어 붙일 자리"가 되어 옛 줄을 덮는다.
function appendTurn(username, convId, n, turn, patch) {
    ensureUser(username);
    const meta = requireMeta(username, convId);

    if (!Number.isInteger(n) || n < 0) {
        throw fail('INVALID', `턴 번호는 0 이상의 정수여야 합니다: ${n}`);
    }
    if (turn === undefined || turn === null) {
        throw fail('INVALID', '턴 내용이 비어 있습니다.');
    }

    const expected = meta.visibleTurns || 0;
    if (n < expected) {
        return { applied: false, turnCount: expected, updatedAt: meta.updatedAt };
    }
    if (n > expected) {
        throw fail('INVALID', `턴 번호에 구멍이 있습니다: ${expected}번이 와야 하는데 ${n}번이 왔습니다.`);
    }

    appendLogLine(turnsFilePath(username, convId), { n, t: turn });

    // 줄을 먼저 쓰고 meta를 나중에 쓴다. 그 사이에 죽으면 visibleTurns가 아직 옛 값이라
    // 그 줄은 없는 셈이 되고, 다음에 같은 번호로 다시 오면 그 줄을 덮는다 — 손상이 아니라
    // 저절로 제자리로 돌아온다. 반대 순서였다면 있지도 않은 턴을 있다고 우기게 된다.
    meta.visibleTurns = n + 1;
    applyMetaPatch(meta, patch);
    meta.updatedAt = new Date().toISOString();
    writeJsonAtomic(metaFilePath(username, convId), meta);

    return { applied: true, turnCount: meta.visibleTurns, updatedAt: meta.updatedAt };
}

// 벡터는 턴을 **번호로** 가리킨다. 위치로 묶지 않으므로 빠져도 밀리지 않는다.
// 같은 번호가 다시 오면 뒤에 쓴 것이 이긴다 — 되돌린 뒤 새로 쓴 턴의 벡터가 옛 벡터를
// 덮어야 하기 때문이다. (같은 번호를 건너뛰면 새 턴에 옛 벡터가 붙어 조용히 어긋난다.)
function appendVector(username, convId, n, vector) {
    ensureUser(username);
    requireMeta(username, convId);
    if (!Number.isInteger(n) || n < 0) {
        throw fail('INVALID', `벡터 번호는 0 이상의 정수여야 합니다: ${n}`);
    }
    if (!Array.isArray(vector) || vector.length === 0) {
        throw fail('INVALID', 'vector는 비어 있지 않은 숫자 배열이어야 합니다.');
    }
    appendLogLine(vectorsFilePath(username, convId), { n, v: vector });
    return true;
}

// 보이는 턴(0 ~ visibleTurns-1)을 순서대로 돌려준다.
// 깨진 줄은 걸러지고, 같은 번호가 여럿이면 마지막에 쓴 것이 이긴다.
// 중간에 번호가 비면(있어서는 안 되는 일) 거기서 끊고 경고를 남긴다 — 빈 자리를 그대로
// 내보내면 AI에게 빈 턴이 그대로 흘러가기 때문이다.
function readTurns(username, convId) {
    ensureUser(username);
    const meta = requireMeta(username, convId);
    const byN = readLogMap(turnsFilePath(username, convId), 't');

    const visible = meta.visibleTurns || 0;
    const turns = [];
    for (let i = 0; i < visible; i++) {
        if (!byN.has(i)) {
            console.warn(`[store] 턴 기록에 구멍이 있습니다(${username}/${convId}): ${i}번이 없어 ${i}턴까지만 읽습니다.`);
            break;
        }
        turns.push(byN.get(i));
    }
    return turns;
}

// 보이는 범위의 벡터를 { 번호: 벡터 } 모양으로 돌려준다. 턴마다 있으리라는 보장은 없다
// (임베딩이 실패한 턴은 빠진다) — 번호로 가리키므로 빠져도 나머지가 밀리지 않는다.
function readVectors(username, convId) {
    ensureUser(username);
    const meta = requireMeta(username, convId);
    const byN = readLogMap(vectorsFilePath(username, convId), 'v');

    const visible = meta.visibleTurns || 0;
    const out = {};
    for (const [n, v] of byN) {
        if (n < visible && Array.isArray(v)) out[n] = v;
    }
    return out;
}

// 되돌리기·되돌리기 취소. 기록장은 그대로 두고 meta의 숫자 하나만 바꾼다.
// 올릴 수 있는 한도는 **기록장 마지막 줄 번호 + 1**이다. 되돌린 뒤 새 턴을 쓰면 그 뒤의
// 옛 줄들은 버려진 갈래가 되는데, 마지막 줄 기준이면 그 갈래로는 못 올라간다.
function setVisibleTurns(username, convId, k) {
    ensureUser(username);
    const meta = requireMeta(username, convId);
    if (!Number.isInteger(k) || k < 0) {
        throw fail('INVALID', `보이는 턴 수는 0 이상의 정수여야 합니다: ${k}`);
    }
    const limit = lastLoggedN(turnsFilePath(username, convId)) + 1;
    if (k > limit) {
        throw fail('INVALID', `기록에 없는 턴까지 되돌릴 수 없습니다: 최대 ${limit}, 요청 ${k}`);
    }
    meta.visibleTurns = k;
    meta.updatedAt = new Date().toISOString();
    writeJsonAtomic(metaFilePath(username, convId), meta);
    return meta;
}

// 기록장에서 지금 보이는 것만 남기고 다시 쓴다. 되돌리기로 감춘 줄·중복 줄·깨진 줄이
// 여기서 사라진다(=되돌리기 취소는 더 이상 안 된다). 임시 파일에 쓴 뒤 바꿔치기하므로
// 도중에 죽어도 원래 기록장은 그대로 남는다.
function compact(username, convId) {
    ensureUser(username);
    const meta = requireMeta(username, convId);
    const visible = meta.visibleTurns || 0;

    const turnsPath = turnsFilePath(username, convId);
    const vectorsPath = vectorsFilePath(username, convId);
    const beforeTurnLines = readLogLines(turnsPath).filter(l => l.trim()).length;
    const beforeVectorLines = readLogLines(vectorsPath).filter(l => l.trim()).length;

    const turnsByN = readLogMap(turnsPath, 't');
    const keptTurns = [];
    for (let i = 0; i < visible; i++) {
        if (!turnsByN.has(i)) break;
        keptTurns.push(JSON.stringify({ n: i, t: turnsByN.get(i) }));
    }
    writeTextAtomic(turnsPath, keptTurns.length ? keptTurns.join('\n') + '\n' : '');

    const vectorsByN = readLogMap(vectorsPath, 'v');
    const keptVectors = [];
    for (const [n, v] of [...vectorsByN.entries()].sort((a, b) => a[0] - b[0])) {
        if (n < keptTurns.length && Array.isArray(v)) keptVectors.push(JSON.stringify({ n, v }));
    }
    writeTextAtomic(vectorsPath, keptVectors.length ? keptVectors.join('\n') + '\n' : '');

    // 구멍 때문에 실제로 남은 턴이 더 적어졌다면 meta도 사실에 맞춘다.
    if (keptTurns.length !== visible) {
        meta.visibleTurns = keptTurns.length;
        meta.updatedAt = new Date().toISOString();
        writeJsonAtomic(metaFilePath(username, convId), meta);
    }

    return {
        turnLines: { before: beforeTurnLines, after: keptTurns.length },
        vectorLines: { before: beforeVectorLines, after: keptVectors.length }
    };
}

module.exports = {
    ensureUser,
    isAdult19Character,
    // 인물
    listCharacters,
    getCharacter,
    saveCharacters,
    deleteCharacter,
    // 대화
    listConversations,
    createConversation,
    importConversation,
    getConversation,
    updateConversation,
    deleteConversation,
    // 기록장
    appendTurn,
    appendVector,
    readTurns,
    readVectors,
    setVisibleTurns,
    compact,
    // 옛 데이터 이사 (ensureUser가 자동으로 부른다 — 검사·수동 실행용으로 열어둔다)
    importLegacyIfNeeded
};
