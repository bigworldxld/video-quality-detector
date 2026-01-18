/**
 * Cloudflare Worker for Video Quality Detection
 * 使用 AI 模型检测视频质量问题
 */

import { analyzeVideoMetadata, detectCorruption, sampleVideoData } from './videoProcessor.js';
import { detectWithHuggingFace, detectWithCloudflareAI } from './aiDetector.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS 处理
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 静态文件服务
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(getHTML(), {
        headers: { ...corsHeaders, 'Content-Type': 'text/html' },
      });
    }

    // API 端点：视频检测
    if (url.pathname === '/api/detect' && request.method === 'POST') {
      return handleVideoDetection(request, env, corsHeaders);
    }

    return new Response('Not Found', { 
      status: 404,
      headers: corsHeaders 
    });
  },
};

/**
 * 处理视频检测请求
 */
async function handleVideoDetection(request, env, corsHeaders) {
  try {
    const formData = await request.formData();
    const videoFile = formData.get('video');
    
    if (!videoFile || !(videoFile instanceof File)) {
      return new Response(
        JSON.stringify({ error: '请上传视频文件' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 检查文件大小（限制 1024MB）
    const maxSize = 1024 * 1024 * 1024;
    if (videoFile.size > maxSize) {
      return new Response(
        JSON.stringify({ error: '视频文件大小不能超过 1024MB' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 读取视频文件
    const videoBuffer = await videoFile.arrayBuffer();
    
    // 分析视频元数据
    const metadata = await analyzeVideoMetadata(videoBuffer, videoFile.type);
    
    // 检测文件损坏
    const corruptionCheck = detectCorruption(videoBuffer);
    
    // 采样视频数据
    const samples = sampleVideoData(videoBuffer, 10);
    
    // 使用 AI 检测视频质量问题
    const detectionResults = await detectVideoIssues(samples, metadata, corruptionCheck, env);

    return new Response(
      JSON.stringify({
        success: true,
        results: detectionResults,
        metadata: {
          size: metadata.size,
          codec: metadata.codec,
          mimeType: metadata.mimeType,
        },
        sampleCount: samples.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('检测错误:', error);
    return new Response(
      JSON.stringify({ 
        error: '检测失败: ' + error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * 使用 AI 检测视频问题
 */
async function detectVideoIssues(samples, metadata, corruptionCheck, env) {
  const issues = {
    glitch: false,      // 花屏
    corruption: false,  // 乱码
    stutter: false,     // 卡顿
    colorShift: false,  // 偏色
    missingPerson: false, // 人物画面缺残
  };

  const details = [];

  // 首先检查文件损坏
  if (corruptionCheck.hasIssue) {
    issues.corruption = true;
    details.push(...corruptionCheck.issues);
  }

  try {
    // 方法1: 使用 Cloudflare AI Workers (如果有)
    if (env.AI) {
      const result = await detectWithCloudflareAI(samples, metadata, env);
      // 合并结果
      Object.assign(issues, result.issues || {});
      details.push(...(result.details || []));
      return {
        issues,
        details,
        confidence: result.confidence || 0.8,
      };
    }

    // 方法2: 使用 Hugging Face Inference API (免费)
    const hfResult = await detectWithHuggingFace(samples, metadata, env);
    // 合并结果
    Object.assign(issues, hfResult.issues || {});
    details.push(...(hfResult.details || []));
    return {
      issues,
      details,
      confidence: hfResult.confidence || 0.7,
    };

  } catch (error) {
    console.error('AI 检测错误:', error);
    // 返回基础检测结果
    details.push('AI 检测服务暂时不可用，请检查 API 配置');
    return {
      issues,
      details,
      confidence: 0.5,
    };
  }
}

/**
 * HTML 页面
 */
function getHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>视频质量检测系统</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }

    .header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }

    .header p {
      opacity: 0.9;
      font-size: 1.1em;
    }

    .content {
      padding: 40px;
    }

    .upload-area {
      border: 3px dashed #667eea;
      border-radius: 15px;
      padding: 60px 20px;
      text-align: center;
      background: #f8f9ff;
      transition: all 0.3s;
      cursor: pointer;
      margin-bottom: 30px;
    }

    .upload-area:hover {
      border-color: #764ba2;
      background: #f0f2ff;
    }

    .upload-area.dragover {
      border-color: #764ba2;
      background: #e8ebff;
      transform: scale(1.02);
    }

    .upload-icon {
      font-size: 4em;
      margin-bottom: 20px;
    }

    .upload-text {
      font-size: 1.2em;
      color: #667eea;
      margin-bottom: 10px;
    }

    .upload-hint {
      color: #999;
      font-size: 0.9em;
    }

    #videoInput {
      display: none;
    }

    .btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 15px 40px;
      font-size: 1.1em;
      border-radius: 50px;
      cursor: pointer;
      transition: all 0.3s;
      margin: 20px auto;
      display: block;
    }

    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .video-preview {
      margin: 30px 0;
      text-align: center;
    }

    .video-preview video {
      max-width: 100%;
      border-radius: 10px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
    }

    .results {
      margin-top: 30px;
      padding: 30px;
      background: #f8f9ff;
      border-radius: 15px;
      display: none;
    }

    .results.show {
      display: block;
    }

    .result-item {
      background: white;
      padding: 20px;
      margin: 15px 0;
      border-radius: 10px;
      border-left: 4px solid #667eea;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }

    .result-item.issue {
      border-left-color: #ff6b6b;
    }

    .result-item.ok {
      border-left-color: #51cf66;
    }

    .result-title {
      font-size: 1.3em;
      font-weight: bold;
      margin-bottom: 10px;
      color: #333;
    }

    .result-details {
      color: #666;
      line-height: 1.6;
    }

    .loading {
      text-align: center;
      padding: 40px;
      display: none;
    }

    .loading.show {
      display: block;
    }

    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .error {
      background: #ffe0e0;
      color: #d32f2f;
      padding: 15px;
      border-radius: 10px;
      margin: 20px 0;
      display: none;
    }

    .error.show {
      display: block;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎬 视频质量检测系统</h1>
      <p>AI 驱动的视频质量问题检测</p>
    </div>

    <div class="content">
      <div class="upload-area" id="uploadArea">
        <div class="upload-icon">📹</div>
        <div class="upload-text">点击或拖拽视频文件到此处</div>
        <div class="upload-hint">支持 MP4, AVI, MOV 等格式，最大 1024MB</div>
        <input type="file" id="videoInput" accept="video/*">
      </div>

      <div class="video-preview" id="videoPreview" style="display: none;">
        <video id="previewVideo" controls></video>
      </div>

      <button class="btn" id="detectBtn" disabled>开始检测</button>

      <div class="error" id="errorMsg"></div>

      <div class="loading" id="loading">
        <div class="spinner"></div>
        <p>正在分析视频，请稍候...</p>
      </div>

      <div class="results" id="results">
        <h2 style="margin-bottom: 20px; color: #333;">检测结果</h2>
        <div id="resultsContent"></div>
      </div>
    </div>
  </div>

  <script>
    const uploadArea = document.getElementById('uploadArea');
    const videoInput = document.getElementById('videoInput');
    const previewVideo = document.getElementById('previewVideo');
    const videoPreview = document.getElementById('videoPreview');
    const detectBtn = document.getElementById('detectBtn');
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    const resultsContent = document.getElementById('resultsContent');
    const errorMsg = document.getElementById('errorMsg');

    let selectedFile = null;

    // 点击上传区域
    uploadArea.addEventListener('click', () => {
      videoInput.click();
    });

    // 拖拽上传
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    });

    // 文件选择
    videoInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
      }
    });

    function handleFileSelect(file) {
      if (!file.type.startsWith('video/')) {
        showError('请选择视频文件');
        return;
      }

      if (file.size > 1024 * 1024 * 1024) {
        showError('文件大小不能超过 1024MB');
        return;
      }

      selectedFile = file;
      const url = URL.createObjectURL(file);
      previewVideo.src = url;
      videoPreview.style.display = 'block';
      detectBtn.disabled = false;
      results.classList.remove('show');
      hideError();
    }

    // 开始检测
    detectBtn.addEventListener('click', async () => {
      if (!selectedFile) return;

      detectBtn.disabled = true;
      loading.classList.add('show');
      results.classList.remove('show');
      hideError();

      const formData = new FormData();
      formData.append('video', selectedFile);

      try {
        const response = await fetch('/api/detect', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || '检测失败');
        }

        displayResults(data);
      } catch (error) {
        showError(error.message);
      } finally {
        loading.classList.remove('show');
        detectBtn.disabled = false;
      }
    });

    function displayResults(data) {
      const issues = data.results?.issues || {};
      const details = data.results?.details || [];
      const confidence = data.results?.confidence || 0;

      let html = \`<div class="result-item">
        <div class="result-title">检测概览</div>
        <div class="result-details">
          <p>文件大小: \${formatFileSize(data.metadata?.size || 0)}</p>
          <p>视频格式: \${data.metadata?.codec || '未知'}</p>
          <p>采样点数: \${data.sampleCount || 0}</p>
          <p>置信度: \${(confidence * 100).toFixed(1)}%</p>
        </div>
      </div>\`;

      const issueNames = {
        glitch: '花屏检测',
        corruption: '乱码检测',
        stutter: '卡顿检测',
        colorShift: '偏色检测',
        missingPerson: '人物画面缺残检测',
      };

      for (const [key, value] of Object.entries(issues)) {
        html += \`<div class="result-item \${value ? 'issue' : 'ok'}">
          <div class="result-title">\${issueNames[key] || key}: \${value ? '❌ 发现问题' : '✅ 正常'}</div>
          <div class="result-details">\${value ? '检测到潜在问题，建议检查视频质量' : '未发现明显问题'}</div>
        </div>\`;
      }

      if (details.length > 0) {
        html += \`<div class="result-item">
          <div class="result-title">详细信息</div>
          <div class="result-details">
            <ul style="margin-left: 20px; margin-top: 10px;">
              \${details.map(d => \`<li>\${d}</li>\`).join('')}
            </ul>
          </div>
        </div>\`;
      }

      resultsContent.innerHTML = html;
      results.classList.add('show');
    }

    function showError(message) {
      errorMsg.textContent = message;
      errorMsg.classList.add('show');
    }

    function hideError() {
      errorMsg.classList.remove('show');
    }

    function formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
  </script>
</body>
</html>`;
}

