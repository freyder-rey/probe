"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  collections: [],
  current: null, // Collection cargada
};

const VALIDATION_KINDS = [
  { kind: "status_equals", label: "Status igual a", fields: [
    { name: "expected", label: "Código", type: "number", placeholder: "200" },
  ] },
  { kind: "header_equals", label: "Header igual a", fields: [
    { name: "header", label: "Header", type: "text", placeholder: "content-type" },
    { name: "expected", label: "Valor", type: "text", placeholder: "application/json" },
  ] },
  { kind: "header_contains", label: "Header contiene", fields: [
    { name: "header", label: "Header", type: "text", placeholder: "content-type" },
    { name: "expected", label: "Texto", type: "text", placeholder: "json" },
  ] },
  { kind: "body_contains", label: "Body contiene", fields: [
    { name: "expected", label: "Texto", type: "text", placeholder: '"users"' },
  ] },
  { kind: "body_equals", label: "Body igual a", fields: [
    { name: "expected", label: "Texto", type: "text", placeholder: '{"ok":true}' },
  ] },
  { kind: "json_equals", label: "JSON ruta igual", fields: [
    { name: "path", label: "Ruta", type: "text", placeholder: "$.page" },
    { name: "expected", label: "Valor", type: "text", placeholder: "2" },
  ] },
  { kind: "json_exists", label: "JSON ruta existe", fields: [
    { name: "path", label: "Ruta", type: "text", placeholder: "$.items[0].id" },
  ] },
  { kind: "duration_lt", label: "Duración menor a", fields: [
    { name: "max_ms", label: "ms", type: "number", placeholder: "1000" },
  ] },
];

function newRequest() {
  return {
    name: "",
    method: "GET",
    url: "",
    query: [],
    headers: [],
    body: { type: "none" },
    timeoutSecs: 30,
    followRedirects: true,
    validations: [],
  };
}

// ---------- Utilidades KV ----------

function makeKvRow(kv = { key: "", value: "", enabled: true }, placeholderKey, placeholderValue) {
  const row = document.createElement("div");
  row.className = "kv-row";
  row.innerHTML = `
    <input type="checkbox" class="enabled" ${kv.enabled ? "checked" : ""} title="Habilitar">
    <input class="key" placeholder="${placeholderKey}" value="${escapeAttr(kv.key)}" spellcheck="false">
    <input class="value" placeholder="${placeholderValue}" value="${escapeAttr(kv.value)}" spellcheck="false">
    <button class="del" title="Quitar">×</button>`;
  row.querySelector(".del").addEventListener("click", () => row.remove());
  return row;
}

function collectKv(listId) {
  return $$(`#${listId} .kv-row`)
    .map((row) => ({
      key: row.querySelector(".key").value.trim(),
      value: row.querySelector(".value").value,
      enabled: row.querySelector(".enabled").checked,
    }))
    .filter((kv) => kv.key !== "");
}

function renderKv(listId, kvs, placeholderKey, placeholderValue) {
  const list = document.getElementById(listId);
  list.innerHTML = "";
  for (const kv of kvs) list.appendChild(makeKvRow(kv, placeholderKey, placeholderValue));
}

function bindAddRows() {
  $$(".add-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      const list = document.getElementById(btn.dataset.list);
      list.appendChild(makeKvRow(undefined, "clave", "valor"));
    });
  });
}

// ---------- Validaciones ----------

function makeValidationRow(v = { kind: "status_equals", name: "Validación" }) {
  const row = document.createElement("div");
  row.className = "validation-row";
  const kindSelect = document.createElement("select");
  for (const k of VALIDATION_KINDS) {
    const opt = document.createElement("option");
    opt.value = k.kind;
    opt.textContent = k.label;
    kindSelect.appendChild(opt);
  }
  kindSelect.value = v.kind;
  row.appendChild(kindSelect);

  const fieldsWrap = document.createElement("div");
  fieldsWrap.style.display = "contents";
  row.appendChild(fieldsWrap);

  function renderFields(kind) {
    fieldsWrap.innerHTML = "";
    const def = VALIDATION_KINDS.find((k) => k.kind === kind);
    if (!def) return;
    for (const f of def.fields) {
      const input = document.createElement("input");
      input.type = f.type;
      input.placeholder = f.placeholder;
      input.className = "v-" + f.name;
      const val = v[f.name];
      input.value = val === undefined ? "" : val;
      fieldsWrap.appendChild(input);
    }
  }

  kindSelect.addEventListener("change", () => renderFields(kindSelect.value));
  renderFields(kindSelect.value);

  const del = document.createElement("button");
  del.className = "del";
  del.textContent = "×";
  del.title = "Quitar";
  del.addEventListener("click", () => row.remove());
  row.appendChild(del);
  return row;
}

