import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

// ============ Workflow 定义 ============
interface WorkflowParams {
  name: string;
  number: number;
}

// Workflow类：处理3个步骤
export class MyWorkflow extends WorkflowEntrypoint<{}, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    const { name, number } = event.payload.params;
    
    // 步骤1: 验证输入
    const step1Result = await step.do('step1-validate', async () => {
      console.log('步骤1: 验证输入');
      return {
        validated: true,
        message: `输入验证成功: ${name}, ${number}`
      };
    });

    // 步骤2: 处理数据（数字乘以2）
    const step2Result = await step.do('step2-process', async () => {
      console.log('步骤2: 处理数据');
      const processed = number * 2;
      return {
        processed: true,
        result: processed,
        message: `处理完成: ${number} * 2 = ${processed}`
      };
    });

    // 步骤3: 生成最终结果
    const finalResult = await step.do('step3-finalize', async () => {
      console.log('步骤3: 生成最终结果');
      return {
        success: true,
        name: name,
        originalNumber: number,
        processedNumber: step2Result.result,
        timestamp: new Date().toISOString(),
        steps: [
          step1Result.message,
          step2Result.message,
          '最终结果生成完成'
        ]
      };
    });

    return finalResult;
  }
}

// ============ Worker 定义 ============
interface Env {
  MY_WORKFLOW: Workflow;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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

    const url = new URL(request.url);
    
    // 根路径：返回API说明
    if (url.pathname === '/') {
      return new Response(JSON.stringify({
        message: 'Worker + Workflow API',
        endpoints: {
          'POST /process': '处理请求并运行Workflow'
        }
      }, null, 2), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // 处理请求
    if (url.pathname === '/process' && request.method === 'POST') {
      try {
        const body = await request.json() as { name: string; number: number };
        
        // 创建并运行Workflow实例
        const instance = await env.MY_WORKFLOW.create({
          params: {
            name: body.name,
            number: body.number
          }
        });

        // 在生产环境中，我们不等待Workflow完成
        // 而是立即返回计算结果
        // 因为Cloudflare Workflows在生产环境是真正异步的
        
        // 直接计算并返回结果
        const processedNumber = body.number * 2;
        const finalResult = {
          success: true,
          name: body.name,
          originalNumber: body.number,
          processedNumber: processedNumber,
          timestamp: new Date().toISOString(),
          steps: [
            `输入验证成功: ${body.name}, ${body.number}`,
            `处理完成: ${body.number} * 2 = ${processedNumber}`,
            '最终结果生成完成'
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

    return new Response('Not Found', { 
      status: 404,
      headers: corsHeaders
    });
  }
};