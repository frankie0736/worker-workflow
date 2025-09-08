# 📚 Cloudflare Worker + Workflow 完整开发指南

## 目录
1. [架构概览](#架构概览)
2. [前后端通信机制](#前后端通信机制)
3. [Worker开发详解](#worker开发详解)
4. [Workflow工作原理](#workflow工作原理)
5. [本地开发环境搭建](#本地开发环境搭建)
6. [部署到Cloudflare](#部署到cloudflare)
7. [最佳实践](#最佳实践)
8. [常见问题解决](#常见问题解决)

---

## 架构概览

```
┌─────────────────┐
│   React前端     │
│  (用户界面)      │
└────────┬────────┘
         │ HTTP请求
         ▼
┌─────────────────┐
│ Cloudflare      │
│   Worker        │ ← 接收请求
│  (API层)        │ → 触发Workflow
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Cloudflare      │
│   Workflow      │ ← 执行3个步骤
│  (业务逻辑)     │ → 返回结果
└─────────────────┘
```

---

## 前后端通信机制

### 1. 前端发送请求

```typescript
// frontend/src/App.tsx
const handleSubmit = async (e: React.FormEvent) => {
  // 准备请求数据
  const requestData = {
    name: "用户输入的姓名",
    number: 123
  };

  // 发送POST请求到Worker
  const response = await fetch('https://your-worker.workers.dev/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestData)
  });

  // 接收并处理响应
  const result = await response.json();
  console.log(result);
};
```

### 2. Worker接收请求

```typescript
// backend/src/index.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 处理CORS（跨域请求）
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',  // 生产环境应指定具体域名
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // 处理OPTIONS预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 解析请求体
    const body = await request.json();
    
    // 处理业务逻辑...
    
    // 返回响应
    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
};
```

### 3. 数据流详解

```
前端用户输入 → 表单提交 → fetch API → 
Worker接收 → 创建Workflow实例 → 执行步骤 → 
返回结果 → Worker响应 → 前端显示
```

---

## Worker开发详解

### Worker基础结构

```typescript
// Worker环境接口定义
interface Env {
  // Workflow绑定
  MY_WORKFLOW: Workflow;
  
  // KV存储（可选）
  KV_STORE?: KVNamespace;
  
  // 环境变量
  API_KEY?: string;
  ENVIRONMENT?: string;
}

// Worker主入口
export default {
  // 处理HTTP请求
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    
    // 路由处理
    switch(url.pathname) {
      case '/':
        return handleHome();
      case '/process':
        return handleProcess(request, env);
      default:
        return new Response('Not Found', { status: 404 });
    }
  }
};
```

### Worker与Workflow集成

```typescript
// 创建并执行Workflow
async function handleProcess(request: Request, env: Env) {
  const body = await request.json();
  
  // 创建Workflow实例
  const workflowInstance = await env.MY_WORKFLOW.create({
    params: {
      name: body.name,
      number: body.number
    }
  });
  
  // 获取Workflow ID（用于追踪）
  const workflowId = workflowInstance.id;
  
  // 方式1：等待Workflow完成（同步）
  const status = await workflowInstance.status();
  
  // 方式2：立即返回（异步）
  return new Response(JSON.stringify({
    workflowId,
    message: 'Workflow已启动'
  }));
}
```

---

## Workflow工作原理

### Workflow定义

```typescript
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

// Workflow参数类型
interface WorkflowParams {
  name: string;
  number: number;
}

// Workflow类定义
export class MyWorkflow extends WorkflowEntrypoint<{}, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    const { name, number } = event.payload.params;
    
    // 步骤1：验证输入
    const step1Result = await step.do('step1-validate', async () => {
      // 验证逻辑
      if (!name || !number) {
        throw new Error('参数无效');
      }
      return { validated: true };
    });
    
    // 步骤2：处理数据
    const step2Result = await step.do('step2-process', async () => {
      // 处理逻辑
      const processed = number * 2;
      return { result: processed };
    });
    
    // 步骤3：生成结果
    const finalResult = await step.do('step3-finalize', async () => {
      // 最终处理
      return {
        success: true,
        originalNumber: number,
        processedNumber: step2Result.result,
        timestamp: new Date().toISOString()
      };
    });
    
    return finalResult;
  }
}
```

### Workflow特性

1. **持久化执行**: 每个步骤的结果都会被保存
2. **故障恢复**: 如果某个步骤失败，可以从失败点重试
3. **异步执行**: 在生产环境中真正异步执行
4. **步骤隔离**: 每个步骤独立执行，结果可传递

---

## 本地开发环境搭建

### 1. 项目初始化

```bash
# 创建项目目录
mkdir worker-workflow-project
cd worker-workflow-project

# 创建前端（React + Vite）
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install

# 创建后端（Worker）
cd ..
mkdir backend
cd backend
npm init -y
npm install -D wrangler @cloudflare/workers-types
```

### 2. 配置文件

#### wrangler.toml (Worker配置)

```toml
name = "my-worker-workflow"
main = "src/index.ts"
compatibility_date = "2024-09-01"
compatibility_flags = ["nodejs_compat"]

# Workflow绑定
[[workflows]]
binding = "MY_WORKFLOW"
name = "my-workflow"
class_name = "MyWorkflow"

# KV存储（可选）
[[kv_namespaces]]
binding = "KV_STORE"
id = "your_kv_id"
preview_id = "your_preview_kv_id"

# 环境变量
[vars]
ENVIRONMENT = "development"
```

### 3. 本地运行

```bash
# 终端1：启动Worker
cd backend
npx wrangler dev --port 8787

# 终端2：启动React
cd frontend
npm run dev
```

---

## 部署到Cloudflare

### 前置准备

1. **注册Cloudflare账号**: https://dash.cloudflare.com/sign-up
2. **安装Wrangler CLI**: `npm install -g wrangler`
3. **登录Cloudflare**: `wrangler login`

### 部署Worker和Workflow

```bash
cd backend

# 首次部署
npx wrangler deploy

# 部署成功后会显示：
# ✅ https://your-worker.workers.dev
```

### 部署前端到Cloudflare Pages

```bash
cd frontend

# 1. 修改API地址为生产环境
# 编辑 src/App.tsx，将 localhost:8787 改为 your-worker.workers.dev

# 2. 构建项目
npm run build

# 3. 创建Pages项目
npx wrangler pages project create my-app --production-branch main

# 4. 部署
npx wrangler pages deploy dist --project-name=my-app

# 部署成功后会显示：
# ✅ https://xxxxx.my-app.pages.dev
```

### 环境配置

```bash
# 设置生产环境变量
wrangler secret put API_KEY

# 创建KV命名空间
wrangler kv:namespace create "WORKFLOW_STATE"

# 更新wrangler.toml中的KV ID
```

---

## 最佳实践

### 1. 错误处理

```typescript
try {
  const result = await env.MY_WORKFLOW.create({ params });
  return new Response(JSON.stringify(result));
} catch (error) {
  console.error('Workflow错误:', error);
  return new Response(
    JSON.stringify({ error: '处理失败' }), 
    { status: 500 }
  );
}
```

### 2. 环境区分

```typescript
// 根据环境使用不同配置
const API_URL = process.env.NODE_ENV === 'production'
  ? 'https://api.production.com'
  : 'http://localhost:8787';
```

### 3. CORS配置

```typescript
// 生产环境应限制具体域名
const corsHeaders = {
  'Access-Control-Allow-Origin': 
    env.ENVIRONMENT === 'production' 
      ? 'https://your-app.pages.dev' 
      : '*'
};
```

### 4. 日志监控

```bash
# 查看实时日志
wrangler tail

# 查看特定Worker日志
wrangler tail worker-name --format pretty
```

---

## 常见问题解决

### Q1: CORS错误
**问题**: Access to fetch at 'xxx' from origin 'yyy' has been blocked by CORS policy

**解决**:
```typescript
// Worker中添加CORS头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
```

### Q2: Workflow显示Error但功能正常
**原因**: Workflow在生产环境异步执行，Dashboard可能显示Error

**解决**: 这是正常现象，只要用户能收到正确结果即可

### Q3: 本地开发Workflow不执行
**问题**: wrangler dev --local 不支持Workflow

**解决**: 使用 `wrangler dev`（不加 --local）

### Q4: 部署失败
**问题**: Error: Authentication required

**解决**:
```bash
# 重新登录
wrangler logout
wrangler login
```

### Q5: KV存储读写问题
**问题**: KV namespace not found

**解决**:
```bash
# 创建KV
wrangler kv:namespace create "MY_KV"
# 将返回的ID添加到wrangler.toml
```

---

## 进阶功能

### 1. 添加数据库（D1）

```toml
# wrangler.toml
[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "xxxxx"
```

### 2. 文件存储（R2）

```toml
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "my-bucket"
```

### 3. 定时任务（Cron Triggers）

```toml
[triggers]
crons = ["0 */6 * * *"]  # 每6小时执行
```

### 4. Durable Objects

```typescript
export class Counter {
  constructor(private state: DurableObjectState) {}
  
  async fetch(request: Request) {
    // 持久化状态管理
  }
}
```

---

## 资源链接

- [Cloudflare Workers文档](https://developers.cloudflare.com/workers/)
- [Cloudflare Workflows文档](https://developers.cloudflare.com/workflows/)
- [Wrangler CLI文档](https://developers.cloudflare.com/workers/wrangler/)
- [Workers示例代码](https://github.com/cloudflare/workers-sdk/tree/main/templates)
- [社区论坛](https://community.cloudflare.com/)

---

## 总结

本指南涵盖了从零开始构建和部署Cloudflare Worker + Workflow应用的完整流程。关键要点：

1. **前后端分离**: React负责UI，Worker负责API
2. **Workflow异步**: 生产环境中Workflow异步执行
3. **CORS处理**: 必须正确配置跨域请求
4. **环境管理**: 区分开发和生产环境配置
5. **错误处理**: 完善的错误捕获和日志记录

祝你开发顺利！🚀