function collectValidations() {
  return $$("#validation-list .validation-row").map((row) => {
    const kind = row.querySelector("select").value;
    const v = { kind };
    for (const f of VALIDATION_KINDS.find((k) => k.kind === kind).fields) {
      const input = row.querySelector(".v-" + f.name);
      let value = input.value.trim();
      if (f.type === "number") value = value === "" ? 0 : Number(value);
      v[f.name] = value;
    }
    v.name = `${kind}: ${JSON.stringify(v)}`;
    return v;
  });
}

function renderValidations(validations) {
  const list = $("#validation-list");
  list.innerHTML = "";
  for (const v of validations) list.appendChild(makeValidationRow(v));
}

// ---------- Editor ----------

function loadRequest(req) {
  if (!req) return;
  $("#req-name").value = req.name || "";
  $("#method").value = req.method || "GET";
  updateMethodColor();
  $("#url").value = req.url || "";
  $("#timeout").value = req.timeoutSecs ?? 30;
  $("#follow-redirects").checked = req.followRedirects !== false;
  renderKv("query-list", req.query || [], "clave", "valor");
  renderKv("headers-list", req.headers || [], "Clave", "Valor");

  const body = req.body || { type: "none" };
  $("#body-type").value = body.type;
  onBodyTypeChange();
  if (body.type === "raw") $("#raw-body").value = body.content || "";
  if (body.type === "urlencoded") renderKv("urlencoded-list", body.fields || [], "clave", "valor");
  renderValidations(req.validations || []);
}

function buildRequest() {
  const name = $("#req-name").value.trim() || "Solicitud";
  const bodyType = $("#body-type").value;
  let body;
  if (bodyType === "raw") body = { type: "raw", content: $("#raw-body").value };
  else if (bodyType === "urlencoded") body = { type: "urlencoded", fields: collectKv("urlencoded-list") };
  else body = { type: "none" };

  return {
    name,
    method: $("#method").value.trim() || "GET",
    url: $("#url").value.trim(),
    query: collectKv("query-list"),
    headers: collectKv("headers-list"),
    body,
    timeoutSecs: parseInt($("#timeout").value, 10) || 30,
    followRedirects: $("#follow-redirects").checked,
    validations: collectValidations(),
  };
}

function onBodyTypeChange() {
  const type = $("#body-type").value;
  $("#raw-body").style.display = type === "raw" ? "block" : "none";
  $("#urlencoded-list").style.display = type === "urlencoded" ? "block" : "none";
}

// ---------- Toast ----------

let toastTimer;
function showToast(msg, ok = true) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = ok ? "ok" : "error";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = "hidden"; }, 2600);
}

// ---------- Respuesta ----------

function prettyJson(text) {
  try { return JSON.stringify(JSON.parse(text), null, 2); }
  catch { return text; }
}

function renderResponse(resp) {
  const status = $("#resp-status");
  status.textContent = `${resp.status} ${resp.statusText}`;
  status.className = "";
  if (resp.status < 300) status.classList.add("ok");
  else if (resp.status < 400) status.classList.add("redirect");
  else status.classList.add("error");

  $("#resp-duration").textContent = `${resp.durationMs} ms · HTTP/${resp.httpVersion.replace("HTTP/", "")}`;

  $("#resp-error").textContent = "";

  const vres = resp.validationResults || [];
  const vcount = $("#resp-vcount");
  if (vres.length) {
    const passed = vres.filter((v) => v.passed).length;
    vcount.textContent = `✓ ${passed}/${vres.length} validaciones`;
    vcount.className = passed === vres.length ? "pass" : "fail";
  } else {
    vcount.className = "hidden";
  }

  const vwrap = $("#resp-validations");
  vwrap.innerHTML = "";
  for (const v of vres) {
    const el = document.createElement("div");
    el.className = "validation-result " + (v.passed ? "pass" : "fail");
    el.innerHTML = `<span class="mark">${v.passed ? "✓" : "✗"}</span>
      <span class="name">${escapeHtml(v.name)}</span>
      <span class="detail">— ${escapeHtml(v.detail)}</span>`;
    vwrap.appendChild(el);
  }

  $("#resp-headers").innerHTML = (resp.headers || [])
    .map(([k, v]) => `<div>${escapeHtml(k)}: ${escapeHtml(v)}</div>`)
    .join("");

  $("#resp-body").textContent = resp.body ? prettyJson(resp.body) : "(sin cuerpo)";
}

