// =====================
// Storage / State
// =====================
const STORAGE_KEY = "vnotion:pro:final:v1";

const defaultDocs = [
  {
    id: "welcome",
    title: "Welcome",
    icon: "📄",
    parentId: null,
    content: "<p>첫 문서: 좌측 트리에서 추가/삭제/정렬을 연습하세요.</p>",
    starred: false,
    order: 0,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 3600000,
  },
  {
    id: "guides",
    title: "Guides",
    icon: "",
    parentId: null,
    content:
      "<h2>Guide Index</h2><ul><li>Project Setup</li><li>Performance</li></ul>",
    starred: true,
    order: 1,
    createdAt: Date.now() - 84000000,
    updatedAt: Date.now() - 4200000,
  },
  {
    id: "setup",
    title: "Project Setup",
    icon: "🧰",
    parentId: "guides",
    content:
      "<h1>Setup</h1><p>npm, bundler, dev server… (이 예제는 Vanilla JS!)</p>",
    starred: false,
    order: 0,
    createdAt: Date.now() - 82000000,
    updatedAt: Date.now() - 4000000,
  },
  {
    id: "perf",
    title: "Performance",
    icon: "",
    parentId: "guides",
    content: "<p>CRP, LCP/FCP, 이미지/폰트 최적화 아이디어</p>",
    starred: false,
    order: 1,
    createdAt: Date.now() - 80000000,
    updatedAt: Date.now() - 3800000,
  },
];

const state = {
  docs: [],
  trash: [],
  expanded: {}, //sidebar에서 펼친 트리상태 저장
  activeId: null, //현재 표시 문서 id, 라우팅시 갱신됨
  isMobile: matchMedia("(max-width:768px)").matches,
};

// =====================
// Persistence & helpers (영속화 + 유틸)
// =====================
// 새로 고침 후에도 문서가 사라지지 않고 유지 => localStorage 이용
function load() {
  try {
    // 1. 문자열 불러오기
    const raw = localStorage.getItem(STORAGE_KEY);
    // 저장된 문서가 없다면
    if (!raw) {
      state.docs = defaultDocs.slice();
      state.trash = [];
      return;
    }
    // 2. 저장된 문서가 있다면 => JSON Parsing
    const data = JSON.parse(raw);
    // 3. 파싱된 데이터 -> docs, trash, expanded, activeId 각각 꺼내서 state반영
    // 복구 범위 : 문서 + 휴지통 + 펼침상태(expanded) + 마지막 활성 문서(activeId)
    state.docs = data.docs || defaultDocs.slice();
    state.trash = data.trash || [];
    state.expanded = data.expanded || {};
    state.activeId = data.activeId || null;
  } catch (e) {
    // 4. JSON 파싱 실패 -> 예외처리 동작
    console.warn("Failed to load, using defaults", e);
    state.docs = defaultDocs.slice();
    state.trash = [];
  }
}

