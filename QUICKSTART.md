# 快速开始指南

## 5 分钟快速部署

### 步骤 1: 安装依赖

```bash
npm install
```

### 步骤 2: 获取免费的 Hugging Face API Key（可选）

1. 访问 https://huggingface.co/ 注册账号
2. 前往 Settings > Access Tokens
3. 创建新的 Token（选择 Read 权限即可）
4. 复制 Token

### 步骤 3: 配置环境变量

创建 `.dev.vars` 文件（用于本地开发）：

```
HF_API_KEY=你的_huggingface_token
```

### 步骤 4: 本地测试

```bash
npm run dev
```

访问 http://localhost:8787 测试应用

### 步骤 5: 部署到 Cloudflare

```bash
# 登录 Cloudflare（首次需要）
npx wrangler login

# 部署
npm run deploy
```

部署完成后，你会得到一个 URL，例如：`https://video-quality-detector.your-subdomain.workers.dev`

### 步骤 6: 配置生产环境变量

1. 访问 https://dash.cloudflare.com/
2. 进入你的 Worker
3. Settings > Variables and Secrets
4. 添加 `HF_API_KEY` 环境变量

## 使用说明

1. **上传视频**: 拖拽或点击上传视频文件（最大 1024MB）
2. **预览**: 上传后可以预览视频
3. **检测**: 点击"开始检测"按钮
4. **查看结果**: 系统会显示检测结果

## 检测功能

- ✅ 花屏检测
- ✅ 乱码检测  
- ✅ 卡顿检测
- ✅ 偏色检测
- ✅ 人物画面缺残检测

## 常见问题

### Q: 部署失败怎么办？
A: 确保已登录 Cloudflare：`npx wrangler whoami`，如果未登录，运行 `npx wrangler login`

### Q: API Key 是必须的吗？
A: 不是必须的。没有 API Key 时，系统会使用基于规则的检测方法。

### Q: 支持哪些视频格式？
A: 支持 MP4, AVI, MOV, WebM 等常见格式。

### Q: 文件大小限制是多少？
A: 默认 1024MB，可以在代码中修改 `maxSize` 变量。

## 下一步

- 查看 [README.md](README.md) 了解详细功能
- 查看 [DEPLOY.md](DEPLOY.md) 了解高级部署选项
- 自定义检测逻辑和 UI

## 需要帮助？

- 查看 Cloudflare Workers 文档：https://developers.cloudflare.com/workers/
- 查看 Hugging Face API 文档：https://huggingface.co/docs/api-inference/