function renderError(msg) {
  $("#resp-status").textContent = "";
  $("#resp-status").className = "";
  $("#resp-duration").textContent = "";
  $("#resp-vcount").className = "hidden";
  $("#resp-validations").innerHTML = "";
  $("#resp-headers").innerHTML = "";
  $("#resp-body").textContent = "";
  $("#resp-error").textContent = msg;
}

async function send() {
  const request = buildRequest();
  if (!request.url) { renderError("Falta la URL."); return; }
  const btn = $("#send");
  btn.disabled = true;
  btn.textContent = "Enviando…";
  try {
    const res = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Error HTTP ${res.status}`);
    }
    const data = await res.json();
    renderResponse(data.response);
  } catch (err) {
    renderError("Error: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Enviar";
  }
}

// ---------- Colecciones ----------

async function refreshCollections() {
  const res = await fetch("/api/collections");
  state.collections = res.ok ? await res.json() : [];
}

function renderCollections() {
  const list = $("#collection-list");
  list.innerHTML = "";
  for (const c of state.collections) {
    const box = document.createElement("div");
    box.className = "collection";
    box.innerHTML = `
      <div class="collection-head">
        <span class="name">${escapeHtml(c.name)}</span>
        <span class="count">${c.size} B</span>
        <button class="del" title="Eliminar">×</button>
      </div>
      <div class="requests"></div>`;
    const head = box.querySelector(".collection-head");
    const requestsBox = box.querySelector(".requests");
    let loaded = false;

    head.addEventListener("click", async (e) => {
      if (e.target.classList.contains("del")) return;
      if (!loaded) {
        try {
          const res = await fetch(`/api/collections/${encodeURIComponent(c.name)}`);
          if (res.ok) {
            state.current = await res.json();
            loaded = true;
            renderRequests(requestsBox, state.current.requests);
          }
        } catch { /* colección no cargable */ }
      } else {
        requestsBox.style.display = requestsBox.style.display === "none" ? "block" : "none";
      }
    });

    head.querySelector(".del").addEventListener("click", async () => {
      if (!confirm(`¿Eliminar la colección "${c.name}"?`)) return;
      await fetch(`/api/collections/${encodeURIComponent(c.name)}`, { method: "DELETE" });
      if (state.current && state.current.name === c.name) state.current = null;
      await refreshCollections();
      renderCollections();
    });

    list.appendChild(box);
  }
  $("#sidebar-empty").classList.toggle("hidden", state.collections.length > 0);
}

function renderRequests(box, requests) {
  box.innerHTML = "";
  for (const r of requests) {
    const el = document.createElement("div");
    el.className = "request-item";
    el.innerHTML = `<span class="method ${escapeHtml(r.method.toLowerCase())}">${escapeHtml(r.method)}</span> ${escapeHtml(r.name)}`;
    el.addEventListener("click", () => {
      $$(".request-item").forEach((n) => n.classList.remove("active"));
      el.classList.add("active");
      loadRequest(r);
    });
    box.appendChild(el);
  }
  box.style.display = "block";
}

function saveRequest() {
  const request = buildRequest();
  if (!request.url) { renderError("Falta la URL para guardar."); return; }
  openSaveModal(request);
}

// ---------- Modal de guardado ----------

let pendingSaveRequest = null;

async function saveToCollection(name, request) {
  const res = await fetch(`/api/collections/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error("No se pudo cargar la colección.");
  const collection = await res.json();
  const idx = collection.requests.findIndex((r) => r.name === request.name);
  if (idx >= 0) collection.requests[idx] = request;
  else collection.requests.push(request);
  const saveRes = await fetch("/api/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(collection),
  });
  if (!saveRes.ok) throw new Error(await saveRes.text());
  return collection;
}

function openSaveModal(request) {
  pendingSaveRequest = request;
  $("#save-modal-request").textContent = `«${request.name}» — ${request.method} ${request.url}`;
  renderSaveCollections();
  $("#save-modal").classList.remove("hidden");
  const newName = $("#new-collection-name");
  newName.value = "";
  setTimeout(() => newName.focus(), 0);
}

function closeSaveModal() {
  pendingSaveRequest = null;
  $("#save-modal").classList.add("hidden");
}

function renderSaveCollections() {
  const list = $("#save-collection-list");
  list.innerHTML = "";
  if (!state.collections.length) {
    list.innerHTML = `<p class="empty-hint-modal">Aún no hay colecciones. Creá una abajo.</p>`;
    return;
  }
  for (const c of state.collections) {
    const isCurrent = state.current && state.current.name === c.name;
    const el = document.createElement("div");
    el.className = "save-collection-item" + (isCurrent ? " current" : "");
    el.innerHTML = `<span class="icon">▸</span><span>${escapeHtml(c.name)}</span>${isCurrent ? `<span class="tag">actual</span>` : ""}`;
    el.addEventListener("click", () => finishSave(c.name));
    list.appendChild(el);
  }
}

