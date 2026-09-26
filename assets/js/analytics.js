(function () {
  'use strict';

  var baiduId = '5507821713097246e6df71e23b4c8483';
  var laId = '3MF9v9clbBedcHsK';
  var googleId = 'G-LYDJ58L604';

  function loadScript(url, options) {
    var script = document.createElement('script');
    script.async = true;
    script.src = url;
    if (options && options.id) script.id = options.id;
    if (options && options.charset) script.charset = options.charset;
    if (options && options.onload) script.addEventListener('load', options.onload);
    document.head.appendChild(script);
  }

  window._hmt = window._hmt || [];
  loadScript('https://hm.baidu.com/hm.js?' + baiduId);

  loadScript('https://sdk.51.la/js-sdk-pro.min.js', {
    id: 'LA_COLLECT',
    charset: 'UTF-8',
    onload: function () {
      if (window.LA && typeof window.LA.init === 'function') {
        window.LA.init({ id: laId, ck: laId });
      }
    }
  });

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', googleId);
  loadScript('https://www.googletagmanager.com/gtag/js?id=' + googleId);
})();
