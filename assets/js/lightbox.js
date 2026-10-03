document.addEventListener('DOMContentLoaded', function () {
  var thumbnails = document.querySelectorAll('img[data-lightbox]');
  if (!thumbnails.length) return;

  var dialog = document.createElement('dialog');
  dialog.className = 'image-lightbox';
  dialog.setAttribute('aria-label', '图片预览');

  var closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'image-lightbox-close';
  closeButton.setAttribute('aria-label', '关闭图片预览');
  closeButton.textContent = '×';

  var preview = document.createElement('img');
  preview.alt = '';
  dialog.appendChild(closeButton);
  dialog.appendChild(preview);
  document.body.appendChild(dialog);

  var activeThumbnail = null;
  function openPreview(thumbnail) {
    activeThumbnail = thumbnail;
    preview.src = thumbnail.dataset.lightboxSrc || thumbnail.currentSrc || thumbnail.src;
    preview.alt = thumbnail.alt || '图片预览';
    dialog.showModal();
    closeButton.focus();
  }

  thumbnails.forEach(function (thumbnail) {
    thumbnail.tabIndex = 0;
    thumbnail.setAttribute('role', 'button');
    thumbnail.setAttribute('aria-label', (thumbnail.alt ? thumbnail.alt + '，' : '') + '查看大图');
    thumbnail.addEventListener('click', function () { openPreview(thumbnail); });
    thumbnail.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openPreview(thumbnail);
      }
    });
  });

  closeButton.addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', function () {
    preview.removeAttribute('src');
    if (activeThumbnail) activeThumbnail.focus();
    activeThumbnail = null;
  });
});
