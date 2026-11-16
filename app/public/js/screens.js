// Menu screens. Each function renders into #screen and wires its buttons.
import * as ui from "./ui.js";
import { esc, fmtTime } from "./ui.js";
import { MODES, ALL, DIFFS, DIFF_LABEL } from "./contents.js";
import { KEY_ACTIONS, PAD_AXES, PAD_BUTTONS, RESERVED_KEY, keyLabel, padAxisLabel, padButtonLabel, defaultBindings } from "./input.js";

const assistLabel = (on) => (on ? "켜짐 (자동 자세 안정화)" : "꺼짐 (수동 안정화)");

export function loading(text, frac) {
  ui.screen(`<div class="wrap narrow"><div class="card"><div class="eyebrow">LOADING</div><h2>${esc(text)}</h2>
    <p class="muted">서울 도심형 비행 구역과 게임 화면을 불러오는 중입니다. 최초 실행 시 오프라인 비행에 필요한 데이터를 함께 내려받습니다.</p>
    <div class="progress"><div style="width:${Math.round(frac * 100)}%"></div></div></div></div>`);
}

export function unsupported() {
  ui.screen(`<div class="wrap narrow"><div class="card stack"><div class="eyebrow">지원되지 않는 그래픽 환경</div>
    <h2>이 브라우저에서는 3D 비행 구역을 표시할 수 없습니다</h2>
    <p class="lead">WebGL을 지원하는 최신 데스크톱 브라우저(Chrome, Edge, Firefox, Safari)에서 하드웨어 가속을 켠 뒤 다시 실행해 주세요. 구역 불러오기를 중단했습니다.</p>
    <div class="row"><button class="btn" data-act="reload">다시 확인</button></div></div></div>`, { reload: () => location.reload() });
}

export function loadFail(app, message) {
  ui.screen(`<div class="wrap narrow"><div class="card stack"><div class="eyebrow">불러오기 실패</div>
    <h2>비행 구역을 불러오지 못했습니다</h2>
    <p class="lead">네트워크 상태를 확인한 뒤 다시 시도해 주세요. 같은 구역을 다시 불러옵니다.</p>
    <p class="muted">${esc(message)}</p>
    <div class="row"><button class="btn primary" data-act="retry" autofocus>재시도</button></div></div></div>`, { retry: () => app.boot() });
}

export function hold(app, text) {
  ui.screen(`<div class="wrap narrow"><div class="card stack"><div class="eyebrow">게임 시작 보류</div>
    <h2>저장 데이터 확인이 필요합니다</h2><p class="lead">${esc(text)}</p>
    <div class="row"><button class="btn primary" data-act="again" autofocus>다시 확인</button></div></div></div>`, { again: () => app.loadProgress() });
}

export function menu(app) {
  const done = ALL.filter((id) => app.doneAny(id)).length;
  const status = app.isNew
    ? "저장된 진행 상태가 없어 새 게임으로 시작합니다. 게임을 시작하면 조작 튜토리얼이 먼저 진행됩니다."
    : `같은 브라우저에 저장된 진행 상태를 불러왔습니다 · 미션 완료 ${done}/${ALL.length} · 튜토리얼 ${app.save.tutorialDone ? "완료" : "미완료"}`;
  ui.screen(`<div class="wrap">
    <div class="eyebrow">SEOUL DRONE PILOT · 웹 드론 시뮬레이터</div>
    <h1>서울 <em>드론</em> 파일럿</h1>
    <p class="lead">서울 도심을 본뜬 가벼운 3D 구역에서 드론을 조종해 레이스, 짐 나르기, 전투, 탐색 비행 모드를 골라 즐기세요. 모드마다 미션과 세 가지 난이도가 있습니다. 설치 없이 키보드나 게임패드로 바로 플레이할 수 있습니다.</p>
    <div class="menu">
      <button class="btn primary" data-act="start" autofocus>게임 시작</button>
      <button class="btn" data-act="tutorial">튜토리얼</button>
      <button class="btn" data-act="settings">조작 설정</button>
      <button class="btn" data-act="records">개인 최고 기록</button>
    </div>
    <p class="muted">${esc(status)}</p>
  </div>`, {
    start: () => (app.isNew && !app.save.tutorialDone ? app.go("device", { next: "tutorialIntro" }) : app.go("content")),
    tutorial: () => (app.save.device ? app.go("tutorialIntro") : app.go("device", { next: "tutorialIntro" })),
    settings: () => app.go("settings", "menu"),
    records: () => app.go("records", "menu"),
  });
}

