(() => {
  const tg = window.Telegram?.WebApp;
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
  if (matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone) return;
  if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
    document.addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    }, {once:true});
  }
})();
