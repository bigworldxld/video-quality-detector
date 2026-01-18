/**
 * AI 检测模块
 * 使用免费的 AI API 进行视频质量检测
 */

/**
 * 使用 Hugging Face Inference API 检测
 * 免费 API，无需信用卡
 */
export async function detectWithHuggingFace(videoSamples, metadata, env) {
  const HF_API_KEY = env.HF_API_KEY || '';
  const baseUrl = 'https://router.huggingface.co/hf-inference/models';
  
  const results = {
    glitch: false,
    corruption: false,
    stutter: false,
    colorShift: false,
    missingPerson: false,
    details: [],
    confidence: 0,
  };

  try {
    // 方法1: 使用图像质量评估模型
    // 注意：需要先将视频帧转换为图像
    // 这里使用文本/数据分析模型作为示例
    
    // 分析视频数据特征
    const features = extractFeatures(videoSamples, metadata);
    
    // 使用简单的规则引擎进行初步检测
    const ruleBasedResults = ruleBasedDetection(features, metadata);
    
    // 如果有 Hugging Face API Key，可以调用实际的模型
    if (HF_API_KEY) {
      // 检查是否有提取的视频帧图像
      const videoFrames = metadata.extractedFrames || [];
      
      if (videoFrames.length > 0) {
        // 对每个帧进行 AI 检测
        const frameResults = await Promise.all(
          videoFrames.slice(0, 5).map(async (frameData, index) => {
            try {
              return await analyzeFrameWithHF(frameData, HF_API_KEY, baseUrl, index);
            } catch (error) {
              console.error(`帧 ${index} 分析失败:`, error);
              return null;
            }
          })
        );

        // 合并帧检测结果
        const validResults = frameResults.filter(r => r !== null);
        if (validResults.length > 0) {
          const aiDetectedIssues = aggregateFrameResults(validResults);
          // 合并 AI 检测结果到最终结果
          Object.assign(results, aiDetectedIssues);
          results.confidence = Math.max(results.confidence, 0.85);
          results.details.push(`使用 AI 模型分析了 ${validResults.length} 个视频帧`);
        }
      } else {
        results.details.push('提示：未检测到视频帧图像，使用规则引擎检测');
      }
    }

    // 合并规则检测结果
    Object.assign(results, ruleBasedResults);
    results.confidence = 0.7;
    results.details.push('使用规则引擎和数据分析进行检测');
    results.details.push('提示：完整检测需要视频帧提取，建议使用 FFmpeg 预处理');

    return results;
  } catch (error) {
    console.error('Hugging Face 检测错误:', error);
    results.details.push('AI 检测服务错误: ' + error.message);
    return results;
  }
}

/**
 * 使用 Cloudflare AI Workers 检测
 */
export async function detectWithCloudflareAI(videoSamples, metadata, env) {
  const results = {
    glitch: false,
    corruption: false,
    stutter: false,
    colorShift: false,
    missingPerson: false,
    details: [],
    confidence: 0,
  };

  try {
    if (!env.AI) {
      throw new Error('Cloudflare AI 未配置');
    }

    // 使用 Cloudflare AI Workers
    // 示例：图像分类
    // const response = await env.AI.run(
    //   '@cf/meta/m2m100-1.2b',
    //   { text: "analyze video quality" }
    // );

    results.details.push('Cloudflare AI 检测（需要配置相应模型）');
    results.confidence = 0.8;

    return results;
  } catch (error) {
    console.error('Cloudflare AI 检测错误:', error);
    results.details.push('Cloudflare AI 检测错误: ' + error.message);
    return results;
  }
}

/**
 * 提取视频特征
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

  // 计算方差的变化率（可能指示卡顿或花屏）
  const varianceChanges = [];
  for (let i = 1; i < features.dataVariance.length; i++) {
    const change = Math.abs(features.dataVariance[i] - features.dataVariance[i - 1]);
    varianceChanges.push(change);
  }

  features.varianceVolatility = varianceChanges.reduce((a, b) => a + b, 0) / varianceChanges.length;
  features.maxVarianceChange = Math.max(...varianceChanges);

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

  // 偏色和人物检测需要实际的图像分析，这里只能做基础提示
  results.details.push('偏色和人物画面检测需要视频帧图像分析');

  return results;
}

/**
 * 使用 Hugging Face API 分析单个视频帧
 * @param {Uint8Array|ArrayBuffer} frameData - 视频帧数据（二进制）
 * @param {string} apiKey - Hugging Face API Key
 * @param {string} baseUrl - API 基础 URL
 * @param {number} frameIndex - 帧索引
 */
