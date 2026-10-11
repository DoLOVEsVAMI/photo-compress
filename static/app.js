const $ = (id) => document.getElementById(id);

const fileInput = $("fileInput");
const pickBtn = $("pickBtn");
const dropzone = $("dropzone");
const fileList = $("fileList");
const fileCount = $("fileCount");
const fileSummary = $("fileSummary");
const clearBtn = $("clearBtn");
const compressBtn = $("compressBtn");
const statusEl = $("status");
const themeToggle = $("themeToggle");
const formatEl = $("format");
const autoEl = $("auto");
const qualityEl = $("quality");
const qLabel = $("qLabel");
const targetEl = $("target");
const tLabel = $("tLabel");
const minQualityEl = $("minQuality");
const minQLabel = $("minQLabel");
const maxDimEl = $("maxDim");
const autoFields = $("autoFields");
const manualFields = $("manualFields");
const resultsCard = $("resultsCard");
const resultsBody = $("resultsBody");
const totalsEl = $("totals");
const zipLink = $("zipLink");

let selectedFiles = [];

function humanSize(bytes) {
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === "dark";
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute("aria-label", isDark ? "Включить светлую тему" : "Включить тёмную тему");
}

function updateRange(range) {
  const min = Number(range.min) || 0;
  const max = Number(range.max) || 100;
  const progress = ((Number(range.value) - min) / (max - min)) * 100;
  range.style.setProperty("--range-progress", `${progress}%`);
}

function updateControlsState() {
  qLabel.textContent = qualityEl.value;
  tLabel.textContent = `${targetEl.value}%`;
  minQLabel.textContent = minQualityEl.value;
  [qualityEl, targetEl, minQualityEl].forEach(updateRange);
  autoFields.classList.toggle("hidden", !autoEl.checked);
  manualFields.classList.toggle("hidden", autoEl.checked);
  qualityEl.disabled = autoEl.checked;
  targetEl.disabled = !autoEl.checked;
  minQualityEl.disabled = !autoEl.checked;
  const hasFiles = selectedFiles.length > 0;
  compressBtn.disabled = !hasFiles;
  clearBtn.disabled = !hasFiles;
}

function emptyState() {
  const state = document.createElement("div");
  state.className = "empty-state";
  state.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.75h10A3.25 3.25 0 0 1 20.25 7v10A3.25 3.25 0 0 1 17 20.25H7A3.25 3.25 0 0 1 3.75 17V7A3.25 3.25 0 0 1 7 3.75Z"/><path d="m7.5 15 2.6-2.6a1 1 0 0 1 1.4 0l1.35 1.35 1.65-1.65a1 1 0 0 1 1.4 0L18 14.2"/></svg><span>Пока пусто</span>';
  return state;
}

function pluralFiles(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "файл";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "файла";
  return "файлов";
}

function renderFileList() {
  fileList.replaceChildren();
  fileCount.textContent = selectedFiles.length;
  if (!selectedFiles.length) {
    fileList.classList.add("empty");
    fileList.appendChild(emptyState());
    fileSummary.textContent = "Добавленные фото появятся здесь";
    statusEl.textContent = "";
    return;
  }

  fileList.classList.remove("empty");
  const total = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  fileSummary.textContent = `${selectedFiles.length} ${pluralFiles(selectedFiles.length)} · ${humanSize(total)}`;

  selectedFiles.forEach((file, index) => {
    const row = document.createElement("div");
    row.className = "file-row";
    const thumb = document.createElement("div");
    thumb.className = "file-thumb";
    thumb.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.75h10A3.25 3.25 0 0 1 20.25 7v10A3.25 3.25 0 0 1 17 20.25H7A3.25 3.25 0 0 1 3.75 17V7A3.25 3.25 0 0 1 7 3.75Z"/><path d="m7.5 15 2.6-2.6a1 1 0 0 1 1.4 0l1.35 1.35 1.65-1.65a1 1 0 0 1 1.4 0L18 14.2"/><circle cx="9" cy="8.75" r="1.25"/></svg>';

    const name = document.createElement("div");
    name.className = "file-name";
    const strong = document.createElement("strong");
    strong.textContent = file.name;
    strong.title = file.name;
    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.textContent = humanSize(file.size);
    name.append(strong, meta);

    const remove = document.createElement("button");
    remove.className = "remove-button";
    remove.type = "button";
    remove.dataset.remove = index;
    remove.setAttribute("aria-label", `Удалить ${file.name}`);
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
    row.append(thumb, name, remove);
    fileList.appendChild(row);
  });
}

