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

  const vwrap = $("#resp-validations");
  vwrap.innerHTML = "";
  for (const v of resp.validationResults || []) {
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
  $("#resp-validations").innerHTML = "";
  $("#resp-headers").innerHTML = "";
  $("#resp-body").textContent = "";
  $("#resp-error").textContent = msg;
}

async function send() {
  const request = buildRequest();
  if (!request.url) { renderError("Falta la URL."); return; }
  $("#send").disabled = true;
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
    $("#send").disabled = false;
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
}

function renderRequests(box, requests) {
  box.innerHTML = "";
  for (const r of requests) {
    const el = document.createElement("div");
    el.className = "request-item";
    el.textContent = `${r.method} ${r.name}`;
    el.addEventListener("click", () => {
      $$(".request-item").forEach((n) => n.classList.remove("active"));
      el.classList.add("active");
      loadRequest(r);
    });
    box.appendChild(el);
  }
  box.style.display = "block";
}

async function saveRequest() {
  const request = buildRequest();
  if (!request.url) { renderError("Falta la URL para guardar."); return; }

  if (!state.current) {
    const name = prompt("Nombre de la nueva colección:");
    if (!name || !name.trim()) return;
    state.current = { name: name.trim(), version: "1", requests: [] };
  }

  const idx = state.current.requests.findIndex((r) => r.name === request.name);
  if (idx >= 0) state.current.requests[idx] = request;
  else state.current.requests.push(request);

  const res = await fetch("/api/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.current),
  });
  if (!res.ok) { renderError("Error al guardar: " + (await res.text())); return; }
  await refreshCollections();
  renderCollections();
  renderError("");
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

function bindEvents() {
  $$(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tabs button").forEach((b) => b.classList.remove("active"));
      $$(".tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      $("#tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  $("#send").addEventListener("click", send);
  $("#url").addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  $("#save").addEventListener("click", saveRequest);
  $("#body-type").addEventListener("change", onBodyTypeChange);
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
  onBodyTypeChange();
  await refreshCollections();
  renderCollections();
  loadRequest(newRequest());
})();
