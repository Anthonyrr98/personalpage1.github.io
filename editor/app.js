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
const retryPushButton = document.querySelector('#retry-push');
const generateButton = document.querySelector('#generate');
const fileInput = document.querySelector('#photo-input');
const dropZone = document.querySelector('#drop-zone');
const entryList = document.querySelector('#entry-list');
const entrySearch = document.querySelector('#entry-search');
const yearFilters = document.querySelector('#year-filters');
const legacyHtml = document.querySelector('#legacy-html');
const manageLibrary = document.querySelector('#manage-library');
const workspace = document.querySelector('#workspace');
const viewHeading = document.querySelector('#view-heading');
const viewDescription = document.querySelector('#view-description');
const viewPublish = document.querySelector('#view-publish');
const viewManage = document.querySelector('#view-manage');
let photos = [];
let records = [];
let currentRecord = null;
let legacyOriginal = '';
let legacyInitial = null;
let editDirty = false;
let recordFilter = 'all';
let yearFilter = 'all';
let activeView = 'publish';
let saveTimer;
let saveChain = Promise.resolve();
let busy = false;
let uploadsInProgress = 0;
let canPublish = false;
let pendingPublish = null;

async function api(path, options = {}) {
  const response = await fetch(base + path, options);
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || '操作失败，请重试。');
    error.generated = result.generated;
    error.state = result.state;
    error.pending = result.pending;
    throw error;
  }
  return result;
}

function getData() {
  if (currentRecord?.kind === 'legacy') return { html: buildLegacyHtml() };
  return {
    title: fields.title.value.trim(),
    date: fields.date.value,
    description: fields.description.value.trim(),
    body: fields.body.value.trim(),
    photos: photos.map(({ source, alt, name }) => ({ source, alt, name })),
  };
}

function setData(data) {
  if (data.kind === 'legacy') {
    legacyOriginal = data.html;
    legacyHtml.value = data.html;
    const root = new DOMParser().parseFromString(data.html, 'text/html').querySelector('.stream-lr');
    const main = root?.querySelector('.stream-main');
    const title = main?.querySelector('h3.streamitem-title');
    if (!main || !title) throw new Error('这条旧记录的结构无法用表单读取，请使用原始 HTML 编辑。');
    fields.title.value = data.title;
    fields.date.value = /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : '';
    fields.description.value = main.querySelector('.life-editor-description')?.textContent.trim() || '';
    fields.body.value = legacyBodyNodes(main, title).map(node => node.textContent.trim()).filter(Boolean).join('\n\n');
    photos = Array.from(main.querySelectorAll('img')).map((image, legacyIndex) => ({
      source: image.getAttribute('src') || '', alt: image.getAttribute('alt') || '', legacyIndex,
    }));
    legacyInitial = legacySnapshot();
    renderPhotos();
    return;
  }
  legacyOriginal = '';
  legacyInitial = null;
  for (const [key, input] of Object.entries(fields)) input.value = data[key] || '';
  photos = Array.isArray(data.photos) ? data.photos : [];
  renderPhotos();
}

function legacyBodyNodes(main, title) {
  return Array.from(main.querySelectorAll('p, blockquote, h3.streamitem-title'))
    .filter(node => node !== title && !node.classList.contains('life-editor-description') && !node.closest('figure'));
}

function legacySnapshot() {
  return JSON.stringify({
    title: fields.title.value.trim(), date: fields.date.value,
    description: fields.description.value.trim(), body: fields.body.value.trim(),
    photos: photos.map(({ source, alt, legacyIndex }) => ({ source, alt, legacyIndex })),
  });
}

