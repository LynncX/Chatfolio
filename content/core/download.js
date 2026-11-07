// Output delivery: file download + clipboard.
(() => {
  const CFOLIO = window.CFOLIO;

  CFOLIO.deliver = {
    download(filename, content, mime) {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },

    async copy(text) {
      await navigator.clipboard.writeText(text);
    },
  };
})();
