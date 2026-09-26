const base = location.pathname;
const fields = {
  title: document.querySelector('#title'),
  date: document.querySelector('#date'),
  description: document.querySelector('#description'),
  body: document.querySelector('#body'),
};
const photoList = document.querySelector('#photo-list');
const photoEmpty = document.querySelector('#photo-empty');
const saveStatus = document.querySelector('#save-status');
const notice = document.querySelector('#notice');
const publishButton = document.querySelector('#publish');
const generateButton = document.querySelector('#generate');
const fileInput = document.querySelector('#photo-input');
const dropZone = document.querySelector('#drop-zone');
const entryList = document.querySelector('#entry-list');
const entrySearch = document.querySelector('#entry-search');
const legacyHtml = document.querySelector('#legacy-html');
let photos = [];
let records = [];
let currentRecord = null;
let editDirty = false;
let recordFilter = 'all';
let saveTimer;
let saveChain = Promise.resolve();
let busy = false;
let uploadsInProgress = 0;
let canPublish = false;

async function api(path, options = {}) {
  const response = await fetch(base + path, options);
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || '操作失败，请重试。');
    error.generated = result.generated;
    throw error;
  }
  return result;
}

function getData() {
  if (currentRecord?.kind === 'legacy') return { html: legacyHtml.value };
  return {
    title: fields.title.value.trim(),
    date: fields.date.value,
    description: fields.description.value.trim(),
    body: fields.body.value.trim(),
    photos: photos.map(({ source, alt, name }) => ({ source, alt, name })),
  };
}

function setData(data) {
  if (data.kind === 'legacy') { legacyHtml.value = data.html; return; }
  for (const [key, input] of Object.entries(fields)) input.value = data[key] || '';
  photos = Array.isArray(data.photos) ? data.photos : [];
  renderPhotos();
}

function showNotice(message, error = false) {
  notice.textContent = message;
  notice.hidden = false;
  notice.classList.toggle('error', error);
  notice.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function updateButtons() {
  generateButton.disabled = busy || uploadsInProgress > 0;
  publishButton.disabled = busy || uploadsInProgress > 0 || !canPublish;
}

function queueSave() {
  if (busy) return;
  if (currentRecord) {
    editDirty = true;
    saveStatus.textContent = '修改尚未保存';
    return;
  }
  saveStatus.textContent = '正在保存草稿…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft(), 550);
}

function saveDraft() {
  if (currentRecord) return Promise.resolve();
  clearTimeout(saveTimer);
  const snapshot = getData();
  saveChain = saveChain.catch(() => {}).then(() => api('api/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  }));
  saveChain.then(() => { saveStatus.textContent = '草稿已自动保存'; })
    .catch(() => { saveStatus.textContent = '草稿保存失败，请检查编辑器'; });
  return saveChain;
}

function renderPhotos() {
  photoList.replaceChildren();
  photoEmpty.hidden = photos.length > 0;
  photos.forEach((photo, index) => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    const image = document.createElement('img');
    image.className = 'photo-thumb';
    image.alt = '';
    image.src = photo.source.startsWith('https://')
      ? photo.source
      : photo.source.startsWith('life-uploads/')
        ? base + 'preview/' + photo.source.split('/').pop()
        : photo.source.startsWith('/assets/images/life/')
          ? base + 'asset/' + encodeURIComponent(photo.source.split('/').pop())
          : '';
    const info = document.createElement('div');
    info.className = 'photo-info';
    const name = document.createElement('span');
    name.className = 'photo-name';
    name.textContent = photo.name || photo.source.split('/').pop() || '本地照片';
    const kind = document.createElement('span');
    kind.className = 'photo-kind';
    kind.textContent = photo.source.startsWith('https://') ? 'OSS 直链'
      : photo.source.startsWith('/assets/') ? '已发布照片' : '本地照片';
    const alt = document.createElement('input');
    alt.className = 'photo-alt';
    alt.type = 'text';
    alt.placeholder = '描述这张照片（选填）';
    alt.value = photo.alt || '';
    alt.setAttribute('aria-label', `第 ${index + 1} 张照片的描述`);
    alt.addEventListener('input', () => { photos[index].alt = alt.value; queueSave(); });
    info.append(name, kind, alt);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'photo-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `移除第 ${index + 1} 张照片`);
    remove.addEventListener('click', async () => {
      const [removed] = photos.splice(index, 1);
      renderPhotos();
      try {
        if (currentRecord) queueSave(); else await saveDraft();
        if (removed.source.startsWith('life-uploads/')) {
          await api('api/remove-upload', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: removed.source }),
          });
        }
      } catch (error) { showNotice(error.message, true); }
    });
    card.append(image, info, remove);
    photoList.append(card);
  });
}