export function device(app, { next = "content" } = {}) {
  const pad = app.input.pad();
  const padState = !app.input.gamepadApi() ? "이 브라우저에서는 게임패드 지원 여부를 확인할 수 없습니다."
    : pad ? `표준 게임패드 연결됨: ${pad.id}`
      : app.input.unsupportedPad() ? "연결된 장치를 표준 게임패드로 인식하지 못했습니다 (지원되지 않는 장치)."
        : "아직 인식된 게임패드가 없습니다. 게임패드의 버튼을 한 번 누른 뒤 선택하세요.";
  ui.screen(`<div class="wrap">
    <div class="eyebrow">입력 장치 선택</div><h2>어떤 장치로 조종할까요?</h2>
    <p class="lead">선택한 장치에 맞춰 조작 안내를 표시합니다. 비행 중에는 키보드와 표준 게임패드 입력을 모두 받습니다.</p>
    <div class="two" style="margin-top:1rem">
      <button class="card option ${app.save.device === "keyboard" ? "sel" : ""}" data-act="pick" data-d="keyboard" autofocus>
        <h3>키보드</h3><p class="muted">방향키로 전후·좌우 이동, W/S로 상승·하강, A/D로 기체 회전, Shift + 방향키로 카메라.</p></button>
      <button class="card option ${app.save.device === "gamepad" ? "sel" : ""}" data-act="pick" data-d="gamepad">
        <h3>게임패드</h3><p class="muted">왼쪽 스틱으로 상승·하강과 회전, 오른쪽 스틱으로 수평 이동, LB + 오른쪽 스틱으로 카메라.</p>
        <p class="muted">${esc(padState)}</p></button>
    </div>
    <div class="row" style="margin-top:1rem"><button class="btn" data-act="back">메인 메뉴</button></div>
  </div>`, {
    pick: (d) => {
      if (d.d === "gamepad" && !app.input.pad()) {
        ui.toast(!app.input.gamepadApi() ? "이 브라우저에서는 게임패드를 확인할 수 없습니다. 키보드를 사용하세요."
          : app.input.unsupportedPad() ? "지원되지 않는 입력 장치입니다. 표준 게임패드나 키보드를 사용하세요."
            : "게임패드의 버튼을 한 번 누른 뒤 다시 선택하세요.", { kind: "error" });
        return device(app, { next });
      }
      app.setDevice(d.d);
      app.go(next);
    },
    back: () => app.go("menu"),
  });
}

export function tutorialIntro(app) {
  ui.screen(`<div class="wrap narrow"><div class="card stack">
    <div class="eyebrow">튜토리얼</div><h2>조작 튜토리얼</h2>
    <p class="lead">이동 → 회전 → 카메라 → 충돌 회피 → 콘텐츠 목표 순으로 5단계를 연습합니다. 각 단계의 필수 조작을 수행하면 다음 안내로 넘어가고, 실패하면 그 단계를 다시 연습합니다.</p>
    <p class="muted">입력 장치: ${app.save.device === "gamepad" ? "게임패드" : "키보드"} · 조작 보조: ${assistLabel(app.save.assist)}</p>
    <div class="row">
      <button class="btn primary" data-act="go" autofocus>튜토리얼 시작</button>
      <button class="btn" data-act="skip">건너뛰기</button>
      <button class="btn" data-act="assist">조작 보조 변경</button>
    </div></div></div>`, {
    go: () => app.startContent("tutorial"),
    skip: () => { app.isNew = false; app.go("content"); },
    assist: () => app.go("assist", "tutorialIntro"),
  });
}