async function finishSave(name) {
  const request = pendingSaveRequest;
  closeSaveModal();
  if (!request) return;
  try {
    const collection = await saveToCollection(name, request);
    await refreshCollections();
    renderCollections();
    await expandCollection(name);
    showToast(`Guardada «${request.name}» en «${collection.name}».`);
  } catch (err) {
    showToast("Error al guardar: " + err.message, false);
  }
}

async function createAndSave() {
  const name = $("#new-collection-name").value.trim();
  if (!name) return;
  const request = pendingSaveRequest;
  closeSaveModal();
  if (!request) return;
  const collection = { name, version: "1", requests: [request] };
  const res = await fetch("/api/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(collection),
  });
  if (!res.ok) { showToast("Error al guardar: " + (await res.text()), false); return; }
  await refreshCollections();
  renderCollections();
  await expandCollection(name);
  showToast(`Guardada «${request.name}» en «${name}».`);
}

async function expandCollection(name) {
  const res = await fetch(`/api/collections/${encodeURIComponent(name)}`);
  if (!res.ok) return;
  state.current = await res.json();
  const box = Array.from($$(".collection")).find((b) =>
    b.querySelector(".collection-head .name").textContent === name);
  if (box) {
    renderRequests(box.querySelector(".requests"), state.current.requests);
    box.querySelector(".requests").style.display = "block";
  }
}

// ---------- Utilidades ----------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, "&#96;");
}

// ---------- Init ----------

function bindTabs(scope, idPrefix) {
  $$(`${scope} .tabs button`).forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(`${scope} .tabs button`).forEach((b) => b.classList.remove("active"));
      $$(`${scope} .tab`).forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      $(`#${idPrefix}-` + btn.dataset.tab).classList.add("active");
    });
  });
}

const METHOD_COLORS = {
  GET: "var(--green)",
  POST: "var(--orange)",
  PUT: "var(--accent)",
  PATCH: "var(--teal)",
  DELETE: "var(--red)",
  HEAD: "var(--purple)",
};

function updateMethodColor() {
  const m = $("#method").value.trim().toUpperCase();
  const color = METHOD_COLORS[m];
  $("#method").style.color = color || "";
  $("#method").style.borderColor = color || "";
}

function initSplitter() {
  const splitter = $("#splitter");
  const editor = $("#editor");
  const main = splitter.parentElement;
  let dragging = false;

  splitter.addEventListener("mousedown", (e) => {
    dragging = true;
    splitter.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = main.getBoundingClientRect();
    let width = e.clientX - rect.left - splitter.offsetWidth / 2;
    const min = 320;
    const max = Math.max(min, rect.width - 320);
    width = Math.max(min, Math.min(width, max));
    editor.style.flex = `0 0 ${width}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove("dragging");
    document.body.style.cursor = "";
  });
}

function bindEvents() {
  bindTabs("#editor", "tab");
  bindTabs("#response", "rtab");

  $("#send").addEventListener("click", send);
  $("#url").addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  $("#save").addEventListener("click", saveRequest);
  $("#body-type").addEventListener("change", onBodyTypeChange);
  $("#method").addEventListener("input", updateMethodColor);
  $("#save-cancel").addEventListener("click", closeSaveModal);
  $("#create-and-save").addEventListener("click", createAndSave);
  $("#new-collection-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); createAndSave(); }
  });
  $("#save-modal").addEventListener("click", (e) => {
    if (e.target === $("#save-modal")) closeSaveModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#save-modal").classList.contains("hidden")) closeSaveModal();
  });
  $("#add-validation").addEventListener("click", () => {
    $("#validation-list").appendChild(makeValidationRow());
  });
  $("#new-request").addEventListener("click", () => {
    $$(".request-item").forEach((n) => n.classList.remove("active"));
    loadRequest(newRequest());
  });
  $("#new-collection").addEventListener("click", async () => {
    const name = prompt("Nombre de la colección:");
    if (!name || !name.trim()) return;
    state.current = { name: name.trim(), version: "1", requests: [] };
    await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.current),
    });
    await refreshCollections();
    renderCollections();
    renderRequests(document.querySelector("#collection-list .collection:last-child .requests"), []);
  });

  bindAddRows();
}

(async function init() {
  bindEvents();
  initSplitter();
  onBodyTypeChange();
  await refreshCollections();
  renderCollections();
  loadRequest(newRequest());
  updateMethodColor();
})();
