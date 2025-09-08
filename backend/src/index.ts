import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';
const assetManifest = JSON.parse(manifestJSON);

// ============ Workflow 定义 ============
interface WorkflowParams {
  number: number;
}

// Workflow类：处理多个计算步骤
export class MyWorkflow extends WorkflowEntrypoint<{}, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    const { number } = event.payload.params;
    
    // 步骤1: 验证是否为数字
    const step1Result = await step.do('step1-validate', async () => {
      console.log('步骤1: 验证输入是否为数字');
      if (typeof number !== 'number' || isNaN(number)) {
        throw new Error('输入必须是有效的数字');
      }
      return {
        validated: true,
        value: number,
        message: `✅ 步骤1: 验证成功，输入值为 ${number}`
      };
    });

    // 步骤2: 加1
    const step2Result = await step.do('step2-add-one', async () => {
      console.log('步骤2: 加1');
      const result = step1Result.value + 1;
      return {
        value: result,
        message: `➕ 步骤2: ${step1Result.value} + 1 = ${result}`
      };
    });

    // 步骤3: 乘以2
    const step3Result = await step.do('step3-multiply-two', async () => {
      console.log('步骤3: 乘以2');
      const result = step2Result.value * 2;
      return {
        value: result,
        message: `✖️ 步骤3: ${step2Result.value} × 2 = ${result}`
      };
    });

    // 步骤4: 乘以3
    const step4Result = await step.do('step4-multiply-three', async () => {
      console.log('步骤4: 乘以3');
      const result = step3Result.value * 3;
      return {
        value: result,
        message: `✖️ 步骤4: ${step3Result.value} × 3 = ${result}`
      };
    });

    // 步骤5: 生成最终结果
    const finalResult = await step.do('step5-finalize', async () => {
      console.log('步骤5: 生成最终结果');
      return {
        success: true,
        originalNumber: number,
        finalResult: step4Result.value,
        formula: `((${number} + 1) × 2) × 3 = ${step4Result.value}`,
        timestamp: new Date().toISOString(),
        steps: [
          step1Result.message,
          step2Result.message,
          step3Result.message,
          step4Result.message,
          `🎯 步骤5: 最终结果 = ${step4Result.value}`
        ]
      };
    });

    return finalResult;
  }
}

// ============ Worker 定义 ============
interface Env {
  MY_WORKFLOW: Workflow;
  __STATIC_CONTENT: any;
}

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  
  // 处理CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // 处理OPTIONS请求
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // API路由处理
  if (url.pathname === '/api/process' && request.method === 'POST') {
    try {
      const body = await request.json() as { number: number };
      
      // 创建并运行Workflow实例
      const instance = await env.MY_WORKFLOW.create({
        params: {
          number: body.number
        }
      });

      // 直接计算并返回结果
      const step1 = body.number + 1;
      const step2 = step1 * 2;
      const step3 = step2 * 3;
      
      const finalResult = {
        success: true,
        originalNumber: body.number,
        finalResult: step3,
        formula: `((${body.number} + 1) × 2) × 3 = ${step3}`,
        timestamp: new Date().toISOString(),
        steps: [
          `✅ 步骤1: 验证成功，输入值为 ${body.number}`,
          `➕ 步骤2: ${body.number} + 1 = ${step1}`,
          `✖️ 步骤3: ${step1} × 2 = ${step2}`,
          `✖️ 步骤4: ${step2} × 3 = ${step3}`,
          `🎯 步骤5: 最终结果 = ${step3}`
        ],
        workflowStatus: 'Workflow已在后台异步执行'
      };
      
      return new Response(JSON.stringify({
        workflowId: instance.id,
        status: 'completed',
        result: finalResult
      }, null, 2), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (error: any) {
      return new Response(JSON.stringify({
        error: error.message
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }

  // 处理静态资源
  return handleStaticAssets(request, env, ctx);
}

async function handleStaticAssets(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  let pathname = url.pathname;
  
  // 默认路径为 index.html
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // 移除开头的斜杠
  const path = pathname.slice(1);
  
  // 查找资源
  const assetKey = assetManifest[path] || assetManifest[pathname];
  
  if (assetKey) {
    // 获取资源
    const asset = await env.__STATIC_CONTENT.get(assetKey);
    
    if (asset) {
      // 设置正确的Content-Type
      let contentType = 'text/plain';
      if (path.endsWith('.html')) contentType = 'text/html';
      else if (path.endsWith('.js')) contentType = 'application/javascript';
      else if (path.endsWith('.css')) contentType = 'text/css';
      else if (path.endsWith('.svg')) contentType = 'image/svg+xml';
      else if (path.endsWith('.png')) contentType = 'image/png';
      else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) contentType = 'image/jpeg';
      
      return new Response(asset, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000',
        },
      });
    }
  }
  
  // 对于SPA，返回index.html
  const indexKey = assetManifest['index.html'];
  if (indexKey) {
    const indexAsset = await env.__STATIC_CONTENT.get(indexKey);
    if (indexAsset) {
      return new Response(indexAsset, {
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }
  }
  
  return new Response('Not Found', { status: 404 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env, ctx);
  }
};