async function analyzeFrameWithHF(frameData, apiKey, baseUrl, frameIndex) {
  try {
    let imageData;

    // 处理不同的输入格式
    if (frameData instanceof ArrayBuffer) {
      imageData = new Uint8Array(frameData);
    } else if (frameData instanceof Uint8Array) {
      imageData = frameData;
    } else {
      throw new Error('不支持的帧数据格式，需要 Uint8Array 或 ArrayBuffer');
    }

    // 调用 Hugging Face API（使用二进制图像数据，按照 curl 示例格式）
    const response = await fetch(
      `${baseUrl}/google/vit-base-patch16-224`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'image/jpeg', // 使用 image/jpeg 作为 Content-Type
        },
        body: imageData, // 直接发送二进制数据（--data-binary 格式）
      }
    );

    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
      } catch (e) {
        errorText = `HTTP ${response.status}`;
      }
      
      // 如果是模型加载中，等待后重试
      if (response.status === 503) {
        const retryAfter = response.headers.get('Retry-After') || '10';
        // 可以选择重试逻辑
        throw new Error(`模型正在加载，请稍后重试 (等待 ${retryAfter} 秒)`);
      }
      
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    
    // 解析模型输出，检测视频质量问题
    return {
      frameIndex,
      rawResult: result,
      issues: parseModelOutput(result),
    };
  } catch (error) {
    console.error(`帧 ${frameIndex} AI 分析错误:`, error);
    throw error;
  }
}

/**
 * 解析模型输出，识别视频质量问题
 */
function parseModelOutput(modelResult) {
  const issues = {
    glitch: false,
    corruption: false,
    stutter: false,
    colorShift: false,
    missingPerson: false,
  };

  // 如果返回的是分类结果数组
  if (Array.isArray(modelResult)) {
    const labels = modelResult.map(item => 
      item.label ? item.label.toLowerCase() : ''
    ).join(' ');

    // 检测花屏相关关键词
    if (labels.includes('glitch') || labels.includes('corrupt') || labels.includes('error')) {
      issues.glitch = true;
      issues.corruption = true;
    }

    // 检测人物相关
    if (!labels.includes('person') && !labels.includes('human') && !labels.includes('face')) {
      // 如果预期有人物但未检测到，可能存在问题
      // 这里需要根据实际场景调整
    }
  }

  // 如果返回的是单个对象
  if (modelResult.label) {
    const label = modelResult.label.toLowerCase();
    if (label.includes('glitch') || label.includes('corrupt')) {
      issues.glitch = true;
      issues.corruption = true;
    }
  }

  return issues;
}

/**
 * 聚合多个帧的检测结果
 */
function aggregateFrameResults(frameResults) {
  const aggregated = {
    glitch: false,
    corruption: false,
    stutter: false,
    colorShift: false,
    missingPerson: false,
  };

  // 统计每个问题的出现次数
  const issueCounts = {
    glitch: 0,
    corruption: 0,
    stutter: 0,
    colorShift: 0,
    missingPerson: 0,
  };

  frameResults.forEach(result => {
    if (result && result.issues) {
      Object.keys(result.issues).forEach(issue => {
        if (result.issues[issue]) {
          issueCounts[issue]++;
        }
      });
    }
  });

  // 如果超过 30% 的帧检测到问题，则认为存在该问题
  const threshold = frameResults.length * 0.3;
  Object.keys(aggregated).forEach(issue => {
    if (issueCounts[issue] > threshold) {
      aggregated[issue] = true;
    }
  });

  return aggregated;
}

/**
 * 使用 OpenAI API（如果用户有免费额度）
 */
export async function detectWithOpenAI(videoSamples, metadata, env) {
  const OPENAI_API_KEY = env.OPENAI_API_KEY;
  
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API Key 未配置');
  }

  // 注意：OpenAI API 需要付费，但新用户有免费额度
  // 这里提供接口，但实际使用需要将视频帧转换为图像
  
  const results = {
    glitch: false,
    corruption: false,
    stutter: false,
    colorShift: false,
    missingPerson: false,
    details: [],
    confidence: 0,
  };

  results.details.push('OpenAI API 检测（需要配置 API Key 和视频帧提取）');
  
  return results;
}