function buildLegacyHtml() {
  if (legacyHtml.value !== legacyOriginal) return legacyHtml.value;
  if (legacySnapshot() === legacyInitial) return legacyOriginal;
  const root = new DOMParser().parseFromString(legacyOriginal, 'text/html').querySelector('.stream-lr');
  const main = root.querySelector('.stream-main');
  const title = main.querySelector('h3.streamitem-title');
  const before = JSON.parse(legacyInitial);
  const after = JSON.parse(legacySnapshot());
  if (after.title !== before.title) title.textContent = after.title;
  if (after.date !== before.date) {
    const stamp = root.querySelector('.streamitem-date');
    if (!stamp) throw new Error('旧记录的日期结构无法修改，请使用原始 HTML 编辑。');
    const [year, month, day] = after.date.split('-').map(Number);
    const ordinal = document.createElement('span');
    ordinal.className = 'streamitem-ordinal';
    ordinal.textContent = '年';
    const link = document.createElement('a');
    link.href = stamp.querySelector('a')?.getAttribute('href') || '';
    link.textContent = `${month}月${day}号`;
    stamp.replaceChildren(String(year), ordinal, ' ', link);
  }
  if (after.description !== before.description) {
    let description = main.querySelector('.life-editor-description');
    if (after.description) {
      if (!description) {
        description = document.createElement('p');
        description.className = 'life-editor-description';
        title.insertAdjacentElement('afterend', description);
      }
      description.textContent = after.description;
    } else description?.remove();
  }
  if (after.body !== before.body) {
    legacyBodyNodes(main, title).forEach(node => node.remove());
    const anchor = main.querySelector('.life-editor-description') || title;
    let position = anchor;
    for (const paragraph of after.body.split(/\n\s*\n/).filter(Boolean)) {
      const node = document.createElement('p');
      paragraph.split('\n').forEach((line, index) => {
        if (index) node.append(document.createElement('br'));
        node.append(line);
      });
      position.insertAdjacentElement('afterend', node);
      position = node;
    }
  }
  if (JSON.stringify(after.photos) !== JSON.stringify(before.photos)) {
    const originals = Array.from(main.querySelectorAll('img'));
    const kept = new Map(photos.filter(photo => Number.isInteger(photo.legacyIndex))
      .map(photo => [photo.legacyIndex, photo]));
    originals.forEach((image, index) => {
      const photo = kept.get(index);
      if (!photo) (image.closest('figure') || image.closest('span') || image).remove();
      else {
        image.setAttribute('src', photo.source);
        image.setAttribute('alt', photo.alt || '');
      }
    });
    photos.filter(photo => !Number.isInteger(photo.legacyIndex)).forEach(photo => {
      const figure = document.createElement('figure');
      figure.className = 'stream';
      const image = document.createElement('img');
      image.setAttribute('src', photo.source);
      image.setAttribute('alt', photo.alt || '');
      image.setAttribute('loading', 'lazy');
      image.setAttribute('data-lightbox', '');
      figure.append(image);
      main.append(figure);
    });
  }
  return root.outerHTML;
}

function showNotice(message, error = false) {
  notice.textContent = message;
  notice.hidden = false;
  notice.classList.toggle('error', error);
  notice.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function updateButtons() {
  generateButton.disabled = busy || uploadsInProgress > 0 || !!pendingPublish;
  publishButton.disabled = busy || uploadsInProgress > 0 || !canPublish;
  retryPushButton.disabled = busy;
  retryPushButton.hidden = !pendingPublish;
  if (pendingPublish) {
    document.querySelector('#publish-hint').textContent = `已提交 ${pendingPublish.path}，尚未推送。请继续推送本次提交。`;
    saveStatus.textContent = 'Git 已提交，等待推送';
  }
}

function showPublishFailure(error) {
  if (error.state === 'committed' && error.pending) {
    pendingPublish = error.pending;
    canPublish = false;
    showNotice(`${error.message}。点击“继续推送本次提交”重试，不会再次修改文件。`, true);
    return true;
  }
  showNotice(error.message, true);
  return false;
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
    image.src = photo.source.startsWith('https://') || photo.source.startsWith('http://')
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
    kind.textContent = photo.source.startsWith('https://') || photo.source.startsWith('http://') ? 'OSS 直链'
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
  const managing = activeView === 'manage';
  manageLibrary.hidden = !managing;
  workspace.hidden = managing && !currentRecord;
  viewPublish.setAttribute('aria-pressed', String(!managing));
  viewManage.setAttribute('aria-pressed', String(managing));
  const emphasis = document.createElement('em');
  emphasis.textContent = managing ? '慢慢整理。' : '写成一页。';
  viewHeading.replaceChildren(managing ? '把记录，' : '把日子，', emphasis);
  viewDescription.textContent = managing
    ? '按年份找到每一条记录，再编辑、隐藏或删除。'
    : '写下今天的片段，放上喜欢的照片。剩下的交给编辑器。';
  document.querySelector('#legacy-editor').hidden = !legacy;
  fields.date.required = !legacy;
  document.querySelector('#date-requirement').textContent = legacy ? '选填' : '必填';
  document.querySelector('#body-format-label').textContent = legacy ? '普通文字' : '支持 Markdown';
  document.querySelector('#body-format-hint').textContent = legacy
    ? '旧记录仍保存在原分页中。修改正文会将原有段落和链接改写为普通文字；复杂排版请使用下方原始 HTML。'
    : '支持 Markdown、行内公式 $...$ 和块级公式 $$...$$。只放照片也可以。';
  document.querySelector('#mode-badge').textContent = managing
    ? currentRecord ? `02 / EDITING · ${currentRecord.date}` : '02 / MANAGE'
    : '01 / PUBLISH';
  document.querySelector('#publish-heading').textContent = currentRecord
    ? '把这一页，改成现在的样子。' : '准备好了，就留下它。';
  document.querySelector('#publish-hint').textContent = pendingPublish
    ? `已提交 ${pendingPublish.path}，尚未推送。请继续推送本次提交。`
    : !canPublish
    ? '当前不在 main 分支。可以先保存到本地；合并并同步 main 后即可发布。'
    : currentRecord
      ? `原有网址保持不变：${currentRecord.url}。隐藏或删除后仍可从 Git 历史恢复。`
      : '生成文件会保存在本地；发布后 GitHub Actions 会更新网站。';
  generateButton.textContent = currentRecord ? '只保存到本地' : '只生成文件';
  publishButton.textContent = currentRecord ? '保存并发布 ↗' : '发布到网站 ↗';
  renderRecords();
}

function recordDateParts(record) {
  const match = String(record.date).match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?|年(\d{1,2})月(?:(\d{1,2})[日号])?)?/);
  if (!match) return { year: '日期不明', month: '日期不明', key: '0000-00-00' };
  const year = match[1];
  const month = String(Number(match[2] || match[4] || 0)).padStart(2, '0');
  const day = String(Number(match[3] || match[5] || 0)).padStart(2, '0');
  return { year, month, key: `${year}-${month}-${day}` };
}

