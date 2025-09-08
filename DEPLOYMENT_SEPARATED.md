# 🔀 分离部署指南 - 前后端独立部署

本指南介绍如何将React前端和Worker后端分别部署到Cloudflare Pages和Workers，实现前后端分离架构。

## 目录
1. [架构说明](#架构说明)
2. [优势与特点](#优势与特点)
3. [环境准备](#环境准备)
4. [项目结构](#项目结构)
5. [后端Worker部署](#后端worker部署)
6. [前端Pages部署](#前端pages部署)
7. [CORS配置](#cors配置)
8. [本地开发](#本地开发)
9. [生产环境配置](#生产环境配置)
10. [更新维护](#更新维护)
11. [故障排查](#故障排查)
12. [最佳实践](#最佳实践)

---

## 架构说明

```
┌──────────────────┐         ┌──────────────────┐
│  Cloudflare      │ HTTP    │   Cloudflare     │
│     Pages        │ ──────> │     Worker       │
│  (React前端)     │         │   (API后端)      │
└──────────────────┘         └────────┬─────────┘
                                      │
                                      ▼
                             ┌──────────────────┐
                             │   Cloudflare     │
                             │    Workflow      │
                             │  (业务逻辑处理)  │
                             └──────────────────┘
```

### 访问地址
- 前端: `https://xxxxx.pages.dev`
- 后端API: `https://xxxxx.workers.dev`

## 优势与特点

### ✅ 优势
- **独立扩展**: 前后端可以独立扩展和更新
- **技术栈灵活**: 前端可以使用任何框架
- **独立版本控制**: 前后端可以有不同的发布周期
- **资源优化**: Pages自动优化静态资源
- **全球CDN**: 前端通过Pages CDN加速
- **团队协作**: 前后端团队可以独立工作

### 📋 适用场景
- 大型应用
- 微服务架构
- 需要独立扩展的项目
- 多团队协作项目
- 需要精细化部署控制

---

## 环境准备

### 1. 安装必要工具

```bash
# Node.js (推荐v18+)
node --version

# Wrangler CLI
npm install -g wrangler@latest
wrangler --version

# 其他工具（可选）
npm install -g vercel  # 如果要部署到Vercel
npm install -g netlify-cli  # 如果要部署到Netlify
```

### 2. Cloudflare账号准备

```bash
# 登录Cloudflare
wrangler login

# 验证登录
wrangler whoami
```

---

## 项目结构

```
worker-workflow/
├── frontend/                    # React前端项目
│   ├── src/
│   │   ├── App.tsx             # 主应用
│   │   └── config/
│   │       └── api.config.ts   # API配置
│   ├── .env.development        # 开发环境变量
│   ├── .env.production         # 生产环境变量
│   └── package.json
│
└── backend/                    # Worker后端项目
    ├── src/
    │   └── index.ts           # Worker + Workflow
    ├── wrangler.toml          # Worker配置
    └── package.json
```

---

## 后端Worker部署

### 1. Worker代码配置 (backend/src/index.ts)

```typescript
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

// 定义CORS配置
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',  // 生产环境应改为具体域名
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Worker主函数
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 处理OPTIONS预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    
    // API路由
    if (url.pathname === '/process' && request.method === 'POST') {
      try {
        const body = await request.json();
        
        // 创建Workflow实例
        const instance = await env.MY_WORKFLOW.create({
          params: body
        });
        
        // 处理并返回结果
        const result = await processData(body);
        
        return new Response(JSON.stringify({
          workflowId: instance.id,
          result: result
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        });
      }
    }
    
    // API文档
    if (url.pathname === '/') {
      return new Response(JSON.stringify({
        name: 'Worker + Workflow API',
        version: '1.0.0',
        endpoints: {
          'POST /process': 'Process data with workflow'
        }
      }, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }
};
```

### 2. Worker配置 (backend/wrangler.toml)

```toml
name = "my-worker-api"
main = "src/index.ts"
compatibility_date = "2024-09-01"
compatibility_flags = ["nodejs_compat"]

# Workflow配置
[[workflows]]
binding = "MY_WORKFLOW"
name = "my-workflow"
class_name = "MyWorkflow"

# 环境配置
[env.production]
vars = { ENVIRONMENT = "production" }

[env.staging]
vars = { ENVIRONMENT = "staging" }

# 路由配置（可选）
route = { pattern = "api.yourdomain.com/*" }
```

### 3. 部署Worker

```bash
cd backend

# 开发环境部署
npx wrangler deploy --env staging

# 生产环境部署
npx wrangler deploy --env production

# 输出示例：
# ✅ Deployed my-worker-api
# 🌍 https://my-worker-api.accountname.workers.dev
```

---

## 前端Pages部署

### 1. 前端配置

#### API配置文件 (frontend/src/config/api.config.ts)

```typescript
const API_ENDPOINTS = {
  development: 'http://localhost:8787',
  staging: 'https://my-worker-api-staging.workers.dev',
  production: 'https://my-worker-api.workers.dev'
};

export const API_URL = API_ENDPOINTS[import.meta.env.MODE] || API_ENDPOINTS.production;

export const fetchAPI = async (endpoint: string, options?: RequestInit) => {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }
  
  return response.json();
};
```

#### 环境变量配置

`.env.development`:
```env
VITE_API_URL=http://localhost:8787
VITE_ENV=development
```

`.env.production`:
```env
VITE_API_URL=https://my-worker-api.workers.dev
VITE_ENV=production
```

#### 使用API (frontend/src/App.tsx)

```typescript
import { fetchAPI } from './config/api.config';

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  
  try {
    const result = await fetchAPI('/process', {
      method: 'POST',
      body: JSON.stringify({ number: parseInt(number) })
    });
    
    setResult(result);
  } catch (error) {
    console.error('API Error:', error);
    setError(error.message);
  } finally {
    setLoading(false);
  }
};
```

### 2. 部署到Cloudflare Pages

#### 方式1: 通过Wrangler CLI

```bash
cd frontend

# 构建项目
npm run build

# 首次部署（创建Pages项目）
npx wrangler pages project create my-app-frontend

# 部署
npx wrangler pages deploy dist

# 输出示例：
# ✅ Deployment complete!
# 🌍 https://xxxxx.my-app-frontend.pages.dev
```

#### 方式2: 通过Git集成（推荐）

1. 将代码推送到GitHub/GitLab
2. 在Cloudflare Dashboard中：
   - Workers & Pages → Create application → Pages
   - Connect to Git
   - 选择仓库和分支
   - 配置构建设置：
     ```
     Build command: npm run build
     Build directory: dist
     Root directory: frontend
     ```
   - 添加环境变量：
     ```
     VITE_API_URL = https://my-worker-api.workers.dev
     ```

### 3. 部署到其他平台

#### Vercel部署

```bash
cd frontend

# 安装Vercel CLI
npm i -g vercel

# 部署
vercel

# 配置环境变量
vercel env add VITE_API_URL
```

#### Netlify部署

```bash
cd frontend

# 安装Netlify CLI
npm i -g netlify-cli

# 部署
netlify deploy --dir=dist --prod

# 或通过UI配置环境变量
```

---

## CORS配置

### Worker端CORS配置

```typescript
// 开发环境：允许所有源
const CORS_HEADERS_DEV = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 生产环境：指定具体域名
const CORS_HEADERS_PROD = {
  'Access-Control-Allow-Origin': 'https://my-app.pages.dev',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true',
};

// 根据环境选择
const corsHeaders = env.ENVIRONMENT === 'production' 
  ? CORS_HEADERS_PROD 
  : CORS_HEADERS_DEV;
```

---

## 本地开发

### 完整开发流程

```bash
# 1. 启动后端Worker
cd backend
npx wrangler dev --port 8787

# 2. 启动前端开发服务器
cd ../frontend
npm run dev  # 默认运行在 http://localhost:5173

# 3. 配置代理（在vite.config.ts中）
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
});
```

---

## 生产环境配置

### 1. 域名配置

#### 配置自定义域名

Worker:
```bash
# 在wrangler.toml中添加
route = { pattern = "api.yourdomain.com/*" }

# 或通过Dashboard配置
```

Pages:
```bash
# 在Cloudflare Dashboard中
# Pages项目 → Custom domains → Add domain
# 添加: app.yourdomain.com
```

### 2. 环境变量管理

Worker环境变量:
```bash
# 设置密钥
wrangler secret put API_KEY

# 设置普通变量
wrangler vars put ENVIRONMENT production
```

Pages环境变量:
- Dashboard → Pages项目 → Settings → Environment variables
- 添加生产环境变量

### 3. SSL/TLS配置

Cloudflare自动提供SSL证书，确保：
- SSL/TLS加密模式设为"Full"或"Full (strict)"
- 启用"Always Use HTTPS"

---

## 更新维护

### 前端更新流程

```bash
# 1. 修改代码
cd frontend
# ... 编辑代码 ...

# 2. 测试
npm run test

# 3. 构建
npm run build

# 4. 部署
npx wrangler pages deploy dist

# 或通过Git自动部署（如果配置了）
git add .
git commit -m "Update frontend"
git push origin main
```

### 后端更新流程

```bash
# 1. 修改Worker代码
cd backend
# ... 编辑代码 ...

# 2. 测试
npm run test

# 3. 部署到staging
npx wrangler deploy --env staging

# 4. 测试staging环境
# ... 测试 ...

# 5. 部署到生产
npx wrangler deploy --env production
```

### 版本回滚

Worker回滚:
```bash
# 查看部署历史
npx wrangler deployments list

# 回滚到指定版本
npx wrangler rollback [deployment-id]
```

Pages回滚:
- Dashboard → Pages项目 → Deployments
- 选择要回滚的版本 → Rollback

---

## 故障排查

### 问题1: CORS错误

**症状**: 
```
Access to fetch at 'xxx' from origin 'yyy' has been blocked by CORS policy
```

**解决**:
1. 检查Worker CORS配置
2. 确保Worker响应包含正确的CORS headers
3. 检查前端请求URL是否正确

### 问题2: 环境变量未生效

**症状**: API URL错误或undefined

**解决**:
```bash
# 前端：检查.env文件
cat .env.production

# 重新构建
npm run build

# Pages: 在Dashboard检查环境变量配置
```

### 问题3: Worker部署失败

**症状**: Deployment failed

**检查**:
1. wrangler.toml配置
2. TypeScript编译错误
3. 依赖问题

```bash
# 清理并重试
rm -rf node_modules .wrangler
npm install
npx wrangler deploy
```

### 问题4: Pages构建失败

**症状**: Build failed on Cloudflare Pages

**解决**:
1. 检查构建命令和输出目录
2. 检查Node版本兼容性
3. 查看构建日志

```bash
# 本地测试构建
npm run build
# 确保dist目录正确生成
```

---

## 最佳实践

### 1. API版本管理

```typescript
// API路径包含版本
const API_V1 = '/api/v1';
const API_V2 = '/api/v2';

// Worker中处理多版本
if (url.pathname.startsWith('/api/v1')) {
  return handleV1(request);
} else if (url.pathname.startsWith('/api/v2')) {
  return handleV2(request);
}
```

### 2. 监控和日志

```bash
# Worker实时日志
npx wrangler tail --format pretty

# Pages部署日志
# Dashboard → Pages项目 → Deployments → View build log
```

### 3. CI/CD配置

GitHub Actions示例:

`.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-worker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: cd backend && npm ci
      - run: cd backend && npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}

  deploy-pages:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: cd frontend && npm ci
      - run: cd frontend && npm run build
      - run: cd frontend && npx wrangler pages deploy dist
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
```

### 4. 性能优化

前端优化:
```typescript
// 使用React.lazy进行代码分割
const HeavyComponent = React.lazy(() => import('./HeavyComponent'));

// 使用SWR或React Query缓存API请求
import useSWR from 'swr';
const { data, error } = useSWR('/api/data', fetcher);
```

Worker优化:
```typescript
// 使用Cache API
const cache = caches.default;
const cachedResponse = await cache.match(request);
if (cachedResponse) {
  return cachedResponse;
}
```

---

## 总结

分离部署方案提供了更大的灵活性和扩展性，适合大型项目和团队协作。

### 核心要点
- ✅ 前后端独立部署和版本控制
- ✅ 正确配置CORS
- ✅ 环境变量管理
- ✅ 独立的更新和回滚流程

### 部署后的访问地址
- 前端: `https://your-app.pages.dev`
- 后端API: `https://your-api.workers.dev`
- API文档: `https://your-api.workers.dev/`

### 架构优势
- 🚀 独立扩展
- 🔧 技术栈灵活
- 👥 团队协作友好
- 📈 精细化性能优化

祝你的项目部署成功！ 🎉