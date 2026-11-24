// Applies the saved colour theme before the app renders, to avoid a flash of the wrong theme.
// Kept as a tiny external script so the Content-Security-Policy can forbid inline scripts.
(function () {
  try {
    var t = localStorage.getItem('ek-theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
      if (t === 'light') {
        var m = document.querySelector('meta[name="theme-color"]');
        if (m) m.setAttribute('content', '#F6F7F9');
      }
    }
  } catch (e) {
    /* storage unavailable: default theme */
  }
  // Startup splash: show the uploaded logo cached from the last visit (see src/lib/brand.ts).
  try {
    var u = localStorage.getItem('ek-logo-url');
    if (u && /^https?:\/\/[^"'\\()\s<>]+$/.test(u)) {
      var s = document.createElement('style');
      s.textContent = '#ek-splash .ek-s-logo{background-image:url("' + u + '")}';
      document.head.appendChild(s);
      document.documentElement.classList.add('ek-has-logo');
    }
  } catch (e) {
    /* storage unavailable: monogram splash */
  }
})();
