"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  collections: [],
  current: null, // Collection cargada
  collectionCache: {}, // nombre -> Collection (para el selector de tests)
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
  const method = (req.method || "GET").toUpperCase();
  $("#method").value = Array.from($("#method").options).some((o) => o.value === method)
    ? method
    : "GET";
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
            state.current.tests = state.current.tests || [];
            loaded = true;
            renderRequests(requestsBox, state.current.requests);
            renderTests(box, state.current);
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
      state.collectionCache = {};
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
      setMode("request");
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
  state.collectionCache = {};
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
  const collection = { name, version: "1", requests: [request], tests: [] };
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
  state.current.tests = state.current.tests || [];
  const box = Array.from($$(".collection")).find((b) =>
    b.querySelector(".collection-head .name").textContent === name);
  if (box) {
    renderRequests(box.querySelector(".requests"), state.current.requests);
    renderTests(box, state.current);
    box.querySelector(".requests").style.display = "block";
  }
}

// ---------- Tests ----------

let testRunActive = null; // { collection, name } del test que está corriendo
let testRunTimer = null;

function setMode(mode) {
  const request = mode === "request";
  $$("#mode-switch button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  $("#request-editor").classList.toggle("hidden", !request);
  $("#test-editor").classList.toggle("hidden", request);
  $("#request-response").classList.toggle("hidden", !request);
  $("#test-panel").classList.toggle("hidden", request);
  if (!request) clearTestRunTimer();
}

function clearTestRunTimer() {
  if (testRunTimer) {
    clearInterval(testRunTimer);
    testRunTimer = null;
  }
}

async function loadCollection(name) {
  if (state.collectionCache[name]) return state.collectionCache[name];
  const res = await fetch(`/api/collections/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error("No se pudo cargar la colección.");
  const collection = await res.json();
  collection.tests = collection.tests || [];
  state.collectionCache[name] = collection;
  return collection;
}

function renderTestCollectionSelect(selected) {
  const sel = $("#test-collection");
  sel.innerHTML = "";
  if (!state.collections.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sin colecciones";
    sel.appendChild(opt);
    return;
  }
  for (const c of state.collections) {
    const opt = document.createElement("option");
    opt.value = c.name;
    opt.textContent = c.name;
    sel.appendChild(opt);
  }
  if (selected && state.collections.some((c) => c.name === selected)) {
    sel.value = selected;
  }
}

function collectTestFromForm() {
  const all = $("#test-all").checked;
  const requestNames = all
    ? []
    : Array.from($$("#test-request-list .test-req-cb"))
        .filter((cb) => cb.checked)
        .map((cb) => cb.dataset.name);
  return {
    name: $("#test-name").value.trim(),
    iterations: parseInt($("#test-iterations").value, 10) || 1,
    delayMs: parseInt($("#test-delay").value, 10) || 0,
    csv: $("#test-csv").value.trim()
      ? { type: "path", path: $("#test-csv").value.trim() }
      : null,
    requestNames,
  };
}

async function openTestEditor(collectionName, test) {
  setMode("test");
  $("#test-panel-title").textContent = "";
  $("#test-panel").classList.add("hidden");
  $("#test-name").value = test ? test.name : "";
  $("#test-iterations").value = test ? test.iterations : 1;
  $("#test-delay").value = test ? test.delayMs : 0;
  $("#test-csv").value = test && test.csv && test.csv.type === "path" ? test.csv.path : "";
  renderTestCollectionSelect(collectionName);

  const target = collectionName || $("#test-collection").value;
  if (target) {
    try {
      const collection = await loadCollection(target);
      renderTestRequests(collection, test);
    } catch {
      renderTestRequests({ requests: [] }, test);
    }
  } else {
    renderTestRequests({ requests: [] }, test);
  }
}

function renderTestRequests(collection, test) {
  const list = $("#test-request-list");
  list.innerHTML = "";
  const selected = new Set((test && test.requestNames) || []);
  const all = selected.size === 0;
  $("#test-all").checked = all;

  if (!collection.requests.length) {
    list.innerHTML = `<p class="empty-hint-modal">Esta colección todavía no tiene solicitudes.</p>`;
    return;
  }

  for (const r of collection.requests) {
    const row = document.createElement("div");
    row.className = "test-req-row";
    row.title = r.url || "";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "test-req-cb";
    cb.dataset.name = r.name;
    cb.checked = all || selected.has(r.name);

    const method = document.createElement("span");
    method.className = "method " + String(r.method || "GET").toLowerCase();
    method.textContent = r.method || "GET";

    const name = document.createElement("span");
    name.className = "req-name";
    name.textContent = r.name;

    const toggle = (checked) => {
      cb.checked = checked;
      if (checked) $("#test-all").checked = false;
      updateTestReqCount();
    };

    cb.addEventListener("change", () => toggle(cb.checked));
    row.addEventListener("click", (e) => {
      if (e.target === cb) return;
      toggle(!cb.checked);
    });

    row.appendChild(cb);
    row.appendChild(method);
    row.appendChild(name);
    list.appendChild(row);
  }
  updateTestReqCount();
}

function updateTestReqCount() {
  const cbs = $$("#test-request-list .test-req-cb");
  const checked = cbs.filter((cb) => cb.checked).length;
  const badge = $("#test-req-count");
  if (!badge) return;
  badge.textContent = $("#test-all").checked
    ? "todas"
    : `${checked} de ${cbs.length}`;
}

async function upsertTest(collectionName, test) {
  try {
    const collection = await loadCollection(collectionName);
    const idx = collection.tests.findIndex((t) => t.name === test.name);
    if (idx >= 0) collection.tests[idx] = test;
    else collection.tests.push(test);
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collection),
    });
    if (!res.ok) { showToast("Error al guardar el test: " + (await res.text()), false); return false; }
    state.collectionCache = {};
    await refreshCollections();
    renderCollections();
    await expandCollection(collectionName);
    return true;
  } catch (err) {
    showToast("Error al guardar el test: " + err.message, false);
    return false;
  }
}

async function runTest() {
  const test = collectTestFromForm();
  const collectionName = $("#test-collection").value;
  if (!test.name) { showToast("El nombre del test es obligatorio.", false); return; }
  if (!collectionName) { showToast("Elegí una colección de origen.", false); return; }
  if (!test.requestNames.length && !$("#test-all").checked) {
    showToast("Seleccioná al menos una solicitud para el test.", false);
    return;
  }
  const ok = await upsertTest(collectionName, test);
  if (!ok) return;
  await startTest(collectionName, test.name);
}

async function startTest(collectionName, testName) {
  const res = await fetch(
    `/api/tests/${encodeURIComponent(collectionName)}/${encodeURIComponent(testName)}/start`,
    { method: "POST" }
  );
  if (!res.ok) { showToast("No se pudo iniciar el test: " + (await res.text()), false); return; }
  await showTestRun(collectionName, testName);
}

function stopTestRun() {
  if (!testRunActive) return;
  const { collection, name } = testRunActive;
  fetch(
    `/api/tests/${encodeURIComponent(collection)}/${encodeURIComponent(name)}/stop`,
    { method: "POST" }
  );
}

async function showTestRun(collectionName, testName) {
  setMode("test");
  $("#test-panel-title").textContent = `Test «${testName}» — ${collectionName}`;
  $("#test-panel").classList.remove("hidden");
  testRunActive = { collection: collectionName, name: testName };
  $("#test-panel-stop").classList.remove("hidden");
  $("#test-panel-run").classList.add("hidden");
  renderTestRunState({ status: "running", done: 0, total: 0 });

  clearTestRunTimer();
  testRunTimer = setInterval(async () => {
    const res = await fetch(
      `/api/tests/${encodeURIComponent(collectionName)}/${encodeURIComponent(testName)}/status`
    );
    if (!res.ok) { clearTestRunTimer(); return; }
    const data = await res.json();
    renderTestRunState(data);
    if (data.status !== "running") {
      clearTestRunTimer();
      $("#test-panel-stop").classList.add("hidden");
      $("#test-panel-run").classList.remove("hidden");
      await refreshTestsSidebar(collectionName);
    }
  }, 400);
}

function renderTestRunState(data) {
  const statusEl = $("#test-panel-status");
  const progress = $("#test-panel-progress");
  const bar = progress.querySelector(".bar");
  const report = $("#test-panel-report");

  if (data.status === "running") {
    statusEl.innerHTML =
      `<span class="report-status running">en ejecución</span>` +
      `<span class="run-count">${data.done}/${data.total || "…"}</span>`;
    progress.classList.remove("hidden");
    const pct = data.total ? Math.round((data.done / data.total) * 100) : 0;
    bar.style.width = pct + "%";
    report.innerHTML = "";
  } else {
    progress.classList.add("hidden");
    statusEl.innerHTML = "";
    let html = `<p class="report-status ${escapeHtml(data.status)}">${escapeHtml(data.status)}</p>`;
    if (data.error) html += `<p class="report-error">${escapeHtml(data.error)}</p>`;
    if (data.report) html += renderReportHtml(data.report);
    report.innerHTML = html;
  }
}

function renderReportHtml(r) {
  const resultado = r.failed === 0 ? "PASÓ" : "FALLÓ";
  let html = `<p class="report-result ${r.failed === 0 ? "pass" : "fail"}">${resultado} — ${r.totalRequests} solicitudes · ${r.success} OK · ${r.failed} fallidas</p>`;
  html += `<p class="report-detail">Duración: ${r.durationMs} ms · promedio ${r.avgMs} ms · p95 ${r.p95Ms} ms</p>`;
  if (r.perRequest && r.perRequest.length) {
    html += `<table class="report-table"><tr><th>Solicitud</th><th>Total</th><th>OK</th><th>Fallidas</th></tr>`;
    for (const s of r.perRequest) {
      html += `<tr><td>${escapeHtml(s.name)}</td><td>${s.total}</td><td>${s.success}</td><td>${s.failed}</td></tr>`;
    }
    html += `</table>`;
  }
  if (r.errors && r.errors.length) {
    html += `<p class="report-detail">Errores:</p><ul class="report-errors">`;
    for (const e of r.errors) html += `<li>${escapeHtml(e)}</li>`;
    html += `</ul>`;
  }
  return html;
}

async function refreshTestsSidebar(collectionName) {
  const box = Array.from($$(".collection")).find((b) =>
    b.querySelector(".collection-head .name").textContent === collectionName);
  if (box) {
    const collection = await loadCollection(collectionName);
    renderTests(box, collection);
  }
}

function renderTests(box, collection) {
  let testsBox = box.querySelector(".tests");
  if (!testsBox) {
    testsBox = document.createElement("div");
    testsBox.className = "tests";
    box.appendChild(testsBox);
  }
  testsBox.innerHTML = "";
  const head = document.createElement("div");
  head.className = "tests-head";
  const title = document.createElement("span");
  title.textContent = "Tests";
  head.appendChild(title);
  const addBtn = document.createElement("button");
  addBtn.className = "add-test";
  addBtn.textContent = "+ Nuevo test";
  head.appendChild(addBtn);
  testsBox.appendChild(head);

  addBtn.addEventListener("click", () => openTestEditor(collection.name, null));

  for (const t of collection.tests || []) {
    const item = document.createElement("div");
    item.className = "test-item";
    item.dataset.name = t.name;
    item.innerHTML = `
      <button class="run" title="Ejecutar">▶</button>
      <button class="name" title="Editar">${escapeHtml(t.name)}</button>
      <span class="status"></span>
      <button class="report-link hidden">Ver reporte</button>`;

    const runBtn = item.querySelector(".run");
    const statusEl = item.querySelector(".status");
    const reportLink = item.querySelector(".report-link");

    runBtn.addEventListener("click", async () => {
      if (runBtn.textContent === "■") { stopTestRun(); return; }
      const res = await fetch(
        `/api/tests/${encodeURIComponent(collection.name)}/${encodeURIComponent(t.name)}/start`,
        { method: "POST" }
      );
      if (!res.ok) { showToast("No se pudo iniciar: " + (await res.text()), false); return; }
      await openTestEditor(collection.name, t);
      await showTestRun(collection.name, t.name);
      await refreshStatus();
    });

    item.querySelector(".name").addEventListener("click", () => openTestEditor(collection.name, t));
    reportLink.addEventListener("click", async () => {
      await openTestEditor(collection.name, t);
      await showTestRun(collection.name, t.name);
    });

    const refreshStatus = async () => {
      const res = await fetch(
        `/api/tests/${encodeURIComponent(collection.name)}/${encodeURIComponent(t.name)}/status`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "running") {
        runBtn.textContent = "■";
        runBtn.title = "Detener";
        statusEl.textContent = data.total ? `${data.done}/${data.total}` : "…";
      } else {
        runBtn.textContent = "▶";
        runBtn.title = "Ejecutar";
        statusEl.textContent = data.status;
        reportLink.classList.toggle("hidden", !(data.report || data.error));
      }
    };

    testsBox.appendChild(item);
    refreshStatus();
  }
}

// ---------- Guardar test eligiendo colección ----------

let pendingTest = null;

function openSaveTestModal() {
  const test = collectTestFromForm();
  const collectionName = $("#test-collection").value;
  if (!test.name) { showToast("El nombre del test es obligatorio.", false); return; }
  if (!collectionName) { showToast("Elegí una colección de origen.", false); return; }
  pendingTest = test;
  const scope = test.requestNames.length
    ? `${test.requestNames.length} solicitud(es)`
    : "todas las solicitudes";
  $("#save-test-test-name").textContent =
    `«${test.name}» — ${test.iterations} iteración(es), ${scope}`;
  renderSaveTestCollections();
  $("#save-test-modal").classList.remove("hidden");
  const newName = $("#save-test-new-name");
  newName.value = "";
  setTimeout(() => newName.focus(), 0);
}

function closeSaveTestModal() {
  pendingTest = null;
  $("#save-test-modal").classList.add("hidden");
}

function renderSaveTestCollections() {
  const list = $("#save-test-collection-list");
  list.innerHTML = "";
  if (!state.collections.length) {
    list.innerHTML = `<p class="empty-hint-modal">Aún no hay colecciones. Creá una abajo.</p>`;
    return;
  }
  const origin = $("#test-collection").value;
  for (const c of state.collections) {
    const isOrigin = c.name === origin;
    const el = document.createElement("div");
    el.className = "save-collection-item" + (isOrigin ? " current" : "");
    el.innerHTML = `<span class="icon">▸</span><span>${escapeHtml(c.name)}</span>${isOrigin ? `<span class="tag">origen</span>` : ""}`;
    el.addEventListener("click", () => finishSaveTest(c.name));
    list.appendChild(el);
  }
}

async function finishSaveTest(collectionName) {
  const test = pendingTest;
  closeSaveTestModal();
  if (!test) return;
  if (await upsertTest(collectionName, test)) {
    showToast(`Test «${test.name}» guardado en «${collectionName}».`);
  }
}

async function createAndSaveTest() {
  const name = $("#save-test-new-name").value.trim();
  if (!name) return;
  const test = pendingTest;
  closeSaveTestModal();
  if (!test) return;
  const collection = { name, version: "1", requests: [], tests: [test] };
  const res = await fetch("/api/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(collection),
  });
  if (!res.ok) { showToast("Error al guardar: " + (await res.text()), false); return; }
  state.collectionCache = {};
  await refreshCollections();
  renderCollections();
  await expandCollection(name);
  showToast(`Test «${test.name}» guardado en «${name}».`);
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
  $("#method").addEventListener("change", updateMethodColor);
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
    if (e.key === "Escape" && !$("#save-test-modal").classList.contains("hidden")) closeSaveTestModal();
  });
  $("#test-collection").addEventListener("change", async () => {
    const name = $("#test-collection").value;
    if (!name) { renderTestRequests({ requests: [] }, null); return; }
    try {
      const collection = await loadCollection(name);
      renderTestRequests(collection, null);
    } catch {
      renderTestRequests({ requests: [] }, null);
    }
  });
  $("#test-run").addEventListener("click", runTest);
  $("#test-save").addEventListener("click", openSaveTestModal);
  $("#test-panel-run").addEventListener("click", async () => {
    if (testRunActive) await startTest(testRunActive.collection, testRunActive.name);
  });
  $("#test-panel-stop").addEventListener("click", stopTestRun);
  $$("#mode-switch button").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });
  $("#new-test").addEventListener("click", () => openTestEditor(null, null));
  $("#test-all").addEventListener("change", () => {
    const all = $("#test-all").checked;
    $$("#test-request-list .test-req-cb").forEach((cb) => { cb.checked = all; });
    updateTestReqCount();
  });
  $("#save-test-cancel").addEventListener("click", closeSaveTestModal);
  $("#save-test-create").addEventListener("click", createAndSaveTest);
  $("#save-test-new-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); createAndSaveTest(); }
  });
  $("#save-test-modal").addEventListener("click", (e) => {
    if (e.target === $("#save-test-modal")) closeSaveTestModal();
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
    state.current = { name: name.trim(), version: "1", requests: [], tests: [] };
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