async function addFiles(files) {
  const selected = Array.from(files);
  if (!selected.length) return;
  uploadsInProgress += selected.length;
  updateButtons();
  saveStatus.textContent = `正在读取 ${selected.length} 张照片…`;
  for (const file of selected) {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} 超过 20 MB`);
      const result = await api('api/upload?name=' + encodeURIComponent(file.name), {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
      });
      photos.push({ source: result.source, alt: file.name.replace(/\.[^.]+$/, ''), name: result.name });
      renderPhotos();
      queueSave();
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      uploadsInProgress--;
      updateButtons();
    }
  }
  fileInput.value = '';
}

function updateMode() {
  const legacy = currentRecord?.kind === 'legacy';
  document.querySelector('#legacy-editor').hidden = !legacy;
  document.querySelector('#structured-editor').hidden = legacy;
  document.querySelector('#photo-panel').hidden = legacy;
  document.querySelector('#mode-badge').textContent = currentRecord
    ? `${legacy ? '03 / ORIGINAL' : '02 / EDITING'} · ${currentRecord.date}` : '01 / NEW ENTRY';
  document.querySelector('#publish-heading').textContent = currentRecord
    ? '把这一页，改成现在的样子。' : '准备好了，就留下它。';
  document.querySelector('#publish-hint').textContent = !canPublish
    ? '当前不在 main 分支。可以先保存到本地；合并并同步 main 后即可发布。'
    : currentRecord
      ? `原有网址保持不变：${currentRecord.url}。隐藏或删除后仍可从 Git 历史恢复。`
      : '生成文件会保存在本地；发布后 GitHub Actions 会更新网站。';
  generateButton.textContent = currentRecord ? '只保存到本地' : '只生成文件';
  publishButton.textContent = currentRecord ? '保存并发布 ↗' : '发布到网站 ↗';
  renderRecords();
}

function renderRecords() {
  const query = entrySearch.value.trim().toLowerCase();
  const shown = records.filter(record =>
    (recordFilter === 'all' || (recordFilter === 'hidden') === record.hidden) &&
    `${record.title} ${record.date} ${record.excerpt}`.toLowerCase().includes(query));
  document.querySelector('#entry-count').textContent = String(records.length).padStart(2, '0');
  document.querySelector('#entry-empty').hidden = shown.length > 0;
  entryList.replaceChildren();
  for (const record of shown) {
    const card = document.createElement('article');
    card.className = 'entry-card' + (record.hidden ? ' is-hidden' : '') +
      (currentRecord?.id === record.id ? ' is-selected' : '');
    const top = document.createElement('div');
    top.className = 'entry-top';
    const day = document.createElement('time');
    day.dateTime = record.date;
    day.textContent = record.date;
    const state = document.createElement('span');
    state.className = 'entry-state' + (record.hidden ? '' : ' is-visible');
    state.textContent = record.hidden ? '已隐藏' : record.kind === 'legacy' ? '旧版' : '可见';
    top.append(day, state);
    const title = document.createElement('strong');
    title.className = 'entry-title';
    title.textContent = record.title;
    const excerpt = document.createElement('p');
    excerpt.className = 'entry-excerpt';
    excerpt.textContent = record.kind === 'legacy' ? `旧版分页 · ${record.photos} 张照片` :
      record.excerpt || `${record.photos} 张照片`;
    const actions = document.createElement('div');
    actions.className = 'entry-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = '编辑';
    edit.addEventListener('click', () => openRecord(record.id));
    const visibility = document.createElement('button');
    visibility.type = 'button';
    visibility.textContent = record.hidden ? '重新显示' : '隐藏';
    visibility.addEventListener('click', () => changeVisibility(record));
    actions.append(edit, visibility);
    if (!record.hidden) {
      const view = document.createElement('a');
      view.href = 'https://www.rlzhao.com' + record.url;
      view.target = '_blank';
      view.rel = 'noopener noreferrer';
      view.textContent = '查看';
      actions.append(view);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = '删除';
    remove.addEventListener('click', () => deleteRecord(record));
    actions.append(remove);
    card.append(top, title, excerpt, actions);
    entryList.append(card);
  }
}

async function loadRecords() {
  records = await api('api/entries');
  records.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  renderRecords();
}

async function openRecord(id) {
  if (busy || uploadsInProgress) return;
  if (currentRecord && editDirty && !confirm('当前修改尚未保存。确定放弃并打开另一条记录吗？')) return;
  try {
    if (!currentRecord) await saveDraft();
    currentRecord = await api('api/entry?id=' + encodeURIComponent(id));
    editDirty = false;
    setData(currentRecord);
    updateMode();
    saveStatus.textContent = '记录已载入';
    document.querySelector('#workspace').scrollIntoView({ behavior: 'smooth' });
  } catch (error) { showNotice(error.message, true); }
}

async function newEntry() {
  if (busy || uploadsInProgress) return;
  if (currentRecord && editDirty && !confirm('当前修改尚未保存。确定放弃并写新记录吗？')) return;
  try {
    currentRecord = null;
    editDirty = false;
    setData(await api('api/draft'));
    updateMode();
    saveStatus.textContent = '新记录草稿已载入';
    document.querySelector('#workspace').scrollIntoView({ behavior: 'smooth' });
  } catch (error) { showNotice(error.message, true); }
}

async function changeVisibility(record) {
  if (busy || uploadsInProgress) return;
  if (currentRecord?.id === record.id && editDirty && !confirm('这条记录有未保存的修改。确定放弃修改并继续吗？')) return;
  const action = record.hidden ? '重新显示' : '隐藏';
  if (!confirm(`确定${action}「${record.title}」吗？${canPublish ? '这会同步到网站。' : '这只会修改本地文件。'}`)) return;
  busy = true; updateButtons();
  try {
    const result = await api('api/entry/visibility', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: record.id, version: record.version, publish: canPublish }) });
    await loadRecords();
    if (currentRecord?.id === record.id) {
      currentRecord = await api('api/entry?id=' + encodeURIComponent(record.id));
      editDirty = false;
      setData(currentRecord);
      updateMode();
    }
    showNotice(`已${action}「${record.title}」${result.published ? '，网站将在构建后更新。' : '，修改尚未发布。'}`);
  } catch (error) { showNotice(error.message, true); }
  finally { busy = false; updateButtons(); }
}

async function deleteRecord(record) {
  if (busy || uploadsInProgress) return;
  if (!confirm(`确定删除「${record.title}」吗？记录会从网站移除，照片文件会保留；需要时仍可从 Git 历史恢复。`)) return;
  busy = true; updateButtons();
  try {
    const result = await api('api/entry/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: record.id, version: record.version, publish: canPublish }) });
    if (currentRecord?.id === record.id) {
      currentRecord = null; editDirty = false;
      setData(await api('api/draft'));
      updateMode();
    }
    await loadRecords();
    showNotice(`已删除「${record.title}」${result.published ? '，网站将在构建后更新。' : '，本地文件已移除。'}`);
  } catch (error) { showNotice(error.message, true); }
  finally { busy = false; updateButtons(); }
}

async function submit(publish) {
  if (busy || uploadsInProgress) return;
  if (currentRecord?.kind !== 'legacy') {
    if (!fields.title.value.trim()) { fields.title.focus(); showNotice('请先填写标题。', true); return; }
    if (!fields.date.value) { fields.date.focus(); showNotice('请选择日期。', true); return; }
  }
  busy = true;
  updateButtons();
  saveStatus.textContent = publish ? '正在发布，请稍候…' : '正在保存文件…';
  try {
    if (currentRecord) {
      const id = currentRecord.id;
      const result = await api('api/entry/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, version: currentRecord.version, data: getData(), publish }),
      });
      currentRecord = await api('api/entry?id=' + encodeURIComponent(id));
      editDirty = false;
      setData(currentRecord);
      updateMode();
      await loadRecords();
      saveStatus.textContent = result.unchanged ? '内容没有变化' : '修改已保存';
      showNotice(result.unchanged ? '内容没有变化。' : publish
        ? '修改已推送到 GitHub，网站将在构建完成后更新。'
        : '修改已保存到本地文件，尚未发布。');
    } else {
      await saveDraft();
      const result = await api(publish ? 'api/publish' : 'api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getData()),
      });
      showNotice(publish
        ? `已推送到 GitHub。网站将在构建完成后更新：${result.url}`
        : `已生成 ${result.path}。检查文件后可以自行提交，或填写下一条记录。`);
      setData({ title: '', date: new Date().toISOString().slice(0, 10), description: '', body: '', photos: [] });
      saveStatus.textContent = '新草稿已准备好';
      await loadRecords();
    }
  } catch (error) {
    showNotice(error.generated
      ? `${error.message}。文件已生成在 ${error.generated}，请先检查项目状态，不要重复点击。`
      : error.message, true);
    saveStatus.textContent = currentRecord ? '修改仍在编辑器中' : '草稿已保留';
  } finally {
    busy = false;
    updateButtons();
  }
}

async function start() {
  try {
    const [draft, status, entries] = await Promise.all([api('api/draft'), api('api/status'), api('api/entries')]);
    setData(draft);
    records = entries;
    records.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    renderRecords();
    canPublish = status.canPublish;
    document.querySelector('#branch-badge').textContent = `当前分支：${status.branch || '未知'}`;
    if (!canPublish) document.querySelector('#publish-hint').textContent = '当前在功能分支。可以先保存到本地；合并并同步 main 后即可一键发布。';
    saveStatus.textContent = '草稿已载入，修改后自动保存';
  } catch (error) {
    showNotice(error.message, true);
    saveStatus.textContent = '编辑器加载失败';
  }
  updateButtons();
}

Object.values(fields).forEach(input => input.addEventListener('input', queueSave));
legacyHtml.addEventListener('input', queueSave);
fileInput.addEventListener('change', event => addFiles(event.target.files));
dropZone.addEventListener('dragover', event => { event.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', event => { event.preventDefault(); dropZone.classList.remove('drag-over'); addFiles(event.dataTransfer.files); });
const addOssButton = document.querySelector('#add-oss');
addOssButton.addEventListener('click', async () => {
  const input = document.querySelector('#oss-url');
  const url = input.value.trim();
  let parsed;
  try {
    parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error();
  } catch { input.focus(); showNotice('请填写完整的 HTTP 或 HTTPS 图片直链。', true); return; }
  if (parsed.protocol === 'http:') {
    uploadsInProgress++;
    addOssButton.disabled = true;
    updateButtons();
    saveStatus.textContent = '正在导入 HTTP 图片…';
    try {
      const result = await api('api/import-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      photos.push({ source: result.source, alt: '', name: `OSS · ${result.name}` });
    } catch (error) { showNotice(error.message, true); return; }
    finally { uploadsInProgress--; addOssButton.disabled = false; updateButtons(); }
  } else {
    photos.push({ source: url, alt: '', name: parsed.pathname.split('/').pop() || 'OSS 图片' });
  }
  renderPhotos(); queueSave(); input.value = '';
});
document.querySelector('#oss-url').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); document.querySelector('#add-oss').click(); }
});
generateButton.addEventListener('click', () => submit(false));
publishButton.addEventListener('click', () => submit(true));
document.querySelector('#new-entry').addEventListener('click', newEntry);
entrySearch.addEventListener('input', renderRecords);
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  recordFilter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(item =>
    item.setAttribute('aria-pressed', String(item === button)));
  renderRecords();
}));
window.addEventListener('beforeunload', event => {
  if (currentRecord && editDirty) { event.preventDefault(); event.returnValue = ''; }
});
document.querySelector('#close-editor').addEventListener('click', async () => {
  if (currentRecord && editDirty && !confirm('当前修改尚未保存。确定关闭编辑器吗？')) return;
  try { await saveDraft(); await api('api/close', { method: 'POST' }); }
  catch (error) { showNotice(error.message, true); return; }
  showNotice('编辑器已关闭。现在可以关闭这个标签页。');
  generateButton.disabled = true; publishButton.disabled = true;
});
start();