export function tutorialDone(app) {
  ui.screen(`<div class="wrap narrow"><div class="card stack">
    <div class="eyebrow">튜토리얼 완료</div><h2 class="ok">튜토리얼을 마쳤습니다</h2>
    <p class="lead">필수 조작을 모두 수행했습니다. 이제 첫 레이스에 도전해 보세요.</p>
    ${app.saveError ? `<p class="bad">완료 여부를 저장하지 못했습니다. 저장을 재시도해 주세요.</p>` : `<p class="muted">완료 여부를 이 브라우저에 저장했습니다.</p>`}
    <div class="row">
      <button class="btn primary" data-act="race" autofocus>첫 레이스 시작</button>
      <button class="btn" data-act="content">모드 선택</button>
      ${app.saveError ? `<button class="btn" data-act="save">저장 재시도</button>` : ""}
    </div></div></div>`, {
    race: () => app.go("briefing", "race1"),
    content: () => app.go("content"),
    save: () => { app.persist(); tutorialDone(app); },
  });
}

const bestOf = (app, id, diff, assist = app.save.assist) => {
  const rec = app.save.records[id];
  return rec && rec.best && rec.best[(assist ? "on" : "off") + ":" + diff];
};
const bestLine = (app, id, diff) => {
  const b = bestOf(app, id, diff);
  return b && b.bestTime != null ? `개인 최고 ${fmtTime(b.bestTime)} · ${b.bestScore}점` : "개인 최고 기록 없음";
};
const curDiff = (app) => (DIFF_LABEL[app.save.diff] ? app.save.diff : "normal");

/** Mode select: every mode is open from the start and independent of the others. */
export function content(app) {
  const cards = MODES.map((m) => {
    const done = m.missions.filter((id) => app.doneAny(id)).length;
    return `<button class="card content-card" data-act="open" data-id="${m.id}">
      <div class="row"><span class="eyebrow">게임 모드</span><span class="chip ${done === m.missions.length ? "done" : "open"}">미션 ${done}/${m.missions.length} 완료</span></div>
      <h3>${esc(m.label)}</h3><p class="muted">${esc(m.desc)}</p>
      <p class="muted">${m.missions.map((id) => esc(app.contents[id].title)).join(" · ")}</p></button>`;
  }).join("");
  ui.screen(`<div class="wrap">
    <div class="eyebrow">모드 선택</div><h2>어떤 모드로 비행할까요?</h2>
    <p class="lead">모드는 서로 독립적이라 원하는 것부터 플레이할 수 있습니다. 각 모드 안에서 미션과 난이도(쉬움·보통·어려움)를 고릅니다.</p>
    <div class="grid" style="margin:1rem 0">${cards}</div>
    <div class="row">
      <button class="btn" data-act="assist">조작 보조: ${app.save.assist ? "켜짐" : "꺼짐"}</button>
      <button class="btn" data-act="settings">조작 설정</button>
      <button class="btn" data-act="records">개인 최고 기록</button>
      <button class="btn" data-act="tutorial">튜토리얼 ${app.save.tutorialDone ? "다시 하기" : ""}</button>
      <button class="btn" data-act="menu">메인 메뉴</button>
    </div></div>`, {
    open: (d) => app.go("mode", d.id),
    assist: () => app.go("assist", "content"),
    settings: () => app.go("settings", "content"),
    records: () => app.go("records", "content"),
    tutorial: () => (app.save.device ? app.go("tutorialIntro") : app.go("device", { next: "tutorialIntro" })),
    menu: () => app.go("menu"),
  });
}