function sortRecords() {
  records.sort((a, b) => recordDateParts(b).key.localeCompare(recordDateParts(a).key) ||
    b.id.localeCompare(a.id));
}

function renderYears() {
  const counts = new Map();
  for (const record of records) {
    const year = recordDateParts(record).year;
    counts.set(year, (counts.get(year) || 0) + 1);
  }
  yearFilters.replaceChildren();
  for (const year of ['all', ...counts.keys()]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = year === 'all' ? '全部年份' : `${year} · ${counts.get(year)}`;
    button.setAttribute('aria-pressed', String(yearFilter === year));
    button.addEventListener('click', () => {
      yearFilter = year;
      renderRecords();
      entryList.scrollTop = 0;
    });
    yearFilters.append(button);
  }
}

function renderRecords() {
  renderYears();
  const query = entrySearch.value.trim().toLowerCase();
  const shown = records.filter(record =>
    (yearFilter === 'all' || recordDateParts(record).year === yearFilter) &&
    (recordFilter === 'all' || (recordFilter === 'hidden') === record.hidden) &&
    `${record.title} ${record.date} ${record.excerpt}`.toLowerCase().includes(query));
  document.querySelector('#entry-count').textContent = String(records.length).padStart(2, '0');
  document.querySelector('#nav-entry-count').textContent = records.length ? String(records.length) : '';
  document.querySelector('#entry-empty').hidden = shown.length > 0;
  entryList.replaceChildren();
  let currentYear;
  let currentMonth;
  let yearSection;
  let monthGrid;
  for (const record of shown) {
    const { year, month } = recordDateParts(record);
    if (year !== currentYear) {
      currentYear = year;
      currentMonth = null;
      yearSection = document.createElement('section');
      yearSection.className = 'entry-year';
      const yearHeading = document.createElement('h3');
      yearHeading.className = 'entry-year-heading';
      yearHeading.textContent = year === '日期不明' ? year : `${year} 年`;
      yearSection.append(yearHeading);
      entryList.append(yearSection);
    }
    if (month !== currentMonth) {
      currentMonth = month;
      const monthSection = document.createElement('section');
      monthSection.className = 'entry-month';
      const monthHeading = document.createElement('h4');
      monthHeading.className = 'entry-month-heading';
      monthHeading.textContent = month === '00' || month === '日期不明' ? '月份不明' : `${Number(month)} 月`;
      monthGrid = document.createElement('div');
      monthGrid.className = 'entry-month-grid';
      monthSection.append(monthHeading, monthGrid);
      yearSection.append(monthSection);
    }
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
    excerpt.textContent = record.excerpt || `${record.photos} 张照片`;
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
    monthGrid.append(card);
  }
}

