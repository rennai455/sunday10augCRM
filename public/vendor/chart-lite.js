(function () {
  function resolveContext(target) {
    if (!target) return null;
    if (typeof target.getContext === 'function') {
      return target.getContext('2d');
    }
    return null;
  }

  function drawLine(ctx, points, color) {
    if (!points.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = point.x;
      const y = point.y;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  function drawAxes(ctx, width, height) {
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 10);
    ctx.lineTo(40, height - 30);
    ctx.lineTo(width - 10, height - 30);
    ctx.stroke();
  }

  function scalePoints(data, width, height) {
    const max = Math.max(...data, 1);
    const stepX = (width - 80) / Math.max(data.length - 1, 1);
    return data.map((value, index) => ({
      x: 40 + stepX * index,
      y: height - 30 - (value / max) * (height - 60),
    }));
  }

  class ChartLite {
    constructor(target, config) {
      this.ctx = resolveContext(target);
      if (!this.ctx) throw new Error('ChartLite: canvas context not found');
      this.canvas = this.ctx.canvas;
      this.config = config || {};
      this.draw();
    }

    draw() {
      const { canvas, ctx, config } = this;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      drawAxes(ctx, width, height);
      const datasets = config?.data?.datasets || [];
      const colors = ['#3b82f6', '#10b981', '#ef4444'];
      datasets.forEach((dataset, idx) => {
        const points = scalePoints(dataset.data || [], width, height);
        drawLine(ctx, points, dataset.borderColor || colors[idx % colors.length]);
      });
      const labels = config?.data?.labels || [];
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px sans-serif';
      labels.forEach((label, idx) => {
        const points = scalePoints(new Array(labels.length).fill(0), width, height);
        const x = points[idx]?.x ?? 0;
        ctx.fillText(String(label), x - 10, height - 12);
      });
    }

    update(newConfig) {
      this.config = { ...this.config, ...newConfig };
      this.draw();
    }

    destroy() {
      if (this.ctx) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }
  }

  window.Chart = ChartLite;
})();

