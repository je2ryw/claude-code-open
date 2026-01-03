// 分块加载模块
// 此文件实现了 chunked-v1 格式的蓝图分块加载功能

(function() {
  'use strict';

  // ============ 全局状态扩展 ============
  // index 和 chunkCache 已在 app.js 中定义

  // ============ 核心加载函数 ============

  /**
   * 加载 chunk（带缓存）
   * @param {string} chunkPath - chunk 路径，如 "chunks/src_core.json" 或 "src_core"
   * @returns {Promise<Object>} chunk 数据
   */
  window.loadChunk = async function(chunkPath) {
    // 规范化路径：移除 chunks/ 前缀和 .json 后缀
    const normalizedPath = chunkPath.replace(/^chunks\//, '').replace(/\.json$/, '');

    // 检查缓存
    if (window.chunkCache.has(normalizedPath)) {
      return window.chunkCache.get(normalizedPath);
    }

    // 显示加载指示器
    const loadingEl = document.querySelector('.loading');
    const originalDisplay = loadingEl ? loadingEl.style.display : 'none';
    const originalText = loadingEl ? loadingEl.textContent : '';

    if (loadingEl) {
      loadingEl.style.display = 'block';
      loadingEl.textContent = '加载 chunk...';
    }

    try {
      const response = await fetch(`/api/chunk/${normalizedPath}?_t=${Date.now()}`);
      if (!response.ok) {
        throw new Error(`加载 chunk 失败: ${response.statusText}`);
      }

      const chunkData = await response.json();

      // 缓存
      window.chunkCache.set(normalizedPath, chunkData);

      return chunkData;
    } finally {
      // 恢复加载指示器
      if (loadingEl) {
        loadingEl.style.display = originalDisplay;
        loadingEl.textContent = originalText;
      }
    }
  };

  /**
   * 基于 index 渲染统计信息
   */
  window.renderStatsFromIndex = function() {
    if (!window.index || !window.index.statistics) {
      console.warn('index.statistics 不存在');
      return;
    }

    const stats = window.index.statistics;

    const items = [
      { label: '模块数', value: stats.totalModules || 0 },
      { label: '符号数', value: stats.totalSymbols || 0 },
      { label: '代码行', value: (stats.totalLines || 0).toLocaleString() },
      { label: 'Chunk 数', value: stats.chunkCount || 0 },
    ];

    const html = items.map(item =>
      `<div class="stat-item"><span>${item.label}</span><span class="stat-value">${item.value}</span></div>`
    ).join('');

    document.getElementById('stats').innerHTML = html;
  };

  /**
   * 从 index 绘制架构图（分块模式）
   */
  window.drawArchitectureFromIndex = async function() {
    const container = document.getElementById('graph-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select('#graph')
      .attr('width', width)
      .attr('height', height);

    svg.selectAll('*').remove();

    const zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);
    const g = svg.append('g');

    // 显示项目信息
    if (window.index.project) {
      document.getElementById('project-name').textContent = window.index.project.name || '项目架构';
      document.getElementById('project-desc').textContent = window.index.project.description || '';
      document.getElementById('project-header').classList.add('active');
    }

    const layers = window.index.views.architectureLayers;
    const layerOrder = ['presentation', 'business', 'data', 'infrastructure', 'crossCutting'];

    // 布局参数
    const layerHeight = 100;
    const layerGap = 40;
    const startY = 80;
    const layerWidth = 600;

    // 绘制架构层
    layerOrder.forEach((layerKey, idx) => {
      const layer = layers[layerKey];
      if (!layer) return;

      const y = startY + idx * (layerHeight + layerGap);
      const x = (width - layerWidth) / 2;

      const layerGroup = g.append('g')
        .attr('class', `arch-layer layer-${layerKey}`)
        .attr('transform', `translate(${x}, ${y})`);

      // 层背景
      layerGroup.append('rect')
        .attr('width', layerWidth)
        .attr('height', layerHeight)
        .attr('rx', 8)
        .style('fill', '#16213e')
        .style('stroke', '#4ecdc4')
        .style('stroke-width', 2)
        .style('cursor', 'pointer');

      // 层名称
      layerGroup.append('text')
        .attr('x', layerWidth / 2)
        .attr('y', 35)
        .attr('text-anchor', 'middle')
        .style('fill', '#4ecdc4')
        .style('font-size', '18px')
        .style('font-weight', 'bold')
        .text(layer.name || layerKey);

      // 模块数量
      layerGroup.append('text')
        .attr('x', layerWidth / 2)
        .attr('y', 60)
        .attr('text-anchor', 'middle')
        .style('fill', '#aaa')
        .style('font-size', '14px')
        .text(`${layer.moduleCount} 个模块`);

      // 描述（如果有）
      if (layer.description) {
        layerGroup.append('text')
          .attr('x', layerWidth / 2)
          .attr('y', 80)
          .attr('text-anchor', 'middle')
          .style('fill', '#888')
          .style('font-size', '12px')
          .text(layer.description.slice(0, 50));
      }

      // 点击事件：加载该层的所有 chunk
      layerGroup.on('click', async (event) => {
        event.stopPropagation();
        await onLayerClick(layerKey, layer);
      });
    });

    // 初始缩放
    const bounds = g.node().getBBox();
    if (bounds.width > 0 && bounds.height > 0) {
      const scale = Math.min(
        0.9 * width / bounds.width,
        0.85 * height / bounds.height,
        1.0
      );
      const tx = (width - bounds.width * scale) / 2 - bounds.x * scale;
      const ty = 30;

      svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }

    // 保存到全局
    window.svg = svg;
    window.zoom = zoom;
    window.g = g;
  };

  /**
   * 架构层点击事件：加载该层的所有 chunk
   */
  async function onLayerClick(layerKey, layer) {
    if (!layer.chunkFiles || layer.chunkFiles.length === 0) {
      alert('该层没有模块数据');
      return;
    }

    const loadingEl = document.querySelector('.loading');
    if (loadingEl) {
      loadingEl.style.display = 'block';
      loadingEl.textContent = `加载 ${layer.name} 的模块...`;
    }

    try {
      // 加载该层所有 chunk
      const chunks = await Promise.all(
        layer.chunkFiles.map(f => window.loadChunk(f))
      );

      // 合并 chunk 数据
      const mergedModules = {};
      chunks.forEach(chunk => {
        if (chunk.modules) {
          Object.assign(mergedModules, chunk.modules);
        }
      });

      // 渲染模块列表
      renderLayerModules(layer.name, mergedModules);

      if (loadingEl) {
        loadingEl.style.display = 'none';
      }
    } catch (error) {
      if (loadingEl) {
        loadingEl.textContent = `加载失败: ${error.message}`;
      }
    }
  }

  /**
   * 渲染架构层的模块列表
   */
  function renderLayerModules(layerName, modules) {
    const panel = document.getElementById('details-panel');
    panel.classList.add('active');

    const modulesArray = Object.values(modules);

    let html = `<h3>${layerName}</h3>`;
    html += `<div style="color: #888; margin-bottom: 1rem;">共 ${modulesArray.length} 个模块</div>`;

    modulesArray.forEach(module => {
      html += `<div class="module-item" style="cursor: pointer; padding: 0.5rem; margin: 0.3rem 0; background: #16213e; border-radius: 4px;" onclick="showModuleDetailsFromChunk('${module.id}')">`;
      html += `<div style="color: #4ecdc4; font-weight: bold;">${module.name}</div>`;
      html += `<div style="color: #888; font-size: 0.85rem;">${module.path}</div>`;
      if (module.lines) {
        html += `<div style="color: #aaa; font-size: 0.8rem;">${module.lines} 行</div>`;
      }
      html += '</div>';
    });

    document.getElementById('node-details').innerHTML = html;
  }

  /**
   * 显示模块详情（从 chunk 数据）
   */
  window.showModuleDetailsFromChunk = async function(moduleId) {
    // TODO: 实现从 chunk 中查找并显示模块详情
    // 这需要找到包含该模块的 chunk，然后渲染详情
    console.log('显示模块详情:', moduleId);
    alert('模块详情功能待实现');
  };

  /**
   * 分块模式初始化
   */
  window.loadIndexMode = async function() {
    window.renderStatsFromIndex();

    // 默认显示架构视图（分块模式的主视图）
    if (window.index.views && window.index.views.architectureLayers) {
      window.currentView = 'architecture';
      await window.drawArchitectureFromIndex();
    }
  };

  // ============ 初始化 ============
  console.log('Chunked loader initialized');

})();
