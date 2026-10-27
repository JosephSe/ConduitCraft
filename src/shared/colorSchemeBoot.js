(function () {
  var KEY = 'blueprint-studio-color-scheme';

  function apply(meta, value) {
    if (!meta) return;
    try {
      if (value === 'system') {
        meta.content = 'light dark';
        localStorage.removeItem(KEY);
      } else if (value === 'light' || value === 'dark') {
        meta.content = value;
        localStorage.setItem(KEY, value);
      }
    } catch (e) {
      /* Ignore storage restrictions. */
    }
  }

  try {
    var saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') {
      var meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.content = saved;
    }
  } catch (e) {
    /* Ignore storage restrictions. */
  }

  window.conduitBindColorScheme = function (meta) {
    var radios = Array.prototype.slice.call(document.querySelectorAll('input[name="theme-choice"]'));
    var initial = 'system';
    try {
      var stored = localStorage.getItem(KEY);
      if (stored === 'light' || stored === 'dark') initial = stored;
    } catch (e) {
      /* Ignore storage restrictions. */
    }
    radios.forEach(function (radio) {
      radio.checked = radio.value === initial;
      radio.addEventListener('change', function () {
        if (!radio.checked) return;
        apply(meta, radio.value);
      });
    });
  };
})();
