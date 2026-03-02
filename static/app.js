const fileInput = document.getElementById("fileInput");
const pickBtn = document.getElementById("pickBtn");
const dropzone = document.getElementById("dropzone");
const fileList = document.getElementById("fileList");
const clearBtn = document.getElementById("clearBtn");
const compressBtn = document.getElementById("compressBtn");
const statusEl = document.getElementById("status");

const formatEl = document.getElementById("format");
const autoEl = document.getElementById("auto");
const qualityEl = document.getElementById("quality");
const qLabel = document.getElementById("qLabel");
const targetEl = document.getElementById("target");
const tLabel = document.getElementById("tLabel");
const minQualityEl = document.getElementById("minQuality");
const minQLabel = document.getElementById("minQLabel");
const maxDimEl = document.getElementById("maxDim");

const resultsCard = document.getElementById("resultsCard");
const resultsBody = document.getElementById("resultsBody");
const resultsTable = document.getElementById("resultsTable");
const totalsEl = document.getElementById("totals");
const zipLink = document.getElementById("zipLink");

let selectedFiles = [];

function humanSize(bytes){
  const units = ["B","KB","MB","GB"];
  let s = bytes;
  let i = 0;
  while(s >= 1024 && i < units.length-1){
    s /= 1024; i++;
  }
  return `${s.toFixed(1)} ${units[i]}`;
}

function updateControlsState(){
  qLabel.textContent = qualityEl.value;
  tLabel.textContent = `${targetEl.value}%`;
  minQLabel.textContent = minQualityEl.value;

  // quality slider active only if auto off
  qualityEl.disabled = autoEl.checked;
  targetEl.disabled = !autoEl.checked;
  minQualityEl.disabled = !autoEl.checked;

  compressBtn.disabled = selectedFiles.length === 0;
}

function renderFileList(){
  if(selectedFiles.length === 0){
    fileList.classList.add("empty");
    fileList.innerHTML = `<div class="emptyState">Пока нет выбранных файлов</div>`;
    statusEl.textContent = "";
    return;
  }

  fileList.classList.remove("empty");
  fileList.innerHTML = "";
  let total = 0;

  selectedFiles.forEach((f, idx) => {
    total += f.size;

    const row = document.createElement("div");
    row.className = "fileRow";

    const left = document.createElement("div");
    left.className = "fileName";
    left.innerHTML = `
      <strong title="${f.name}">${f.name}</strong>
      <div class="fileMeta"><span class="mono">${humanSize(f.size)}</span></div>
    `;

    const right = document.createElement("div");
    right.innerHTML = `<button class="btn btn-ghost" data-remove="${idx}">Удалить</button>`;

    row.appendChild(left);
    row.appendChild(right);
    fileList.appendChild(row);
  });

  statusEl.textContent = `Выбрано: ${selectedFiles.length} · Общий размер: ${humanSize(total)}`;
}

function addFiles(files){
  // добавляем, но не дублируем по name+size+lastModified
  const toAdd = Array.from(files || []);
  for(const f of toAdd){
    const key = `${f.name}|${f.size}|${f.lastModified}`;
    const exists = selectedFiles.some(x => `${x.name}|${x.size}|${x.lastModified}` === key);
    if(!exists) selectedFiles.push(f);
  }
  renderFileList();
  updateControlsState();
}

pickBtn.addEventListener("click", (e) => {
  e.preventDefault();
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});

clearBtn.addEventListener("click", () => {
  selectedFiles = [];
  renderFileList();
  updateControlsState();
  resultsCard.classList.add("hidden");
});

fileList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove]");
  if(!btn) return;
  const idx = parseInt(btn.getAttribute("data-remove"), 10);
  if(Number.isFinite(idx)){
    selectedFiles.splice(idx, 1);
    renderFileList();
    updateControlsState();
  }
});

// Drag & drop
["dragenter","dragover"].forEach(evt => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("dragover");
  });
});
["dragleave","drop"].forEach(evt => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("dragover");
  });
});
dropzone.addEventListener("drop", (e) => {
  const dt = e.dataTransfer;
  if(dt && dt.files) addFiles(dt.files);
});

autoEl.addEventListener("change", updateControlsState);
qualityEl.addEventListener("input", updateControlsState);
targetEl.addEventListener("input", updateControlsState);
minQualityEl.addEventListener("input", updateControlsState);
formatEl.addEventListener("change", updateControlsState);
maxDimEl.addEventListener("change", updateControlsState);

compressBtn.addEventListener("click", async () => {
  if(selectedFiles.length === 0) return;

  compressBtn.disabled = true;
  statusEl.textContent = "Сжимаю…";

  resultsCard.classList.add("hidden");
  resultsBody.innerHTML = "";

  const fd = new FormData();
  selectedFiles.forEach(f => fd.append("photos", f, f.name));

  fd.append("format", formatEl.value);
  fd.append("auto", autoEl.checked ? "true" : "false");
  fd.append("quality", qualityEl.value);
  fd.append("target_percent", targetEl.value);
  fd.append("min_quality", minQualityEl.value);
  fd.append("max_dim", maxDimEl.value);

  try{
    const res = await fetch("/api/compress", { method: "POST", body: fd });
    const data = await res.json();
    if(!data.ok){
      statusEl.textContent = data.error || "Ошибка";
      compressBtn.disabled = false;
      return;
    }

    // totals
    totalsEl.textContent =
      `Всего ДО: ${data.total_before_h} · ПОСЛЕ: ${data.total_after_h} · ` +
      `Экономия: ${data.total_saved_h} (${data.total_saved_percent}%)`;

    // zip link
    zipLink.href = `/download/${data.job_id}.zip`;

    // rows
    const okRows = data.results.filter(r => r.ok);
    okRows.forEach(r => {
      const tr = document.createElement("tr");

      const fileTd = document.createElement("td");
      fileTd.textContent = r.name;

      const beforeTd = document.createElement("td");
      beforeTd.innerHTML = `<span class="mono">${r.before_h}</span>`;

      const afterTd = document.createElement("td");
      afterTd.innerHTML = `<span class="mono">${r.after_h}</span>`;

      const savedTd = document.createElement("td");
      const cls = (r.saved_percent >= 10) ? "good" : "bad";
      savedTd.innerHTML = `<span class="${cls}">${r.saved_h} (${r.saved_percent}%)</span>`;

      const qTd = document.createElement("td");
      qTd.innerHTML = `<span class="mono">${r.quality_used}</span>`;

      const dlTd = document.createElement("td");
      const a = document.createElement("a");
      a.className = "btn btn-ghost";
      a.textContent = "Файл";
      a.href = `/download/${data.job_id}/${encodeURIComponent(r.output_name)}`;
      a.target = "_blank";
      dlTd.appendChild(a);

      tr.appendChild(fileTd);
      tr.appendChild(beforeTd);
      tr.appendChild(afterTd);
      tr.appendChild(savedTd);
      tr.appendChild(qTd);
      tr.appendChild(dlTd);

      resultsBody.appendChild(tr);
    });

    const failed = data.results.filter(r => !r.ok);
    if(failed.length){
      // покажем ошибки в статусе кратко
      statusEl.textContent = `Готово (с ошибками: ${failed.length}). Некоторые файлы не обработались.`;
    } else {
      statusEl.textContent = "Готово ✅";
    }

    resultsCard.classList.remove("hidden");
    compressBtn.disabled = false;
  } catch(err){
    statusEl.textContent = "Ошибка сети/сервера. Проверь консоль.";
    compressBtn.disabled = false;
  }
});

// init
updateControlsState();
renderFileList();