function addFiles(files) {
  const supportedExtensions = /\.(jpe?g|png|webp|bmp|tiff?)$/i;
  for (const file of Array.from(files || [])) {
    if (!file.type.startsWith("image/") && !supportedExtensions.test(file.name)) continue;
    const key = `${file.name}|${file.size}|${file.lastModified}`;
    const exists = selectedFiles.some((item) => `${item.name}|${item.size}|${item.lastModified}` === key);
    if (!exists) selectedFiles.push(file);
  }
  renderFileList();
  updateControlsState();
}

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("photo-compressor-theme", next);
  setTheme(next);
});
pickBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  fileInput.click();
});
dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});
clearBtn.addEventListener("click", () => {
  selectedFiles = [];
  resultsCard.classList.add("hidden");
  document.body.classList.remove("has-results");
  renderFileList();
  updateControlsState();
});
fileList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  const index = Number(button.dataset.remove);
  if (Number.isInteger(index)) selectedFiles.splice(index, 1);
  renderFileList();
  updateControlsState();
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
  });
});
dropzone.addEventListener("drop", (event) => addFiles(event.dataTransfer?.files));

[autoEl, qualityEl, targetEl, minQualityEl, formatEl, maxDimEl].forEach((control) => {
  control.addEventListener(control.type === "range" ? "input" : "change", updateControlsState);
});

compressBtn.addEventListener("click", async () => {
  if (!selectedFiles.length) return;
  compressBtn.disabled = true;
  compressBtn.querySelector("span").textContent = "Сжимаем…";
  statusEl.textContent = "Обрабатываем изображения";
  resultsCard.classList.add("hidden");
  document.body.classList.remove("has-results");
  resultsBody.replaceChildren();

  const formData = new FormData();
  selectedFiles.forEach((file) => formData.append("photos", file, file.name));
  formData.append("format", formatEl.value);
  formData.append("auto", autoEl.checked ? "true" : "false");
  formData.append("quality", qualityEl.value);
  formData.append("target_percent", targetEl.value);
  formData.append("min_quality", minQualityEl.value);
  formData.append("max_dim", maxDimEl.value);

  try {
    const response = await fetch("/api/compress", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось сжать файлы");
    totalsEl.textContent = `${data.total_before_h} → ${data.total_after_h} · сэкономлено ${data.total_saved_percent}%`;
    zipLink.href = `/download/${data.job_id}.zip`;

    data.results.filter((result) => result.ok).forEach((result) => {
      const row = document.createElement("tr");
      [result.name, result.before_h, result.after_h].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      const saved = document.createElement("td");
      saved.className = result.saved_percent >= 10 ? "good" : "bad";
      saved.textContent = `${result.saved_percent}%`;
      row.appendChild(saved);
      const quality = document.createElement("td");
      quality.textContent = result.quality_used;
      row.appendChild(quality);
      const downloadCell = document.createElement("td");
      const download = document.createElement("a");
      download.className = "button download-one";
      download.textContent = "Скачать";
      download.href = `/download/${data.job_id}/${encodeURIComponent(result.output_name)}`;
      download.target = "_blank";
      download.rel = "noopener";
      downloadCell.appendChild(download);
      row.appendChild(downloadCell);
      resultsBody.appendChild(row);
    });

    const failedCount = data.results.filter((result) => !result.ok).length;
    statusEl.textContent = failedCount ? `Готово, не обработано: ${failedCount}` : "Готово";
    resultsCard.classList.remove("hidden");
    document.body.classList.add("has-results");
    resultsCard.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    statusEl.textContent = error.message || "Ошибка соединения";
  } finally {
    compressBtn.querySelector("span").textContent = "Сжать фото";
    updateControlsState();
  }
});

setTheme(document.documentElement.dataset.theme || "light");
updateControlsState();
renderFileList();