/** Mission list of one mode. */
export function mode(app, modeId) {
  const m = MODES.find((x) => x.id === modeId) || MODES[0];
  const cards = m.missions.map((id, i) => {
    const def = app.contents[id];
    const chips = DIFFS.map(([d, label]) => `<span class="chip ${app.done(id, d) ? "done" : "lock"}">${label} ${app.done(id, d) ? "완료" : "미완료"}</span>`).join(" ");
    return `<button class="card content-card" data-act="open" data-id="${id}">
      <div class="row"><span class="eyebrow">${esc(m.label)} 미션 ${i + 1}</span></div>
      <h3>${esc(def.title)}</h3><p class="muted">${esc(def.summary)}</p>
      <div class="row">${chips}</div></button>`;
  }).join("");
  ui.screen(`<div class="wrap">
    <div class="eyebrow">${esc(m.label)} 모드</div><h2>미션을 고르세요</h2>
    <p class="lead">${esc(m.desc)} 모든 미션이 열려 있으며, 난이도는 다음 화면에서 고릅니다.</p>
    <div class="grid" style="margin:1rem 0">${cards}</div>
    <div class="row"><button class="btn" data-act="back">모드 선택</button></div></div>`, {
    open: (d) => app.go("briefing", d.id),
    back: () => app.go("content"),
  });
}

function routeMap(def) {
  if (!def.map) return "";
  const pts = def.map, P = (p) => `${p.x.toFixed(0)},${p.z.toFixed(0)}`;
  const roads = [-140, -80, 0, 80, 140].map((x) => `<line x1="${x}" y1="-200" x2="${x}" y2="107"/>`).join("") + [-140, -80, -20, 40, 100].map((z) => `<line x1="-200" y1="${z}" x2="200" y2="${z}"/>`).join("");
  const dots = pts.slice(1, -1).map((p, i) => `<circle cx="${p.x}" cy="${p.z}" r="7" fill="#ffd23f"/><text x="${p.x}" y="${p.z + 3.5}" font-size="10" text-anchor="middle" fill="#1b1304" font-weight="700">${i + 1}</text>`).join("");
  const a = pts[0], b = pts[pts.length - 1];
  return `<div><h3>경로 지도 (위쪽이 북쪽)</h3>
    <svg viewBox="-205 -205 410 410" role="img" aria-label="비행 구역 경로 지도" style="width:100%;max-width:320px;background:#1a2236;border-radius:12px;border:1px solid var(--line)">
      <rect x="-200" y="120" width="400" height="50" fill="#1b4468"/>
      <g stroke="#3a4560" stroke-width="5">${roads}</g>
      <polyline points="${pts.map(P).join(" ")}" fill="none" stroke="#ffb347" stroke-width="3" stroke-dasharray="7 5"/>
      ${dots}
      <circle cx="${a.x}" cy="${a.z}" r="8" fill="#3ddc84"/><rect x="${b.x - 7}" y="${b.z - 7}" width="14" height="14" fill="#3a86ff"/>
    </svg>
    <p class="muted">초록 원 = 출발 · 노란 번호 = 진행 순서 · 파란 사각형 = 마지막 지점</p></div>`;
}

export function briefing(app, id) {
  const def = app.contents[id];
  if (!def || !def.mode) return app.go("content");
  const d = curDiff(app);
  const lim = def.limit(d);
  ui.screen(`<div class="wrap narrow"><div class="card stack">
    <div class="eyebrow">${esc(def.typeLabel)} · 시작 전 안내</div><h2>${esc(def.title)}</h2>
    <div><h3>난이도</h3><div class="row">${DIFFS.map(([k, label]) => `<button class="btn small ${k === d ? "primary" : ""}" data-act="diff" data-d="${k}">${label}${app.done(id, k) ? " ✓" : ""}</button>`).join("")}</div></div>
    <div><h3>${def.combat ? "승리 조건" : "목표"}</h3><p>${esc(def.goal)}</p></div>
    <div><h3>${def.combat ? "적 드론 · 전투 구역 · 장비" : "규칙"}</h3><ul class="tight">${def.info(d).map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>
    <div><h3>${def.combat ? "패배 조건" : "실패 조건"}</h3><ul class="tight">${def.fails(d).map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>
    ${routeMap(def)}
    <div class="stat-grid">
      <div class="stat"><span>제한 시간 (${DIFF_LABEL[d]})</span><b>${lim ? lim + "초" : "없음"}</b></div>
      <div class="stat"><span>조작 보조 (기록 분리)</span><b style="font-size:1rem">${assistLabel(app.save.assist)}</b></div>
      <div class="stat"><span>${DIFF_LABEL[d]} · 보조 ${app.save.assist ? "켜짐" : "꺼짐"}</span><b style="font-size:1rem">${esc(bestLine(app, id, d))}</b></div>
    </div>
    <div class="row">
      <button class="btn primary" data-act="go" autofocus>${def.combat ? "전투 시작" : "비행 시작"}</button>
      <button class="btn" data-act="assist">조작 보조 변경</button>
      <button class="btn" data-act="back">미션 목록</button>
    </div></div></div>`, {
    diff: (x) => { app.setDiff(x.d); briefing(app, id); },
    go: () => app.startContent(id),
    assist: () => app.go("assist", "content"),
    back: () => app.go("mode", def.mode),
  });
}

