(function () {
  var KEY = 'blueprint-studio-color-scheme';

  function storedMode() {
    try {
      var stored = localStorage.getItem(KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch (e) {
      /* Ignore storage restrictions. */
    }
    return 'system';
  }

  function systemMode() {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function apply(meta, value) {
    var choice = value === 'light' || value === 'dark' || value === 'system' ? value : storedMode();
    var mode = choice === 'system' ? systemMode() : choice;
    try {
      if (choice === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch (e) {
      /* Ignore storage restrictions. */
    }
    if (meta) meta.content = choice === 'system' ? 'light dark' : choice;
    document.documentElement.setAttribute('data-theme', mode === 'dark' ? 'graphite' : 'vellum');
  }

  apply(document.querySelector('meta[name="color-scheme"]'), storedMode());

  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (storedMode() === 'system') apply(document.querySelector('meta[name="color-scheme"]'), 'system');
    });
  } catch (e) {
    /* Ignore browsers without matchMedia. */
  }

  window.conduitBindColorScheme = function (meta) {
    var radios = Array.prototype.slice.call(document.querySelectorAll('input[name="theme-choice"]'));
    var initial = storedMode();
    radios.forEach(function (radio) {
      radio.checked = radio.value === initial;
      radio.addEventListener('change', function () {
        if (!radio.checked) return;
        apply(meta, radio.value);
      });
    });
  };
})();
