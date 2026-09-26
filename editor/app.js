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
let photos = [];
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
  return {
    title: fields.title.value.trim(),
    date: fields.date.value,
    description: fields.description.value.trim(),
    body: fields.body.value.trim(),
    photos: photos.map(({ source, alt, name }) => ({ source, alt, name })),
  };
}

function setData(data) {
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
  saveStatus.textContent = '正在保存草稿…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft(), 550);
}

function saveDraft() {
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
        : '';
    const info = document.createElement('div');
    info.className = 'photo-info';
    const name = document.createElement('span');
    name.className = 'photo-name';
    name.textContent = photo.name || photo.source.split('/').pop() || '本地照片';
    const kind = document.createElement('span');
    kind.className = 'photo-kind';
    kind.textContent = photo.source.startsWith('https://') ? 'OSS 直链' : '本地照片';
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
        await saveDraft();
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

async function submit(publish) {
  if (busy || uploadsInProgress) return;
  if (!fields.title.value.trim()) { fields.title.focus(); showNotice('请先填写标题。', true); return; }
  if (!fields.date.value) { fields.date.focus(); showNotice('请选择日期。', true); return; }
  busy = true;
  updateButtons();
  saveStatus.textContent = publish ? '正在发布，请稍候…' : '正在生成文件…';
  try {
    await saveDraft();
    const result = await api(publish ? 'api/publish' : 'api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getData()),
    });
    showNotice(publish
      ? `已推送到 GitHub。网站将在构建完成后更新：${result.url}`
      : `已生成 ${result.path}。检查文件后可以自行提交，或填写下一条记录。`);
    setData({ title: '', date: new Date().toISOString().slice(0, 10), description: '', body: '', photos: [] });
    saveStatus.textContent = '新草稿已准备好';
  } catch (error) {
    showNotice(error.generated
      ? `${error.message}。文件已生成在 ${error.generated}，请先检查项目状态，不要重复点击。`
      : error.message, true);
    saveStatus.textContent = '草稿已保留';
  } finally {
    busy = false;
    updateButtons();
  }
}

async function start() {
  try {
    const [draft, status] = await Promise.all([api('api/draft'), api('api/status')]);
    setData(draft);
    canPublish = status.canPublish;
    document.querySelector('#branch-badge').textContent = `当前分支：${status.branch || '未知'}`;
    if (!canPublish) document.querySelector('#publish-hint').textContent = '当前在功能分支。可以先生成文件；合并并同步 main 后即可一键发布。';
    saveStatus.textContent = '草稿已载入，修改后自动保存';
  } catch (error) {
    showNotice(error.message, true);
    saveStatus.textContent = '编辑器加载失败';
  }
  updateButtons();
}

Object.values(fields).forEach(input => input.addEventListener('input', queueSave));
fileInput.addEventListener('change', event => addFiles(event.target.files));
dropZone.addEventListener('dragover', event => { event.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', event => { event.preventDefault(); dropZone.classList.remove('drag-over'); addFiles(event.dataTransfer.files); });
document.querySelector('#add-oss').addEventListener('click', () => {
  const input = document.querySelector('#oss-url');
  const url = input.value.trim();
  try {
    if (new URL(url).protocol !== 'https:') throw new Error();
    photos.push({ source: url, alt: '', name: new URL(url).pathname.split('/').pop() || 'OSS 图片' });
    renderPhotos(); queueSave(); input.value = '';
  } catch { input.focus(); showNotice('请填写完整的 HTTPS 图片直链。', true); }
});
document.querySelector('#oss-url').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); document.querySelector('#add-oss').click(); }
});
generateButton.addEventListener('click', () => submit(false));
publishButton.addEventListener('click', () => submit(true));
document.querySelector('#close-editor').addEventListener('click', async () => {
  try { await saveDraft(); await api('api/close', { method: 'POST' }); }
  catch (error) { showNotice(error.message, true); return; }
  showNotice('编辑器已关闭，草稿已保存。现在可以关闭这个标签页。');
  generateButton.disabled = true; publishButton.disabled = true;
});
start();