export function assist(app, back = "content") {
  const on = app.save.assist;
  ui.screen(`<div class="wrap">
    <div class="eyebrow">조작 보조 수준</div><h2>조작 보조를 선택하세요</h2>
    <p class="lead">비행을 시작하기 전에만 바꿀 수 있습니다. 개인 기록은 보조 수준별로 따로 집계합니다. 현재 선택: <b>${on ? "보조 켜기" : "보조 끄기"}</b></p>
    <div class="two" style="margin-top:1rem">
      <button class="card option ${on ? "sel" : ""}" data-act="set" data-v="1" autofocus>
        <h3>보조 켜기 · 쉬운 설정 ${on ? "(선택됨)" : ""}</h3>
        <ul class="tight muted"><li>조작을 놓으면 앞뒤·좌우 기울기를 자동으로 점진 복원</li><li>수평 이동과 고도 변화가 빠르게 멈춰 제자리 비행이 쉬움</li><li>처음 드론을 조종하는 초보자에게 권장</li></ul></button>
      <button class="card option ${on ? "" : "sel"}" data-act="set" data-v="0">
        <h3>보조 끄기 ${on ? "" : "(선택됨)"}</h3>
        <ul class="tight muted"><li>기울기가 천천히 돌아와 조작을 놓아도 한동안 미끄러지듯 이동</li><li>감속을 직접 반대 입력으로 잡아야 해 숙련이 필요</li><li>최대 속도·가속·회전 속도 등 물리값은 동일</li></ul></button>
    </div>
    <div class="row" style="margin-top:1rem"><button class="btn" data-act="back">뒤로</button></div>
  </div>`, {
    set: (d) => {
      if (!app.setAssist(d.v === "1")) ui.toast("조작 보조 설정을 저장하지 못해 기존 설정을 유지합니다.", { kind: "error" });
      assist(app, back);
    },
    back: () => app.go(back),
  });
}

