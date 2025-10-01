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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state.docs = defaultDocs.slice();
      state.trash = [];
      return;
    }
    const data = JSON.parse(raw);
    state.docs = data.docs || defaultDocs.slice();
    state.trash = data.trash || [];
    state.expanded = data.expanded || {};
    state.activeId = data.activeId || null;
  } catch (e) {
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

  const desiredParentid =
    doc.__origParentId !== undefined ? doc.__origParentId : doc.parentId;

  if (desiredParentid && !existsInDocs(desiredParentId)) {
    // 부모가 아직 휴지통이면 root에 복원 + orphan플래그
    doc.parentId = null;
    doc.__restoredOrphan = true;
    doc.__origParentId = desiredParentid;
    toast("부모가 휴지통에 있어 루트로 복원되었습니다.", "success");
  } else {
    doc.parentId = desiredParentid ?? null;
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
  return d.toLacaleString(); //브라우저의 자동 지역화
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
