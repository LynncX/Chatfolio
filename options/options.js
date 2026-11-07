(() => {
  const $ = (id) => document.getElementById(id);
  const KEYS = {
    defaultFormat: 'markdown',
    latexStyle: 'obsidian',
    embeddedComponents: 'strip',
  };

  chrome.storage.sync.get(KEYS, (s) => {
    for (const k of Object.keys(KEYS)) $(k).value = s[k];
  });

  $('save').addEventListener('click', () => {
    const values = {};
    for (const k of Object.keys(KEYS)) values[k] = $(k).value;
    chrome.storage.sync.set(values, () => {
      $('saved').textContent = '✓ saved';
      setTimeout(() => ($('saved').textContent = ''), 1500);
    });
  });
})();
