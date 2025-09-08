# 📦 合并部署指南 - 前后端一体化部署到单个Worker

本指南介绍如何将React前端和Worker后端合并部署到一个Cloudflare Worker中，实现单一URL访问。

## 目录
1. [架构说明](#架构说明)
2. [优势与特点](#优势与特点)
3. [环境准备](#环境准备)
4. [项目结构调整](#项目结构调整)
5. [代码配置](#代码配置)
6. [本地开发](#本地开发)
7. [生产部署](#生产部署)
8. [验证与测试](#验证与测试)
9. [更新流程](#更新流程)
10. [故障排查](#故障排查)

---

## 架构说明

```
┌─────────────────────────────────────┐
│     Cloudflare Worker (单一部署)      │
├─────────────────────────────────────┤
│  ✅ 静态文件服务 (React前端)          │
│  ✅ API端点 (/api/process)           │
│  ✅ Workflow集成 (5步计算流程)        │
│  ✅ 统一的URL访问                     │
└─────────────────────────────────────┘
            ↑
            │ HTTPS请求
            │
       用户浏览器
```

## 优势与特点

### ✅ 优势
- **单一部署单元**: 只需管理一个Worker
- **无CORS问题**: 前后端同源，无需处理跨域
- **更低成本**: 只计费一个Worker
- **更低延迟**: 减少网络跳转
- **简化运维**: 一个URL，一个服务
- **更好的缓存控制**: 统一的缓存策略

### 📋 适用场景
- 中小型应用
- SPA单页应用
- 需要快速部署的项目
- 成本敏感的项目

---

## 环境准备

### 1. 安装必要工具

```bash
# 安装Node.js (推荐v18+)
node --version  # 检查版本

# 安装wrangler CLI
npm install -g wrangler@latest

# 验证安装
wrangler --version
```

### 2. 登录Cloudflare

```bash
# 登录账号
wrangler login

# 验证登录状态
wrangler whoami
```

### 3. 安装项目依赖

```bash
# 前端依赖
cd frontend
npm install

# 后端依赖
cd ../backend
npm install
npm install @cloudflare/kv-asset-handler  # 静态资源处理
```

---

## 项目结构调整

### 目标结构

```
worker-workflow/
├── frontend/                 # React前端
│   ├── src/
│   │   └── App.tsx          # 主应用
│   ├── dist/                # 构建产物
│   └── package.json
│
└── backend/                 # Worker后端
    ├── src/
    │   └── index.ts        # Worker + Workflow
    ├── public/             # 前端静态文件（从frontend/dist复制）
    │   ├── index.html
    │   ├── assets/
    │   └── vite.svg
    ├── wrangler.toml       # Worker配置
    └── package.json
```

---

## 代码配置

### 1. 前端配置 (frontend/src/App.tsx)

```typescript
// 使用相对路径API（重要！）
const handleSubmit = async (e: React.FormEvent) => {
  const response = await fetch('/api/process', {  // 相对路径
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      number: parseInt(number)
    })
  });
  
  const data = await response.json();
  setResult(data);
};
```

### 2. Worker配置 (backend/src/index.ts)

```typescript
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';
const assetManifest = JSON.parse(manifestJSON);

// Worker主函数
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // API路由优先
    if (url.pathname === '/api/process' && request.method === 'POST') {
      return handleAPI(request, env);
    }
    
    // 静态文件服务
    return handleStaticAssets(request, env, ctx);
  }
};

// 静态资源处理
async function handleStaticAssets(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  let pathname = url.pathname;
  
  // 默认路径为 index.html
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // 获取资源
  const path = pathname.slice(1);
  const assetKey = assetManifest[path];
  
  if (assetKey) {
    const asset = await env.__STATIC_CONTENT.get(assetKey);
    if (asset) {
      return new Response(asset, {
        headers: getContentType(path)
      });
    }
  }
  
  // SPA fallback - 返回index.html
  const indexKey = assetManifest['index.html'];
  if (indexKey) {
    const indexAsset = await env.__STATIC_CONTENT.get(indexKey);
    return new Response(indexAsset, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
  
  return new Response('Not Found', { status: 404 });
}
```

### 3. Wrangler配置 (backend/wrangler.toml)

```toml
name = "simple-worker-workflow"
main = "src/index.ts"
compatibility_date = "2024-09-01"
compatibility_flags = ["nodejs_compat"]

# 静态资源配置（关键！）
[site]
bucket = "./public"

# Workflow配置
[[workflows]]
binding = "MY_WORKFLOW"
name = "my-workflow"
class_name = "MyWorkflow"

# 环境变量（可选）
[vars]
ENVIRONMENT = "production"
```

---

## 本地开发

### 方式1: 分别开发（推荐用于开发阶段）

```bash
# 终端1: 启动Worker（API）
cd backend
npx wrangler dev --port 8787

# 终端2: 启动React开发服务器
cd frontend
npm run dev  # 访问 http://localhost:5173

# 开发时前端需要代理到Worker
# 在 vite.config.ts 中配置：
export default {
  server: {
    proxy: {
      '/api': 'http://localhost:8787'
    }
  }
}
```

### 方式2: 合并测试

```bash
# 1. 构建前端
cd frontend
npm run build

# 2. 复制到Worker
cd ../backend
rm -rf public
cp -r ../frontend/dist public

# 3. 启动Worker
npx wrangler dev --port 8787

# 访问 http://localhost:8787 查看完整应用
```

---

## 生产部署

### 📝 部署步骤

```bash
# 1. 构建前端
cd frontend
npm run build

# 2. 复制前端到Worker目录
cd ../backend
rm -rf public
mkdir -p public
cp -r ../frontend/dist/* public/

# 3. 检查文件
ls -la public/
# 应该看到:
# - index.html
# - assets/
# - vite.svg

# 4. 部署到Cloudflare
npx wrangler deploy

# 输出示例：
# ✅ Uploaded 4 assets
# ✅ Deployed simple-worker-workflow
# 🌍 https://simple-worker-workflow.frankiexu32.workers.dev
```

### 🔧 自动化部署脚本

创建 `deploy.sh`:

```bash
#!/bin/bash
set -e

echo "🔨 Building frontend..."
cd frontend
npm run build

echo "📦 Copying to backend..."
cd ../backend
rm -rf public
cp -r ../frontend/dist public

echo "🚀 Deploying to Cloudflare..."
npx wrangler deploy

echo "✅ Deployment complete!"
echo "🌍 Visit: https://simple-worker-workflow.frankiexu32.workers.dev"
```

使用：
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 验证与测试

### 1. 测试静态文件

```bash
# 测试首页
curl https://your-worker.workers.dev/

# 测试静态资源
curl -I https://your-worker.workers.dev/assets/index-xxx.js
```

### 2. 测试API

```bash
# 测试API端点
curl -X POST https://your-worker.workers.dev/api/process \
  -H "Content-Type: application/json" \
  -d '{"number": 10}'
```

### 3. 浏览器测试

1. 访问 `https://your-worker.workers.dev`
2. 输入数字，点击计算
3. 检查结果显示
4. 打开开发者工具查看网络请求

---

## 更新流程

### 前端更新

```bash
# 1. 修改前端代码
cd frontend
# ... 编辑代码 ...

# 2. 重新构建
npm run build

# 3. 复制到backend
cd ../backend
rm -rf public
cp -r ../frontend/dist public

# 4. 部署
npx wrangler deploy
```

### 后端更新

```bash
# 1. 修改Worker代码
cd backend
# ... 编辑 src/index.ts ...

# 2. 直接部署（无需重新构建前端）
npx wrangler deploy
```

### 同时更新

使用上面的 `deploy.sh` 脚本

---

## 故障排查

### 问题1: 404 Not Found

**症状**: 访问网站显示 "Not Found"

**解决**:
```bash
# 检查public目录
ls -la backend/public/

# 确保有index.html
# 如果没有，重新构建和复制
cd frontend && npm run build
cd ../backend && cp -r ../frontend/dist/* public/
npx wrangler deploy
```

### 问题2: API调用失败

**症状**: 前端无法调用API

**检查**:
1. 确保使用相对路径 `/api/process`
2. 检查Worker日志：
```bash
npx wrangler tail
```

### 问题3: 静态资源加载失败

**症状**: JS/CSS文件404

**解决**:
```bash
# 清理并重新部署
cd backend
rm -rf public .wrangler
cp -r ../frontend/dist public
npx wrangler deploy
```

### 问题4: Workflow错误

**症状**: Dashboard显示Workflow Error

**说明**: 这是正常的，因为Workflow在生产环境异步执行。只要功能正常即可。

---

## 最佳实践

### 1. 版本管理

```bash
# package.json 中添加版本脚本
"scripts": {
  "deploy": "npm run build:frontend && npm run copy:frontend && wrangler deploy",
  "build:frontend": "cd ../frontend && npm run build",
  "copy:frontend": "rm -rf public && cp -r ../frontend/dist public"
}
```

### 2. 环境变量

```toml
# wrangler.toml
[env.production]
vars = { ENVIRONMENT = "production" }

[env.staging]
vars = { ENVIRONMENT = "staging" }
```

部署到不同环境：
```bash
npx wrangler deploy --env production
npx wrangler deploy --env staging
```

### 3. 监控

```bash
# 实时日志
npx wrangler tail

# 查看部署历史
npx wrangler deployments list
```

---

## 总结

合并部署方案将前后端统一到一个Worker中，大大简化了部署和维护流程。适合中小型项目快速上线和迭代。

### 核心要点
- ✅ 前端使用相对路径API
- ✅ Worker配置 `[site]` 静态资源
- ✅ 构建时复制前端到 `public` 目录
- ✅ 一次部署，全部上线

### 访问地址
部署成功后，通过单一URL访问：
- 前端界面: `https://your-worker.workers.dev`
- API端点: `https://your-worker.workers.dev/api/process`

祝部署顺利！ 🚀