// 전체 스냅샷 저장
function save() {
  const data = {
    docs: state.docs,
    trash: state.trash,
    expanded: state.expanded,
    activeId: state.activeId,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// 새 문서에 부여할 고유 문자열 id 생성
function uid() {
  // 0~1사이 난수 반환 -> 36진수(0-9+a-z) 변환 -> 불필요한 0과 소수점 제거 후 9자리 반환
  return Math.random().toString(36).slice(2, 11);
}

// -------------추가 / 정렬 -----------------
// 트리노드에서 특정 부모 id의 자식 문서 배열 반환
function childrenOf(pid) {
  return state.docs
    .filter((d) => d.parentId === pid)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  // 순서 정렬 : 오름차순 -> 가나다, 알파벳 순
}

// 부모 아래 새 문서 추가시 새 문서의 order값 계산하여 부여
function maxOrder(pid) {
  const kids = childrenOf(pid);
  return kids.length ? Math.max(...kids.map((k) => k.order)) + 1 : 0;
}

// --------------접근 / 확인 -------------------
function findDoc(id) {
  return state.docs.find((d) => d.id === id);
  //   Array.find() : 조건에 맞는 첫 번째 요소만 반환
}

function existsInDocs(id) {
  return !!findDoc(id);
  //   !!연산자 : 값을 boolean으로 강제 변환
  //   문서 찾음 -> 객체 반환 -> truthy -> !! -> true
  // 문서 못 찾음 -> undefined -> falsy -> !! -> false
}

// -------------- 보호 장치 --------------------
// 자식문서인지 확인
function isDescendant(id, maybeAncestorId) {
  if (!id || !maybeAncestorId) return false;
  let cur = findDoc(id);
  while (cur && cur.parentId) {
    if (cur.parentId === maybeAncestorId) return true;
    cur = findDoc(cur.parentId);
  }
  return false;
}

function createDoc({ title = "Untitled", parentId = null, afterId = null }) {
  const id = uid();
  //   순서 : 기본값은 맨 뒤
  let order = maxOrder(parentId);
  //   끼워넣기
  if (afterId) {
    const sibs = childrenOf(parentId);
    const idx = sibs.findIndex((s) => s.id === afterId);
    order = idx >= 0 ? sibs[idx].order + 0.5 : order;
  }
  const doc = {
    id,
    title,
    icon: "",
    parentId,
    content: "",
    starred: false,
    order,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  state.docs.push(doc);
  normalizeOrders(parentId); //정수 재정렬(0, 1, 2,,,)
  save();
  return id;
}

function updateDoc(id, patch) {
  const d = findDoc(id);
  if (!d) return;
  Object.assign(d, patch, { updatedAt: Date.now() });
  save();
}

// 휴지통으로 옮기기
function archiveDoc(id) {
  // descendantsOf(id) : 문서의 모든 자손 수집(깊이 우선)
  const toArchive = [id, ...descendantsOf(id).map((d) => d.id)];
  toArchive.forEach((did) => {
    const idx = state.docs.findIndex((x) => x.id === did);
    if (idx > -1) {
      // 원래 부모를 보존해 두어 복원시 참조
      state.docs[idx].__origParentId = state.docs[idx].parentId ?? null;
      state.trash.push(state.docs[idx]);
      state.docs.splice(idx, 1);
    }
  });
  save();
}

// 휴지통에서 복원하기
function restoreDoc(id) {
  const idx = state.trash.findIndex((d) => d.id === id);
  if (idx === -1) return;
  const doc = state.trash[idx];
  state.trash.splice(idx, 1);

  const desiredParentId =
    doc.__origParentId !== undefined ? doc.__origParentId : doc.parentId;

  if (desiredParentId && !existsInDocs(desiredParentId)) {
    // 부모가 아직 휴지통이면 root에 복원 + orphan플래그
    doc.parentId = null;
    doc.__restoredOrphan = true;
    doc.__origParentId = desiredParentId;
    toast("부모가 휴지통에 있어 루트로 복원되었습니다.", "success");
  } else {
    doc.parentId = desiredParentId ?? null;
    delete doc.__restoredOrphan;
  }

  state.docs.push(doc);
  normalizeOrders(doc.parentId);
  //  해당 문서가 부모문서일 경우 자식문서들 재부착
  reattachOrphansFor(doc.id);
  save();
}

// 휴지통에서 영구삭제
function removeDoc(id) {
  const targetIds = new Set([id, ...descendantsOf(id).map((d) => d.id)]);
  for (let i = state.trash.length - 1; i >= 0; i--) {
    if (targetIds.has(state.trash[i].id)) state.trash.splice(i, 1);
  }
  save();
}

// 문서 이동(단일 분기, 단일 진입점)
function moveDoc(srcId, targetId, pos) {
  // 초기 가드 : 이동불가 상황을 조용히 차단 (소스 or 타겟누락, self-drop의 경우)
  if (!srcId || !targetId || srcId === targetId) return;
  //   부모를 자신의 하위문서로 넣을 수 없음
  if (isDescendant(targetId, srcId)) return;

  //  문서 확보
  const src = findDoc(srcId);
  const tgt = findDoc(targetId);
  if (!src || !tgt) return;

  if (pos === "inside") {
    // 부모를 바꾸고 맨 뒤로 이동
    const oldParent = src.parentId;
    src.parentId = tgt.id;
    src.order = maxOrder(tgt.id);
    // 양쪽 정규화 -> 렌더 순서 안정, 데이터 무결성 유지
    normalizeOrders(oldParent);
    normalizeOrders(tgt.id);
  } else {
    // 같은 부모에서 위/아래로 이동
    const newParent = tgt.parentId ?? null;
    const oldParent = src.parentId;
    src.parentId = newParent;

    src.order = pos === "before" ? tgt.order - 0.5 : tgt.order + 0.5;
    normalizeOrders(newParent);
    normalizeOrders(oldParent);
  }
  //   메타영역갱신(암묵적 계약)
  src.updatedAt = Date.now();
  //   전체 스냅샷 저장 -> 일관성 보장
  save();
}

// 정수 정리
function normalizeOrders(pid) {
  const list = childrenOf(pid);
  list.forEach((d, i) => {
    d.order = i;
  });
}

// 모든 자손을 수집(깊이우선_DFS)(ex. 휴지통, 이동, 영구삭제 등)
function descendantsOf(id) {
  const res = [];
  const walk = (pid) => {
    state.docs
      .filter((d) => d.parentId === pid)
      .forEach((c) => {
        res.push(c);
        walk(c.id);
      });
  };
  walk(id);
  return res;
}

// 부모 복원시 __restoredOrphan들을 자동으로 재부착
function reattachOrphansFor(parentId) {
  let changed = false;
  state.docs.forEach((d) => {
    if (d.__restoredOrphan && d.__origParentId === parentId) {
      d.parentId = parentId;
      delete d.__restoredOrphan;
      changed = true;
    }
  });
  if (changed) {
    normalizeOrders(parentId);
  }
}

// =====================
// DOM helpers & UI
// =====================
// 보조 역할, 코드 전체의 가독성과 유지보수의 기반층 확립
// 보통 유틸이나 헬퍼로 분리해서 관리
// DOM 단축 선택자
// 1. $ (단일 선택자) : 문서에서 첫번째 일치 요소를 반환
const $ = (sel) => document.querySelector(sel);
// 2. $$ (다중 선택자) : 모든 일치 요소를 배열로 반환
// querySelectorAll은 NodeList를 반환 -> Array.from으로 감싸서 배열화
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// DOM 요소를 새로 만들 때 필요한 반복 패턴을 줄여주는 함수
function el(tag, opts = {}) {
  const e = document.createElement(tag);
  Object.assign(e, opts);
  return e;
}

function toast(msg, type = "") {
  const wrap = $("#toasts");
  if (!wrap) return;
  const t = el("div", { className: `toast ${type}` });
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => {
    // 1. 1.8초 동안 메시지 노출 -> opacity=0 서서히 fade-out
    t.style.opacity = "0";
    // 2. + 0.2s -> 실제 DOM에서 제거(메모리, 레이아웃 정리)
    setTimeout(() => t.remove(), 200);
  }, 1800);
}

// 날짜 포맷 헬퍼
function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString(); //브라우저의 자동 지역화
}

// Layout refs : 자주쓰는 DOM 요소 캐시
const sidebar = $("#sidebar");
const collapseBtn = $("#collapseBtn");
const resizeHandle = $("#resizeHandle");
const menuBtn = $("#menuBtn");
const sidebarPeekBtn = $("#sidebarPeekBtn");
const docListRoot = $("#docListRoot");
const breadcrumbs = $("#breadcrumbs");
const starBtn = $("#starBtn");
const newChildBtn = $("#newChildBtn");

// =====================
// Render: Trees (사이드바 문서 트리 렌더링)
// =====================
// 전체 sidebar 갱신 진입점
// : 내부 호출을 증설해 확장할 수 있음. 외부에서는 renderTrees()만 호출하면 됨.
//  => interface 안정성 향상
function renderTrees() {
  renderTree();
  renderFavorites();
}

function renderTree() {
  if (!docListRoot) return;
  docListRoot.innerHTML = "";
  const roots = childrenOf(null);
  if (roots.length === 0) {
    const p = el("p", {
      className: "muted",
      textContent: "No pages available",
    });
    docListRoot.appendChild(p);
  }
  roots.forEach((d) => docListRoot.appendChild(renderNode(d, 0)));
}

function renderNode(doc, level) {
  const wrap = el("div");
  const row = el("div", { className: "tree-row", draggable: true });
  row.dataset.id = doc.id;
  if (state.activeId === doc.id) row.classList.add("active");
  row.style.paddingLeft = 12 + level * 12 + "px";

  const caretBtn = el("div", { className: "caret", title: "Expand/collapse" });
  const hasChildren = childrenOf(doc.id).length > 0;
  caretBtn.textContent = hasChildren
    ? state.expanded[doc.id]
      ? "▾"
      : "▸"
    : "";
  if (hasChildren) {
    caretBtn.addEventListener("click", (e) => {
      // 이벤트 전파 차단 -> 두 동작이 충돌하지 않고 독립적으로 동작
      e.stopPropagation();
      state.expanded[doc.id] = !state.expanded[doc.id];
      renderTrees();
    });
  }

  const iconCls = "doc-icon " + (doc.icon ? "has-icon" : "no-icon");
  const icon = el("div", {
    className: iconCls,
    textContent: doc.icon ? doc.icon : "∅",
  });
  const labelCls = "label " + (doc.icon ? "has-icon" : "no-icon");
  const label = el("div", {
    className: labelCls,
    textContent: doc.title,
    style: "flex:1 1 auto; min-width:0;",
  });
  label.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    inlineRename(doc.id, label);
  });

  // 자식문서 추가
  const actions = el("div", { className: "tree-actions" });
  const addBtn = el("div", {
    className: "icon-btn ghost",
    title: "Add child",
    textContent: "＋",
  });
  addBtn.addEventListener("click", (e) => {
    // 이벤트 전파 차단(행 전체 클릭 방지)
    e.stopPropagation();
    // 하나의 일관된 파이프 라인
    //   1. 상태 갱신
    // 새 문서 생성
    const id = createDoc({ title: "Untitled", parentId: doc.id });
    // 2. renderTrees()가 사이드바 UI에 즉시 반영 => 부모문서가 펼쳐짐
    state.expanded[doc.id] = true;
    toast("New note created!", "success");
    // 3. 라우터를 통해 본문 즉시 갱신
    navigateTo(id);
  });

  // 더보기 메뉴 호출
  const ddBtn = el("div", {
    className: "dropdown-btn ghost",
    title: "More",
    textContent: "⋯",
  });
  ddBtn.addEventListener("click", (e) => {
    // 이벤트 전파 차단(행 전체 클릭 방지)
    e.stopPropagation();
    // 버튼위치 기준, 작은 드롭다운 오픈
    openDropdownMenu(ddBtn, doc, label);
  });
  // 컨테이너에 두 버튼 추가
  actions.append(ddBtn, addBtn);
  // 컨테이너를 행에 부착
  row.append(caretBtn, icon, label, actions);

  row.addEventListener("click", () => navigateTo(doc.id));

  // DnD(Drag N Drop)
  //   이벤트 순서 : dragstart -> dragover -> dragleave -> drop -> dragend
  row.addEventListener("dragstart", handleDragStart);
  row.addEventListener("dragover", handleDragOver);
  row.addEventListener("dragleave", handleDragLeave);
  row.addEventListener("drop", handleDrop);
  row.addEventListener("dragend", handleDragEnd);

  // 현재 행을 wrap에 추가
  wrap.append(row);

  //   펼쳐진 상태 -> 자식 렌더링
  if (state.expanded[doc.id]) {
    // 자식 컨테이너 생성
    const kidsWrap = el("div", { className: "children" });
    // 자식 목록
    childrenOf(doc.id).forEach((ch) =>
      // 각 자식 호출
      kidsWrap.appendChild(renderNode(ch, level + 1))
    );
    wrap.append(kidsWrap);
  }
  return wrap;
}

