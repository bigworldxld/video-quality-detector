# 部署指南

## 部署到 Cloudflare Workers

### 方法一：使用 Wrangler CLI（推荐）

1. **安装 Wrangler**
   ```bash
   npm install -g wrangler
   ```

2. **登录 Cloudflare**
   ```bash
   npx wrangler login
   ```
   这会打开浏览器，让你登录 Cloudflare 账户。

3. **配置项目**
   
   编辑 `wrangler.toml` 文件，确保配置正确：
   ```toml
   name = "video-quality-detector"
   main = "src/index.js"
   compatibility_date = "2024-01-01"
   ```

4. **部署**
   ```bash
   npm run deploy
   ```
   或者
   ```bash
   npx wrangler deploy
   ```

5. **配置环境变量**
   
   部署后，在 Cloudflare Dashboard 中：
   - 进入你的 Worker
   - 前往 Settings > Variables and Secrets
   - 添加环境变量：
     - `HF_API_KEY` (可选，Hugging Face API Key)

### 方法二：使用 Cloudflare Dashboard

1. **访问 Cloudflare Dashboard**
   - 登录 https://dash.cloudflare.com/
   - 选择 Workers & Pages

2. **创建新 Worker**
   - 点击 "Create application"
   - 选择 "Create Worker"
   - 输入名称：`video-quality-detector`

3. **上传代码**
   
   方式 A：直接编辑
   - 在 Dashboard 中编辑代码
   - 复制 `src/index.js` 的内容到编辑器
   - 注意：需要手动合并所有模块代码

   方式 B：使用 GitHub 集成
   - 将代码推送到 GitHub
   - 在 Dashboard 中选择 "Connect to Git"
   - 选择仓库并配置构建设置

4. **配置环境变量**
   - 在 Worker 设置中添加环境变量
   - 添加 `HF_API_KEY` 等变量

5. **部署**
   - 点击 "Save and Deploy"

## 获取免费的 AI API Key

### Hugging Face API Key（推荐，免费）

1. 访问 https://huggingface.co/
2. 注册账号（免费）
3. 前往 Settings > Access Tokens
4. 点击 "New token"
5. 选择权限（Read 即可）
6. 复制生成的 Token
7. 在 Cloudflare Dashboard 中添加为环境变量 `HF_API_KEY`

**免费额度**: 每月 1000 次请求

### Cloudflare AI Workers（可选）

Cloudflare AI Workers 在某些计划中免费提供，每天 100,000 次请求。

1. 在 `wrangler.toml` 中启用 AI：
   ```toml
   [ai]
   binding = "AI"
   ```
2. 在代码中使用 `env.AI` 访问

## 本地开发

1. **安装依赖**
   ```bash
   npm install
   ```

2. **创建环境变量文件**
   
   创建 `.dev.vars` 文件：
   ```
   HF_API_KEY=your_key_here
   ```

3. **启动开发服务器**
   ```bash
   npm run dev
   ```

4. **访问应用**
   
   打开 http://localhost:8787

## 自定义域名

1. 在 Cloudflare Dashboard 中进入你的 Worker
2. 前往 Settings > Triggers
3. 在 "Custom Domains" 部分添加你的域名
4. 按照提示配置 DNS 记录

## 性能优化

### 增加 Worker 内存限制

在 `wrangler.toml` 中：
```toml
[limits]
cpu_ms = 50
```

### 使用 Cloudflare R2 存储大文件

如果需要处理更大的视频文件：

1. 创建 R2 Bucket
2. 在 `wrangler.toml` 中配置：
   ```toml
   [[r2_buckets]]
   binding = "VIDEOS"
   bucket_name = "video-uploads"
   ```

## 故障排除

### 部署失败

- 检查 `wrangler.toml` 配置是否正确
- 确保已登录 Cloudflare：`npx wrangler whoami`
- 检查账户是否有 Workers 权限

### API 调用失败

- 检查环境变量是否正确配置
- 验证 API Key 是否有效
- 查看 Cloudflare Dashboard 中的日志

### 视频上传失败

- 检查文件大小限制（默认 1024MB）
- 确保视频格式受支持
- 查看浏览器控制台错误信息

## 监控和日志

1. **查看实时日志**
   ```bash
   npx wrangler tail
   ```

2. **在 Dashboard 中查看**
   - 进入 Worker
   - 点击 "Logs" 标签
   - 查看实时请求和错误日志

## 更新部署

每次代码更改后：

```bash
npm run deploy
```

或者使用 Dashboard 直接编辑和保存。