async function loadRecords() {
  records = await api('api/entries');
  sortRecords();
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
    activeView = 'manage';
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
    activeView = 'publish';
    updateMode();
    saveStatus.textContent = '新记录草稿已载入';
    document.querySelector('#workspace').scrollIntoView({ behavior: 'smooth' });
  } catch (error) { showNotice(error.message, true); }
}

async function showManage() {
  if (busy || uploadsInProgress) return;
  try {
    if (!currentRecord) await saveDraft();
    activeView = 'manage';
    updateMode();
  } catch (error) { showNotice(error.message, true); }
}

function showPublish() {
  if (busy || uploadsInProgress) return;
  if (currentRecord) { newEntry(); return; }
  activeView = 'publish';
  updateMode();
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
  } catch (error) {
    if (showPublishFailure(error)) {
      await loadRecords();
      if (currentRecord?.id === record.id) {
        currentRecord = await api('api/entry?id=' + encodeURIComponent(record.id));
        editDirty = false;
        setData(currentRecord);
        updateMode();
      }
    }
  }
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
  } catch (error) {
    if (showPublishFailure(error)) {
      if (currentRecord?.id === record.id) currentRecord = null;
      await loadRecords();
      updateMode();
    }
  }
  finally { busy = false; updateButtons(); }
}

async function submit(publish) {
  if (busy || uploadsInProgress) return;
  if (!fields.title.value.trim() && legacyHtml.value === legacyOriginal) { fields.title.focus(); showNotice('请先填写标题。', true); return; }
  if (!fields.date.value && currentRecord?.kind !== 'legacy') { fields.date.focus(); showNotice('请选择日期。', true); return; }
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
    if (error.state === 'committed' && error.pending) {
      pendingPublish = error.pending;
      canPublish = false;
      if (currentRecord) {
        currentRecord = await api('api/entry?id=' + encodeURIComponent(currentRecord.id));
        editDirty = false;
        setData(currentRecord);
        updateMode();
      } else if (error.generated) {
        setData(await api('api/draft'));
      }
      await loadRecords();
      showNotice(`${error.message}。点击“继续推送本次提交”即可重试，不会再生成记录。`, true);
    } else {
      showNotice(error.generated
        ? `${error.message}。文件已生成在 ${error.generated}，请先检查项目状态，不要重复点击。`
        : error.message, true);
      saveStatus.textContent = currentRecord ? '修改仍在编辑器中' : '草稿已保留';
    }
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
    sortRecords();
    canPublish = status.canPublish;
    pendingPublish = status.pending;
    document.querySelector('#branch-badge').textContent = `当前分支：${status.branch || '未知'}`;
    if (!canPublish) document.querySelector('#publish-hint').textContent = '当前在功能分支。可以先保存到本地；合并并同步 main 后即可一键发布。';
    saveStatus.textContent = '草稿已载入，修改后自动保存';
    if (pendingPublish) showNotice(`文件已生成并提交，但尚未推送：${pendingPublish.path}。点击“继续推送本次提交”重试。`);
    updateMode();
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
retryPushButton.addEventListener('click', async () => {
  if (busy || !pendingPublish) return;
  busy = true;
  updateButtons();
  saveStatus.textContent = '正在继续推送…';
  try {
    const result = await api('api/retry-push', { method: 'POST' });
    pendingPublish = null;
    canPublish = true;
    showNotice(`本次提交已推送到 GitHub。网站将在构建完成后更新：${result.url}`);
    saveStatus.textContent = '已推送';
    document.querySelector('#publish-hint').textContent = '生成文件会保存在本地；发布后 GitHub Actions 会更新网站。';
  } catch (error) {
    showNotice(`继续推送失败：${error.message}`, true);
    saveStatus.textContent = 'Git 已提交，等待推送';
  } finally {
    busy = false;
    updateButtons();
  }
});
document.querySelector('#new-entry').addEventListener('click', newEntry);
viewPublish.addEventListener('click', showPublish);
viewManage.addEventListener('click', showManage);
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