// DnD handlers
let dragSrcId = null;
function handleDragStart(e) {
  // 현재 드래그하고 있는 문서의 id
  dragSrcId = this.dataset.id;
  //   브라우저에게 "이동" 동작 알림
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragSrcId);
}

// 드래그 중 임의의 행 위에 올라왔을 때 실행
function handleDragOver(e) {
  // e.preventDefault()를 호출(필수)해야 브라우저가 드롭을 허용
  e.preventDefault();
  //   마우스가 행 어느 높이에 있는지 계산 -> 드롭 위치를 직관적으로 파악 가능
  const rect = this.getBoundingClientRect();
  const y = e.clientY - rect.top;
  this.classList.remove("dragover-top", "dragover-bottom", "dragover-inside");
  if (y < rect.height * 0.25) {
    this.classList.add("dragover-top");
  } else if (y > rect.height * 0.75) {
    this.classList.add("dragover-bottom");
  } else {
    this.classList.add("dragover-inside");
  }
}

// 마우스가 행을 벗어날 때 실행 (시각적 힌트 제거)
function handleDragLeave() {
  this.classList.remove("dragover-top", "dragover-bottom", "dragover-inside");
}

// 마우스를 놓는 순간 실행
function handleDrop(e) {
  e.preventDefault(); // -> 드롭 허용
  const targetId = this.dataset.id; // 드롭된 행 id
  const rect = this.getBoundingClientRect();
  const y = e.clientY - rect.top;
  let pos = "inside";
  if (y < rect.height * 0.25) pos = "before";
  else if (y > rect.height * 0.75) pos = "after";
  moveDoc(dragSrcId, targetId, pos); // 실제 데이터 이동
  this.classList.remove("dragover-top", "dragover-bottom", "dragover-inside"); // 드롭 가이드 제거
  renderTrees(); //전체 재렌더
}

