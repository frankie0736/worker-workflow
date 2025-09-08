# React + Cloudflare Worker + Workflow 示例

一个全栈应用，展示React前端与Cloudflare Worker和Workflow的集成，实现多步骤计算流程。**现已支持合并部署到单一Worker！**

## 🚀 在线演示

访问: https://simple-worker-workflow.frankiexu32.workers.dev

## 项目结构

```
worker-workflow/
├── frontend/          # React前端应用
│   └── src/
│       └── App.tsx   # 主界面
└── backend/          # Cloudflare Worker + Workflow
    ├── src/
    │   └── index.ts  # Worker和Workflow定义
    └── public/       # 静态文件（前端构建产物）
```

## 功能说明

1. **React前端**: 用户输入数字，发送请求到Worker
2. **Worker接收**: 处理HTTP请求，触发Workflow
3. **Workflow执行**: 分5步处理：
   - 步骤1: 验证是否为数字
   - 步骤2: 加1
   - 步骤3: 乘以2
   - 步骤4: 乘以3
   - 步骤5: 生成最终结果
4. **返回结果**: Worker将结果返回给React前端，突出显示计算结果

## 本地测试

### 1. 安装依赖

```bash
# 后端依赖
cd backend
npm install

# 前端依赖
cd ../frontend
npm install
```

### 2. 启动服务

打开两个终端：

**终端1 - 启动Worker (端口8787)**
```bash
cd backend
npm run dev
```

**终端2 - 启动React (端口5173)**
```bash
cd frontend
npm run dev
```

### 3. 访问应用

打开浏览器访问: http://localhost:5173

### 4. 测试API

```bash
# 直接测试Worker API
curl -X POST http://localhost:8787/process \
  -H "Content-Type: application/json" \
  -d '{"number": 10}'
```

## 部署到生产环境

### 方式1: 合并部署（推荐） - 前端和后端在同一个Worker

```bash
# 1. 构建前端
cd frontend
npm run build

# 2. 复制前端到backend
cd ../backend
mkdir -p public
cp -r ../frontend/dist/* public/

# 3. 部署Worker（包含前端和API）
npx wrangler deploy

# 访问部署的应用：
# https://simple-worker-workflow.frankiexu32.workers.dev
```

### 方式2: 分离部署（传统方式）

#### 部署Worker
```bash
cd backend
npx wrangler deploy
```

#### 部署前端到Cloudflare Pages
```bash
cd frontend
npm run build
npx wrangler pages deploy dist --project-name=my-workflow-app
```

#### 选项B: 部署到Vercel

```bash
cd frontend

# 安装Vercel CLI
npm i -g vercel

# 部署
vercel
```

#### 选项C: 部署到Netlify

```bash
cd frontend

# 构建
npm run build

# 手动上传dist文件夹到Netlify
# 或使用Netlify CLI
npm i -g netlify-cli
netlify deploy --dir=dist --prod
```

## 监控和调试

### 查看Worker日志

```bash
cd backend
npx wrangler tail
```

### 查看Workflow状态

在Cloudflare Dashboard中：
1. 登录 https://dash.cloudflare.com
2. 选择 Workers & Pages
3. 选择你的Worker
4. 查看 Workflows 标签

## 环境变量配置

如需配置环境变量，编辑 `backend/wrangler.toml`:

```toml
[vars]
API_KEY = "your-api-key"
ENVIRONMENT = "production"
```

## 常见问题

### 1. CORS错误
确保Worker中已配置CORS headers：
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
```

### 2. Workflow结果为null
Workflow是异步执行的，可能需要轮询或等待：
- 开发环境：通常立即完成
- 生产环境：可能需要几秒钟

### 3. 本地测试Workflow
确保使用 `wrangler dev` 而不是 `wrangler dev --local`，
因为Workflow需要连接到Cloudflare的服务。

## 技术栈

- **前端**: React + TypeScript + Vite
- **后端**: Cloudflare Worker + Workflows
- **工具**: Wrangler CLI

## 许可

MIT