export function settings(app, back = "menu") {
  const b = app.bindings;
  const render = (waiting) => {
    const pad = app.input.pad();
    const padInfo = !app.input.gamepadApi() ? "이 브라우저에서는 게임패드 연결 여부를 확인할 수 없습니다."
      : pad ? `연결됨: ${pad.id}`
        : app.input.unsupportedPad() ? "지원되지 않는 장치가 연결되어 있습니다 (표준 게임패드로 인식되지 않음)."
          : "연결된 게임패드 없음 — 게임패드의 버튼을 한 번 누르면 인식됩니다.";
    const btn = (act, id, wait) => `<button class="btn small" data-act="${act}" data-id="${id}">${waiting === act + ":" + id ? wait : "변경"}</button>`;
    ui.screen(`<div class="wrap">
      <div class="eyebrow">조작 설정</div><h2>조작 배치 확인 및 변경</h2>
      <p class="lead">변경할 항목의 '변경'을 누른 뒤 원하는 키·버튼을 누르거나 스틱을 움직이세요. 변경한 배치는 즉시 적용되고 이 브라우저에 저장됩니다. 일시정지는 Esc / Start, 확인은 Enter / A로 고정입니다.</p>
      <div class="row" style="margin:0.8rem 0">
        <span class="muted">안내 기준 입력 장치:</span>
        <button class="btn small ${app.save.device !== "gamepad" ? "primary" : ""}" data-act="dev" data-d="keyboard">키보드</button>
        <button class="btn small ${app.save.device === "gamepad" ? "primary" : ""}" data-act="dev" data-d="gamepad">게임패드</button>
      </div>
      <div class="two">
        <div class="card"><h3>키보드</h3><table><tr><th>조작</th><th>현재 키</th><th></th></tr>
          ${KEY_ACTIONS.map(([id, label]) => `<tr><td>${label}</td><td><kbd>${esc(keyLabel(b.keys[id]))}</kbd></td><td>${btn("key", id, "키 입력 대기… (Esc 취소)")}</td></tr>`).join("")}
        </table></div>
        <div class="card"><h3>게임패드</h3><p class="muted">${esc(padInfo)}</p><table><tr><th>조작</th><th>현재 배치</th><th></th></tr>
          ${PAD_AXES.map(([id, label, dir]) => `<tr><td>${label}</td><td><kbd>${esc(padAxisLabel(b.pad.axes[id]))}</kbd></td><td>${btn("axis", id, `스틱을 ${dir}쪽으로 미세요…`)}</td></tr>`).join("")}
          ${PAD_BUTTONS.map(([id, label]) => `<tr><td>${label}</td><td><kbd>${esc(padButtonLabel(b.pad.buttons[id]))}</kbd></td><td>${btn("pbtn", id, "버튼 입력 대기…")}</td></tr>`).join("")}
        </table></div>
      </div>
      <div class="row" style="margin-top:1rem">
        <button class="btn" data-act="reset">기본 배치로 복원</button>
        <button class="btn primary" data-act="back">완료</button>
      </div></div>`, handlers);
  };
  const commit = (apply, revert) => {
    apply();
    if (!app.saveBindings()) { revert(); ui.toast("조작 배치를 저장하지 못해 기존 배치를 유지합니다.", { kind: "error" }); }
    else ui.toast("변경한 배치를 저장하고 즉시 적용했습니다.", { kind: "ok", ms: 1800 });
    render();
  };
  const dupModal = (what, other) => {
    ui.modal({ title: "중복 배정 차단", body: `${what}은(는) 이미 '${esc(other)}'에 배정되어 있습니다. 다른 입력을 선택하세요.`, buttons: [{ label: "확인", primary: true }] });
    render();
  };
  const needPad = () => {
    if (app.input.pad()) return true;
    ui.toast("게임패드를 연결하고 버튼을 한 번 누른 뒤 변경하세요.", { kind: "error" });
    return false;
  };
  const handlers = {
    key: ({ id }) => {
      render("key:" + id);
      app.input.captureKey((code) => {
        if (code === "Escape") return render();
        if (RESERVED_KEY.test(code)) { ui.toast("브라우저·운영체제가 사용하는 키와 Esc·Enter는 배정할 수 없습니다.", { kind: "error" }); return render(); }
        const dup = KEY_ACTIONS.find(([a]) => a !== id && b.keys[a] === code);
        if (dup) return dupModal(`<kbd>${esc(keyLabel(code))}</kbd> 키`, dup[1]);
        const old = b.keys[id];
        commit(() => { b.keys[id] = code; }, () => { b.keys[id] = old; });
      });
    },
    axis: ({ id }) => {
      app.input.cancelCapture();
      if (!needPad()) return render();
      render("axis:" + id);
      app.input.capturePad("axis", ({ i, raw }) => {
        const dup = PAD_AXES.find(([a]) => a !== id && b.pad.axes[a].i === i);
        if (dup) return dupModal(`<kbd>${esc(padAxisLabel({ i, inv: false }))}</kbd>`, dup[1]);
        const old = b.pad.axes[id];
        commit(() => { b.pad.axes[id] = { i, inv: raw < 0 }; }, () => { b.pad.axes[id] = old; });
      });
    },
    pbtn: ({ id }) => {
      app.input.cancelCapture();
      if (!needPad()) return render();
      render("pbtn:" + id);
      app.input.capturePad("button", (i) => {
        if (i === 9 || i === 0) { ui.toast("Start와 A 버튼은 일시정지·확인 전용입니다.", { kind: "error" }); return render(); }
        const dup = PAD_BUTTONS.find(([a]) => a !== id && b.pad.buttons[a] === i);
        if (dup) return dupModal(`<kbd>${esc(padButtonLabel(i))}</kbd> 버튼`, dup[1]);
        const old = b.pad.buttons[id];
        commit(() => { b.pad.buttons[id] = i; }, () => { b.pad.buttons[id] = old; });
      });
    },
    reset: () => {
      app.input.cancelCapture();
      const old = JSON.parse(JSON.stringify(b)), d = defaultBindings();
      commit(() => { Object.assign(b.keys, d.keys); b.pad.axes = d.pad.axes; b.pad.buttons = d.pad.buttons; },
        () => { Object.assign(b.keys, old.keys); b.pad.axes = old.pad.axes; b.pad.buttons = old.pad.buttons; });
    },
    dev: ({ d }) => {
      app.input.cancelCapture();
      if (d === "gamepad" && !app.input.pad()) ui.toast("인식된 표준 게임패드가 없습니다. 버튼을 한 번 누른 뒤 다시 선택하세요.", { kind: "error" });
      else app.setDevice(d);
      render();
    },
    back: () => { app.input.cancelCapture(); app.go(back); },
  };
  render();
}