// 드래그 종료 시 실행(성공/취소 모두)
function handleDragEnd() {
  // 모든 행의 드래그 가이드 제거
  $$(".tree-row").forEach((r) =>
    r.classList.remove("dragover-top", "dragover-bottom", "dragover-inside")
  );
  //   dragSrcId 초기화
  dragSrcId = null;
}

// 입력: 바꾸려는 문서의 id + 라벨 DOM요소
function inlineRename(id, labelEl) {
  // 문서찾기
  const doc = findDoc(id);
  // 문서를 찾지 못하면 조기종료
  if (!doc) return;
  // 문서를 찾은 경우 -> 라벨을 입력창으로 교체하여 즉시 편집 가능
  const input = el("input", { value: doc.title, className: "label-edit" });
  // 입력창 클릭 이벤트 전파 차단(트리 토글 오작동 방지)
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    }
    // 입력값을 원래 제목으로 되돌림
    if (e.key === "Escape") {
      e.preventDefault();
      input.value = doc.title;
      input.blur();
    }
  });
  input.addEventListener("blur", () => {
    const title = input.value.trim() || "Untitled";
    updateDoc(id, { title }); //사이드바 전체 재렌더
    renderTrees();
    // 활성 문서인 경우 -> 메타 영역도 동기화
    if (state.activeId === id) {
      $("#titleInput").value = title;
      updateDocMeta();
    }
  });
  labelEl.replaceWith(input);
  input.focus();
  input.select();
}

