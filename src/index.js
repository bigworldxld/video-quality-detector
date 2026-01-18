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
    const useAI = formData.get('useAI') === 'true';
    const videoFile = formData.get('video');
    const videoUrl = formData.get('videoUrl');
    
    let videoBuffer;
    let mimeType;
    let fileSize;

    // 处理文件上传或 URL
    if (videoFile && videoFile instanceof File) {
      // 文件上传方式
      fileSize = videoFile.size;
      const maxSize = 1024 * 1024 * 1024;
      if (fileSize > maxSize) {
        return new Response(
          JSON.stringify({ error: '视频文件大小不能超过 1024MB' }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      videoBuffer = await videoFile.arrayBuffer();
      mimeType = videoFile.type;
    } else if (videoUrl) {
      // URL 方式
      try {
        const response = await fetch(videoUrl);
        if (!response.ok) {
          throw new Error(`无法获取视频: ${response.status} ${response.statusText}`);
        }
        videoBuffer = await response.arrayBuffer();
        fileSize = videoBuffer.byteLength;
        mimeType = response.headers.get('content-type') || 'video/mp4';
      } catch (error) {
        return new Response(
          JSON.stringify({ error: '无法加载视频 URL: ' + error.message }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    } else {
      return new Response(
        JSON.stringify({ error: '请上传视频文件或提供视频 URL' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    // 提取视频帧（如果前端已提取）
    const extractedFrames = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('frame_') && value instanceof File) {
        const frameBuffer = await value.arrayBuffer();
        extractedFrames.push(new Uint8Array(frameBuffer));
      }
    }
    
    // 分析视频元数据
    const metadata = await analyzeVideoMetadata(videoBuffer, mimeType);
    // 添加提取的帧到元数据（仅在启用 AI 时使用）
    if (useAI) {
      metadata.extractedFrames = extractedFrames;
    }
    
    // 检测文件损坏
    const corruptionCheck = detectCorruption(videoBuffer);
    
    // 采样视频数据
    const samples = sampleVideoData(videoBuffer, 10);
    
    // 使用 AI 或默认检测视频质量问题
    const detectionResults = await detectVideoIssues(samples, metadata, corruptionCheck, env, useAI);
    // 添加使用的检测模式信息
    detectionResults.usedAI = useAI;

    return new Response(
      JSON.stringify({
        success: true,
        results: detectionResults,
        metadata: {
          size: metadata.size || fileSize,
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
async function detectVideoIssues(samples, metadata, corruptionCheck, env, useAI = true) {
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

  // 如果未启用 AI，只使用规则引擎检测
  if (!useAI) {
    const features = extractFeatures(samples, metadata);
    const ruleBasedResults = ruleBasedDetection(features, metadata);
    Object.assign(issues, ruleBasedResults.issues || {});
    details.push(...(ruleBasedResults.details || []));
    details.push('使用规则引擎检测（AI 已关闭）');
    return {
      issues,
      details,
      confidence: 0.6,
    };
  }

  // 启用 AI 检测
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
    // 如果 AI 检测失败，回退到规则引擎
    const features = extractFeatures(samples, metadata);
    const ruleBasedResults = ruleBasedDetection(features, metadata);
    Object.assign(issues, ruleBasedResults.issues || {});
    details.push(...(ruleBasedResults.details || []));
    details.push('AI 检测失败，已回退到规则引擎检测');
    return {
      issues,
      details,
      confidence: 0.5,
    };
  }
}

/**
 * 提取视频特征（用于规则引擎）
 */
function extractFeatures(samples, metadata) {
  const features = {
    dataVariance: [],
    dataMean: [],
    fileSize: metadata.size,
    codec: metadata.codec,
  };

  samples.forEach(sample => {
    features.dataVariance.push(sample.variance);
    features.dataMean.push(sample.mean);
  });

  const varianceChanges = [];
  for (let i = 1; i < features.dataVariance.length; i++) {
    const change = Math.abs(features.dataVariance[i] - features.dataVariance[i - 1]);
    varianceChanges.push(change);
  }

  features.varianceVolatility = varianceChanges.reduce((a, b) => a + b, 0) / varianceChanges.length;
  features.maxVarianceChange = varianceChanges.length > 0 ? Math.max(...varianceChanges) : 0;

  return features;
}

/**
 * 基于规则的检测
 */
function ruleBasedDetection(features, metadata) {
  const results = {
    glitch: false,
    corruption: false,
    stutter: false,
    colorShift: false,
    missingPerson: false,
    details: [],
  };

  // 检测花屏：数据方差异常高
  if (features.varianceVolatility > 5000) {
    results.glitch = true;
    results.details.push('检测到数据异常波动，可能存在花屏问题');
  }

  // 检测乱码：文件头异常或数据模式异常
  if (!metadata.codec) {
    results.corruption = true;
    results.details.push('无法识别视频编码格式，可能存在乱码或文件损坏');
  }

  // 检测卡顿：方差变化过大
  if (features.maxVarianceChange > 10000) {
    results.stutter = true;
    results.details.push('检测到数据不连续性，可能存在卡顿问题');
  }

  // 偏色和人物检测需要实际的图像分析
  results.details.push('偏色和人物画面检测需要视频帧图像分析（请启用 AI 检测）');

  return results;
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

    .url-input-section {
      margin: 30px 0;
      padding: 20px;
      background: #f8f9ff;
      border-radius: 15px;
    }

    .url-input-section h3 {
      margin-bottom: 15px;
      color: #667eea;
      font-size: 1.2em;
    }

    .url-input-wrapper {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
    }

    .url-input {
      flex: 1;
      padding: 12px 15px;
      border: 2px solid #e0e0e0;
      border-radius: 10px;
      font-size: 1em;
      transition: border-color 0.3s;
    }

    .url-input:focus {
      outline: none;
      border-color: #667eea;
    }

    .url-btn {
      padding: 12px 25px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      font-size: 1em;
      transition: all 0.3s;
    }

    .url-btn:hover {
      background: #764ba2;
      transform: translateY(-2px);
    }

    .url-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .divider {
      text-align: center;
      margin: 30px 0;
      color: #999;
      position: relative;
    }

    .divider::before,
    .divider::after {
      content: '';
      position: absolute;
      top: 50%;
      width: 40%;
      height: 1px;
      background: #e0e0e0;
    }

    .divider::before {
      left: 0;
    }

    .divider::after {
      right: 0;
    }

    .ai-toggle-section {
      margin: 20px 0;
      padding: 20px;
      background: #f8f9ff;
      border-radius: 15px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .ai-toggle-label {
      display: flex;
      align-items: center;
      gap: 15px;
      font-size: 1.1em;
      color: #333;
    }

    .toggle-switch {
      position: relative;
      width: 60px;
      height: 30px;
    }

    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #ccc;
      transition: 0.4s;
      border-radius: 30px;
    }

    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 22px;
      width: 22px;
      left: 4px;
      bottom: 4px;
      background-color: white;
      transition: 0.4s;
      border-radius: 50%;
    }

    .toggle-switch input:checked + .toggle-slider {
      background-color: #667eea;
    }

    .toggle-switch input:checked + .toggle-slider:before {
      transform: translateX(30px);
    }

    .toggle-switch input:focus + .toggle-slider {
      box-shadow: 0 0 1px #667eea;
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
      <!-- AI 开关 -->
      <div class="ai-toggle-section">
        <div class="ai-toggle-label">
          <span>🤖 使用 AI 模型检测</span>
          <span style="font-size: 0.9em; color: #666;">(需要配置 API Key)</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="aiToggle" checked>
          <span class="toggle-slider"></span>
        </label>
      </div>

      <!-- URL 输入区域 -->
      <div class="url-input-section">
        <h3>📺 或通过 URL 上传视频</h3>
        <div class="url-input-wrapper">
          <input 
            type="url" 
            id="videoUrlInput" 
            class="url-input" 
            placeholder="请输入视频 URL (例如: https://example.com/video.mp4)"
          >
          <button class="url-btn" id="loadUrlBtn">加载视频</button>
        </div>
      </div>

      <div class="divider">或</div>

      <!-- 文件上传区域 -->
      <div class="upload-area" id="uploadArea">
        <div class="upload-icon">📹</div>
        <div class="upload-text">点击或拖拽视频文件到此处</div>
        <div class="upload-hint">支持 MP4, AVI, MOV 等格式，最大 1024MB</div>
        <input type="file" id="videoInput" accept="video/*">
      </div>

      <div class="video-preview" id="videoPreview" style="display: none;">
        <video id="previewVideo" controls crossorigin="anonymous"></video>
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
    const aiToggle = document.getElementById('aiToggle');
    const videoUrlInput = document.getElementById('videoUrlInput');
    const loadUrlBtn = document.getElementById('loadUrlBtn');

    let selectedFile = null;
    let videoSource = null; // 'file' 或 'url'

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
      videoSource = 'file';
      const url = URL.createObjectURL(file);
      previewVideo.src = url;
      previewVideo.crossOrigin = null; // 本地文件不需要 CORS
      videoPreview.style.display = 'block';
      detectBtn.disabled = false;
      results.classList.remove('show');
      hideError();

      // 等待视频加载元数据
      previewVideo.addEventListener('loadedmetadata', () => {
        console.log('视频元数据加载完成:', {
          duration: previewVideo.duration,
          width: previewVideo.videoWidth,
          height: previewVideo.videoHeight
        });
      }, { once: true });
    }

    // URL 加载视频
    loadUrlBtn.addEventListener('click', async () => {
      const url = videoUrlInput.value.trim();
      if (!url) {
        showError('请输入视频 URL');
        return;
      }

      if (!isValidUrl(url)) {
        showError('请输入有效的 URL');
        return;
      }

      loadUrlBtn.disabled = true;
      loading.classList.add('show');
      hideError();

      try {
        // 设置视频源
        selectedFile = null;
        videoSource = 'url';
        previewVideo.crossOrigin = 'anonymous'; // 设置 CORS，允许提取帧
        previewVideo.src = url;
        videoPreview.style.display = 'block';
        detectBtn.disabled = false;
        results.classList.remove('show');

        // 等待视频加载
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('视频加载超时，请检查 URL 是否可访问或是否有 CORS 限制'));
          }, 30000); // 30秒超时

          previewVideo.addEventListener('loadedmetadata', () => {
            clearTimeout(timeout);
            resolve();
          }, { once: true });
          
          previewVideo.addEventListener('error', (e) => {
            clearTimeout(timeout);
            let errorMsg = '视频加载失败，可能是 CORS 限制或 URL 无效';
            if (previewVideo.error) {
              errorMsg = '视频加载失败 (错误代码: ' + previewVideo.error.code + ')';
            }
            reject(new Error(errorMsg));
          }, { once: true });
        });

      } catch (error) {
        showError(error.message);
        detectBtn.disabled = true;
      } finally {
        loading.classList.remove('show');
        loadUrlBtn.disabled = false;
      }
    });

    // URL 输入框回车键
    videoUrlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        loadUrlBtn.click();
      }
    });

    function isValidUrl(string) {
      try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch (_) {
        return false;
      }
    }

    // 开始检测
    detectBtn.addEventListener('click', async () => {
      // 检查是否有视频源（文件或URL）
      if (!selectedFile && !previewVideo.src) {
        showError('请先上传视频文件或输入视频 URL');
        return;
      }

      detectBtn.disabled = true;
      loading.classList.add('show');
      results.classList.remove('show');
      hideError();

      console.log('开始检测，视频源:', videoSource, '使用AI:', aiToggle.checked);

      try {
        // 检查视频是否已加载
        if (!previewVideo.videoWidth || !previewVideo.videoHeight) {
          throw new Error('视频尺寸未知，请等待视频加载完成后再试');
        }

        if (!previewVideo.duration || isNaN(previewVideo.duration) || previewVideo.duration <= 0) {
          throw new Error('视频时长无效，请检查视频文件是否正确');
        }

        console.log('视频信息:', {
          width: previewVideo.videoWidth,
          height: previewVideo.videoHeight,
          duration: previewVideo.duration
        });

        // 更新加载提示
        const loadingText = loading.querySelector('p');
        if (loadingText) loadingText.textContent = '正在提取视频帧...';

        console.log('开始提取视频帧...');
        
        // 提取视频帧（添加超时保护）
        const frames = await Promise.race([
          extractVideoFrames(previewVideo, 5),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('视频帧提取超时（30秒），请重试')), 30000)
          )
        ]);

        console.log('成功提取帧数:', frames.length);

        if (loadingText) loadingText.textContent = '正在分析视频，请稍候...';

        const formData = new FormData();
        
        // 根据视频来源添加数据
        if (videoSource === 'file' && selectedFile) {
          formData.append('video', selectedFile);
        } else if (videoSource === 'url') {
          formData.append('videoUrl', previewVideo.src);
        }
        
        // 添加 AI 开关状态
        formData.append('useAI', aiToggle.checked ? 'true' : 'false');
        
        // 将提取的帧添加到 FormData
        frames.forEach((frame, index) => {
          formData.append(\`frame_\${index}\`, frame, \`frame_\${index}.jpg\`);
        });

        console.log('发送检测请求...');
        
        const response = await fetch('/api/detect', {
          method: 'POST',
          body: formData,
        });

        console.log('检测响应状态:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('检测请求失败:', errorText);
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            errorData = { error: errorText || '检测失败' };
          }
          throw new Error(errorData.error || '检测失败');
        }

        const data = await response.json();
        console.log('检测完成，结果:', data);

        if (!response.ok) {
          throw new Error(data.error || '检测失败');
        }

        displayResults(data);
      } catch (error) {
        console.error('检测过程错误:', error);
        const errorMessage = error.message || '检测失败，请重试';
        console.error('错误详情:', {
          message: errorMessage,
          stack: error.stack,
          name: error.name
        });
        showError(errorMessage);
      } finally {
        loading.classList.remove('show');
        const loadingText = loading.querySelector('p');
        if (loadingText) loadingText.textContent = '正在分析视频，请稍候...';
        detectBtn.disabled = false;
      }
    });

    /**
     * 从视频中提取帧
     * @param {HTMLVideoElement} video - 视频元素
     * @param {number} count - 要提取的帧数
     * @returns {Promise<Array<Blob>>} 提取的帧图像
     */
    async function extractVideoFrames(video, count = 5) {
      // 检查视频是否已准备好
      if (!video.videoWidth || !video.videoHeight || !video.duration || isNaN(video.duration)) {
        throw new Error('视频未准备好，无法提取帧');
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const duration = video.duration;
      const interval = Math.max(0.1, duration / (count + 1));
      const frames = [];
      
      // 顺序提取帧，避免并发冲突
      for (let i = 1; i <= count; i++) {
        const time = Math.min(interval * i, duration - 0.1);
        
        try {
          const blob = await extractSingleFrame(video, canvas, ctx, time, i);
          if (blob) {
            frames.push(blob);
          }
        } catch (error) {
          console.warn(\`提取第 \${i} 帧失败:\`, error);
          // 继续提取其他帧
        }
      }
      
      if (frames.length === 0) {
        throw new Error('无法提取任何视频帧，请检查视频格式');
      }
      
      return frames;
    }

    /**
     * 提取单个视频帧
     * @param {HTMLVideoElement} video - 视频元素
     * @param {HTMLCanvasElement} canvas - 画布元素
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {number} time - 要提取的时间点（秒）
     * @param {number} index - 帧索引
     * @returns {Promise<Blob>} 提取的帧图像
     */
    function extractSingleFrame(video, canvas, ctx, time, index) {
      return new Promise((resolve, reject) => {
        // 设置超时
        const timeout = setTimeout(() => {
          reject(new Error(\`提取第 \${index} 帧超时\`));
        }, 5000);

        // 保存原始时间
        const originalTime = video.currentTime;
        let seeked = false;

        const onSeeked = () => {
          if (seeked) return; // 防止重复触发
          seeked = true;
          clearTimeout(timeout);
          
          try {
            // 清除画布
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // 绘制视频帧
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            // 转换为 Blob
            canvas.toBlob((blob) => {
              video.removeEventListener('seeked', onSeeked);
              video.removeEventListener('error', onError);
              
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('无法将帧转换为图像'));
              }
            }, 'image/jpeg', 0.9);
          } catch (error) {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            clearTimeout(timeout);
            reject(error);
          }
        };

        const onError = (e) => {
          clearTimeout(timeout);
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
          reject(new Error('视频跳转失败'));
        };

        video.addEventListener('seeked', onSeeked, { once: true });
        video.addEventListener('error', onError, { once: true });
        
        // 设置视频时间
        video.currentTime = time;
      });
    }

    function displayResults(data) {
      const issues = data.results?.issues || {};
      const details = data.results?.details || [];
      const confidence = data.results?.confidence || 0;
      const usedAI = data.results?.usedAI !== false; // 默认为 true

      let html = \`<div class="result-item">
        <div class="result-title">检测概览</div>
        <div class="result-details">
          <p>文件大小: \${formatFileSize(data.metadata?.size || 0)}</p>
          <p>视频格式: \${data.metadata?.codec || '未知'}</p>
          <p>采样点数: \${data.sampleCount || 0}</p>
          <p>置信度: \${(confidence * 100).toFixed(1)}%</p>
          <p>检测模式: <strong>\${usedAI ? '🤖 AI 模型检测' : '⚙️ 规则引擎检测'}</strong></p>
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