export function records(app, back = "content") {
  const cell = (id, d) => ["on", "off"].map((a) => {
    const b = bestOf(app, id, d, a === "on");
    return `<span class="muted">보조 ${a === "on" ? "켜짐" : "꺼짐"}</span> ${b && b.bestTime != null ? `${fmtTime(b.bestTime)} · ${b.bestScore}점` : "—"}`;
  }).join("<br>");
  const rows = MODES.map((m) => `<tr><th colspan="5">${esc(m.label)}</th></tr>` + m.missions.map((id) => {
    const def = app.contents[id], rec = app.save.records[id];
    const lastTxt = rec && rec.last ? `<span class="${rec.last.success ? "ok" : "bad"}">${rec.last.success ? "성공" : "실패"}</span> · ${fmtTime(rec.last.timeMs)} · ${rec.last.score}점<br><span class="muted">시도 #${rec.last.attempt} · ${DIFF_LABEL[rec.last.diff] || "보통"} · 충돌 ${rec.last.collisions}회</span>` : `<span class="muted">시도 기록 없음</span>`;
    return `<tr><td><b>${esc(def.title)}</b>${rec ? `<br><span class="muted">총 ${rec.attempts}회 시도</span>` : ""}</td>${DIFFS.map(([d]) => `<td>${cell(id, d)}</td>`).join("")}<td>${lastTxt}</td></tr>`;
  }).join("")).join("");
  ui.screen(`<div class="wrap">
    <div class="eyebrow">개인 최고 기록</div><h2>모드·미션·난이도별 최고 기록</h2>
    <p class="lead">최단 완료 시간과 최고 점수를 각각 보관하며, 난이도와 조작 보조 수준별로 분리합니다. 기록은 이 브라우저에만 저장됩니다 (온라인 순위표 없음).</p>
    <div class="card" style="margin:1rem 0; overflow:auto"><table>
      <tr><th>미션</th><th>쉬움</th><th>보통</th><th>어려움</th><th>최근 시도</th></tr>${rows}</table></div>
    <div class="row"><button class="btn primary" data-act="back" autofocus>뒤로</button></div></div>`, { back: () => app.go(back) });
}