// =====================
// Editor / Toolbar (콘텐츠 편집 및 서식 버튼)
// =====================
// 필수 DOM 요소
const emojiPicker = $("#emojiPicker"); // 문서 아이콘 선택 팝업
const emojiGrid = $("#emojiGrid"); // 이모지 선택 영역
const titleInput = $("#titleInput"); // 제목 표시/수정 입력창
const docMeta = $("#docMeta"); // 생성/수정 시각 정보
const editor = $("#editor"); // 본문 표시, 편집 핵심 영역

// sidebar에서 문서를 클릭했을 때 실행 -> 주소창 해시만 변경
function navigateTo(id) {
  if (!id) {
    location.hash = "#/documents";
  } else {
    location.hash = "#/documents" + id;
  }
}

// 해시 변경을 실제 상태와 화면에 반영
function syncFromLocation() {
  // 정규식을 통해 주소창 해시에서 문서 id 추출
  // 해시 파싱
  const m = location.hash.match(/#\/documents\/?([\w-]+)?/);
  const id = m && m[1] ? m[1] : null;
  // 활성문서 상태 갱신(동기화)
  state.activeId = id;
  renderTrees();
  renderPage(); // 본문채우기
  save(); //활성 id 포함 스냅샷 저장
}
window.addEventListener("hashchange", syncFromLocation);

// breadcrumbs 정보 => 현재 문서로부터 부모 문서를 거슬러 올라감
function pathOf(id) {
  // 현재 문서 찾기
  const path = [];
  let cur = findDoc(id);
  // 부모 사슬 루프 실행
  while (cur) {
    // 루트 -> 현재문서 순으로 정렬되도록 앞쪽에 삽입
    path.unshift(cur);
    // 부모가 있을 경우 부모 위치, 없으면 null로 종료
    cur = cur.parentId ? findDoc(cur.parentId) : null;
  }
  return path;
}

// 본문영역 그리기
function renderPage() {
  if (!breadcrumbs || !titleInput || !editor || !starBtn || !docMeta) return;
  // 현재 활성문서가 없는 경우
  if (!state.activeId) {
    breadcrumbs.textContent = "No page selected";
    titleInput.value = "Welcome 👋";
    docMeta.textContent = "—";
    editor.innerHTML =
      "<p>좌측에서 문서를 선택하거나 새로운 페이지를 만들어 보세요.</p>";
    starBtn.textContent = "☆";
    return;
  }

  const doc = findDoc(state.activeId);
  // 활성 문서 id는 있지만, 해당문서를 찾을 수 없는 경우
  if (!doc) {
    breadcrumbs.textContent = "Unknown page";
    titleInput.value = "Not found";
    editor.innerHTML = "<p>이 문서는 존재하지 않습니다.</p>";
    return;
  }
  // 정상적으로 문서를 찾은 경우
  const path = pathOf(doc.id)
    .map((d) => d.title)
    .join(" / ");
  breadcrumbs.textContent = path;
  titleInput.value = doc.title;
  editor.innerHTML = doc.content || "<p></p>";
  starBtn.textContent = doc.starred ? "★" : "☆";
  updateDocMeta();
}

// 문서의 생성/수정 시각
function updateDocMeta() {
  const d = state.activeId ? findDoc(state.activeId) : null;
  const ld = $("#lastEdited");
  // #lastEdited가 있으면 오늘 날짜 간단 표기
  if (ld) ld.textContent = new Date().toLocaleDateString();
  // 활성문서 존재 X
  if (!d) {
    docMeta.textContent = "—";
    return;
  }
  docMeta.textContent = `Created ${fmtDate(d.createdAt)} · Updated ${fmtDate(
    d.updatedAt
  )}`;
}

// 초기화
// 저장상태 불러오기 -> 레이아웃 맞춤 -> 사이드바, 휴지통 먼저 렌더
function init() {
  load(); // state.docs, state.trash, state.expanded, state.activeId 되살림
  // 반응형 레이아웃 초기상태 설정
  if (state.isMobile) {
    collapseBtn();
  } else {
    resetWidth();
  }
  renderTrees(); // 트리그리기
  renderTrash(); // 휴지통 팝오버 목록 미리 준비
  // 해시가 비어있는 경우
  if (!location.hash) {
    // 기본문서로 이동
    navigateTo("welcome");
  } else {
    // 해시가 있는 경우 -> 해시에 맞춰 동기화
    syncFromLocation();
  }
  // 오늘날짜표기
  const ld = $("#lastEdited");
  if (ld) ld.textContent = new Date().toLocaleDateString();
  // 메뉴버튼을 사이드바 상태, 뷰포트에 맞춰 표시
  syncMenuBtnVisibility();
}

let saveTimer = null;

// 입력 신호 처리(저장X)
function saveEditorDebounced() {
  clearTimeout(saveTimer); // 직전 타이머 취소
  saveTimer = setTimeout(saveEditor, 400); // 새 타이머 설정 : 400ms 후 saveEditor() 호출
}

function saveEditor() {
  // 활성문서 없는 경우, 즉시 종료
  if (!state.activeId) return;
  // 있는 경우, 현재 HTML를 content 반영
  const html = editor.innerHTML;
  updateDoc(state.activeId, { content: html });
  updateDocMeta();
}
// 손을 떼고 0.4초 후 1회 저장 실행
editor?.addEventListener("input", saveEditorDebounced);

// 제목입력창 -> 입력이벤트 즉시 처리
titleInput?.addEventListener("input", () => {
  // 현재 활성문서가 없는 경우 조용히 종료
  if (!state.activeId) return;
  // 값 trim 후 비어있는 경우는 "Untitled" => list, breadcrumb에 빈 제목 노출 방지
  const t = titleInput.value.trim() || "Untitled";
  updateDoc(state.activeId, { title: t });
  renderTrees(); //제목 변경 후 트리 재렌더링 -> 사이드바 업데이트
  updateDocMeta(); // 메타 정보 갱신
});
