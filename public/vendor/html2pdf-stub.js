(function () {
  function Html2PdfTask(element) {
    this.element = element;
    this.options = {};
  }

  Html2PdfTask.prototype.set = function set(options) {
    this.options = { ...this.options, ...options };
    return this;
  };

  Html2PdfTask.prototype.from = function from(element) {
    this.element = element || this.element;
    return this;
  };

  Html2PdfTask.prototype.save = function save() {
    if (!this.element) {
      console.warn('html2pdf stub: no element provided');
      return Promise.resolve();
    }
    console.info('html2pdf stub: printing element instead of generating PDF.');
    return new Promise((resolve) => {
      const previous = document.body.innerHTML;
      document.body.innerHTML = this.element.outerHTML;
      window.print();
      document.body.innerHTML = previous;
      resolve();
    });
  };

  function html2pdf() {
    return new Html2PdfTask();
  }

  html2pdf.from = function from(element) {
    return new Html2PdfTask(element);
  };

  window.html2pdf = html2pdf;
})();

