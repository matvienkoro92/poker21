(() => {
  const tg = window.Telegram?.WebApp;
  const mobileBrowser = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const platform = tg?.platform || 'unknown';
  const mobile = ['android','android_x','ios'].includes(platform) ||
    (['unknown','web','weba','webk'].includes(platform) && mobileBrowser);
  if (!mobile) return;
  if (tg && (tg.initData || (tg.platform && tg.platform !== 'unknown'))) {
    document.documentElement.dataset.pokerPlatform = tg.platform;
    function syncInsets() {
      document.documentElement.classList.toggle('telegram-fullscreen', Boolean(tg.isFullscreen));
    }
    function enter() {
      if (tg.isFullscreen) return syncInsets();
      if (tg.isVersionAtLeast?.('8.0') && tg.requestFullscreen) {
        try { tg.requestFullscreen(); return; } catch {}
      }
      tg.expand?.();
    }
    tg.onEvent('fullscreenChanged', syncInsets);
    tg.onEvent('fullscreenFailed', () => tg.expand?.());
    tg.onEvent('activated', enter);
    syncInsets();
    enter();
    return;
  }
  if (matchMedia('(display-mode: fullscreen)').matches) return;
  if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
    document.addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    }, {once:true});
  }
})();
