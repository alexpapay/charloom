(() => {
  const key = 'charloom-analytics-consent';
  const panel = document.getElementById('analytics-choice');
  const production = location.hostname === 'charloom.popovich.one';
  function enable() {
    if (!production) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    window.gtag('js', new Date());
    window.gtag('config', 'G-YLDL8WREEW', { allow_google_signals: false, allow_ad_personalization_signals: false, page_location: location.origin + location.pathname });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-YLDL8WREEW';
    document.head.append(script);
  }
  function choose(value) {
    try { localStorage.setItem(key, value); } catch { /* Storage may be disabled. */ }
    panel.hidden = true;
    if (value === 'granted') enable();
  }
  let consent;
  try { consent = localStorage.getItem(key); } catch { /* Ask again when storage is unavailable. */ }
  if (consent === 'granted') enable();
  else if (consent !== 'denied' && production) panel.hidden = false;
  document.getElementById('analytics-accept').addEventListener('click', () => choose('granted'));
  document.getElementById('analytics-decline').addEventListener('click', () => choose('denied'));
  const reset = document.getElementById('reset-analytics');
  if (reset) reset.addEventListener('click', () => {
    try { localStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
    location.reload();
  });
})();