export function result(app, r) {
  const def = r.def;
  const m = MODES.find((x) => x.id === def.mode);
  const nextId = m.missions[m.missions.indexOf(r.id) + 1];
  const harder = { easy: "normal", normal: "hard" }[r.diff];
  let nextLine;
  if (!r.success) nextLine = "실패해도 이전 진행 데이터는 그대로 유지됩니다. 바로 재도전할 수 있습니다.";
  else if (nextId) nextLine = `${m.label} 모드의 다음 미션: ${app.contents[nextId].title}`;
  else nextLine = `${m.label} 모드의 마지막 미션을 완료했습니다${harder ? " — 더 높은 난이도에 도전해 보세요." : "!"}`;
  const best = r.best || {};
  const bestTxt = best.bestTime != null ? `최단 시간 ${fmtTime(best.bestTime)}${r.newBestTime ? " (신기록!)" : ""} · 최고 점수 ${best.bestScore}점${r.newBestScore ? " (신기록!)" : ""}` : "개인 최고 기록 없음 — 완료하면 기록됩니다.";
  const prev = r.prev ? `시도 #${r.prev.attempt} (${DIFF_LABEL[r.prev.diff] || "보통"}): ${r.prev.success ? "성공" : "실패"} · ${fmtTime(r.prev.timeMs)} · ${r.prev.score}점 · 충돌 ${r.prev.collisions}회` : "이전 시도 없음";
  ui.screen(`<div class="wrap narrow"><div class="card stack">
    <div class="eyebrow">${esc(def.typeLabel)} · ${esc(def.title)} · 난이도 ${DIFF_LABEL[r.diff]} · 시도 #${r.attempt}</div>
    <div class="big-status ${r.success ? "ok" : "bad"}">${r.success ? (def.combat ? "승리" : "성공") : (def.combat ? "패배" : "실패")}</div>
    <p class="lead">${esc(r.reason)}</p>
    <div class="stat-grid">
      <div class="stat"><span>${r.success ? "완료 시간" : "경과 시간"}</span><b>${fmtTime(r.timeMs)}</b></div>
      <div class="stat"><span>점수</span><b>${r.score}</b></div>
      <div class="stat"><span>충돌 횟수</span><b>${r.collisions}</b></div>
      <div class="stat"><span>결과 상태</span><b class="${r.success ? "ok" : "bad"}">${r.success ? "성공" : "실패"}</b></div>
    </div>
    <div><h3>개인 최고 (${DIFF_LABEL[r.diff]} · 보조 ${r.assist ? "켜짐" : "꺼짐"})</h3><p>${esc(bestTxt)}</p></div>
    <div><h3>이전 시도</h3><p class="muted">${esc(prev)}</p></div>
    <p>${esc(nextLine)}</p>
    ${app.saveError ? `<p class="bad">결과를 저장하지 못했습니다. 결과는 이 화면에서 확인할 수 있으며, 저장을 재시도할 수 있습니다.</p>` : ""}
    <div class="row">
      <button class="btn ${r.success && nextId ? "" : "primary"}" data-act="retry" ${r.success && nextId ? "" : "autofocus"}>재도전</button>
      ${r.success && nextId ? `<button class="btn primary" data-act="next" autofocus>다음 미션</button>` : ""}
      ${r.success && harder ? `<button class="btn" data-act="harder">난이도 올리기 (${DIFF_LABEL[harder]})</button>` : ""}
      <button class="btn" data-act="list">미션 목록</button>
      <button class="btn" data-act="content">모드 선택</button>
      <button class="btn" data-act="records">개인 최고 기록</button>
      ${app.saveError ? `<button class="btn" data-act="save">저장 재시도</button>` : ""}
    </div></div></div>`, {
    retry: () => app.startContent(r.id),
    next: () => app.go("briefing", nextId),
    harder: () => { app.setDiff(harder); app.go("briefing", r.id); },
    list: () => app.go("mode", def.mode),
    content: () => app.go("content"),
    records: () => app.go("records", "content"),
    save: () => { app.persist(); result(app, r); },
  });
}
