# 视频质量检测系统

一个基于 AI 的视频质量检测系统，可以检测视频中的花屏、乱码、卡顿、偏色、人物画面缺残等问题。支持部署到 Cloudflare Workers，使用免费的 AI API。
开始使用->[基于 AI 的视频质量检测系统](https://video.bigworldxld.dpdns.org/)

## 功能特性

- ✅ **花屏检测** - 检测视频中的画面异常和花屏问题
- ✅ **乱码检测** - 检测视频文件损坏和编码错误
- ✅ **卡顿检测** - 检测视频播放卡顿和不流畅问题
- ✅ **偏色检测** - 检测视频色彩异常和偏色问题
- ✅ **人物画面缺残检测** - 检测人物画面不完整或缺失问题
- 🎨 **现代化 UI** - 美观的用户界面，支持拖拽上传
- ☁️ **Cloudflare 部署** - 可轻松部署到 Cloudflare Workers
- 🆓 **免费 AI API** - 支持 Hugging Face 等免费 AI 服务

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (Vanilla)
- **后端**: Cloudflare Workers
- **AI 服务**: 
  - Hugging Face Inference API (免费)
  - Cloudflare AI Workers (可选)
  - OpenAI API (可选，需要 API Key)

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.dev.vars` 文件（用于本地开发）或通过 Cloudflare Dashboard 配置环境变量：

```bash
# Hugging Face API Key (可选，免费注册: https://huggingface.co/)
HF_API_KEY=your_huggingface_api_key

# OpenAI API Key (可选，需要付费)
OPENAI_API_KEY=your_openai_api_key
```

**获取免费的 Hugging Face API Key:**
1. 访问 https://huggingface.co/
2. 注册账号
3. 前往 Settings > Access Tokens
4. 创建新的 Token
5. 将 Token 添加到环境变量

### 3. 本地开发

```bash
npm run dev
```

访问 http://localhost:8787 查看应用

### 4. 部署到 Cloudflare

#### 方式一：使用 Wrangler CLI

```bash
# 登录 Cloudflare
npx wrangler login

# 部署
npm run deploy
```

#### 方式二：使用 Cloudflare Dashboard

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 选择 Workers & Pages
3. 创建新的 Worker
4. 上传项目代码或连接 GitHub 仓库
5. 在 Settings > Variables 中添加环境变量

### 5. 配置环境变量（生产环境）

在 Cloudflare Dashboard 中：
1. 进入你的 Worker
2. 前往 Settings > Variables and Secrets
3. 添加以下环境变量：
   - `HF_API_KEY` (可选)
   - `OPENAI_API_KEY` (可选)

## 使用说明

1. **上传视频**: 点击上传区域或拖拽视频文件（支持 MP4, AVI, MOV 等格式，最大 1024MB）
2. **预览视频**: 上传后可以预览视频
3. **开始检测**: 点击"开始检测"按钮
4. **查看结果**: 系统会显示详细的检测结果，包括各种问题的检测状态

## 项目结构

``` json
.
├── src/
│   ├── index.js          # 主入口文件，处理 HTTP 请求
│   ├── videoProcessor.js # 视频处理工具（元数据分析、损坏检测等）
│   └── aiDetector.js     # AI 检测模块（支持多种 AI 服务）
├── package.json          # 项目依赖配置
├── wrangler.toml        # Cloudflare Workers 配置
└── README.md            # 项目文档
```

## 检测原理

### 1. 文件完整性检测
- 检查文件头是否符合视频格式规范
- 检测文件大小是否异常

### 2. 数据特征分析
- 采样视频数据块
- 分析数据方差和变化率
- 检测异常波动（可能指示花屏或卡顿）

### 3. AI 模型检测
- 使用 Hugging Face 的图像分类模型（需要视频帧提取）
- 使用 Cloudflare AI Workers（如果可用）
- 基于规则的初步检测

## 限制说明

⚠️ **重要提示**: 

由于 Cloudflare Workers 环境的限制，完整的视频帧提取和图像分析需要额外的服务支持：

1. **视频帧提取**: Workers 环境不支持完整的视频解码，建议：
   - 使用 FFmpeg.wasm（客户端处理）
   - 使用外部视频处理服务
   - 使用 Cloudflare R2 + 外部 Worker 处理

2. **完整 AI 检测**: 当前版本使用基于规则的检测和数据分析。要启用完整的 AI 检测：
   - 需要先将视频帧提取为图像
   - 将图像转换为 base64 格式
   - 调用 Hugging Face 或其他 AI 服务的图像分类 API

## 改进建议

### 短期改进
- [ ] 添加客户端视频帧提取（使用 FFmpeg.wasm）
- [ ] 实现更完善的视频元数据解析
- [ ] 添加检测进度显示

### 长期改进
- [ ] 集成专业的视频质量检测模型
- [ ] 支持批量视频检测
- [ ] 添加检测报告导出功能
- [ ] 支持视频修复建议

## 免费 AI API 推荐

1. **Hugging Face Inference API**
   - 免费额度：每月 1000 次请求
   - 注册：https://huggingface.co/
   - 适合：图像分类、对象检测

2. **Cloudflare AI Workers**
   - 免费额度：每天 100,000 次请求
   - 需要：Cloudflare 账户
   - 适合：文本处理、基础 AI 任务

3. **Replicate API**
   - 免费额度：有限免费额度
   - 适合：视频处理、图像生成

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 支持

如有问题，请提交 Issue 或联系开发者。

---

**注意**: 这是一个演示项目，实际生产使用可能需要更完善的视频处理流程和 AI 模型集成。

