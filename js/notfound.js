// 404ページ: i18n初期化とタイトル更新
// (CSP script-src 'self' に対応するため 404.html のインラインスクリプトから移設)
document.addEventListener('DOMContentLoaded', async function() {
  await I18n.init();
  // Update document.title from data-i18n on title element
  var titleEl = document.querySelector('title[data-i18n]');
  if (titleEl) {
    var key = titleEl.getAttribute('data-i18n');
    if (key) document.title = t(key);
  }
});
