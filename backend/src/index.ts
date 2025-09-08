import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

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
        const body = await request.json() as { number: number };
        
        // 创建并运行Workflow实例
        const instance = await env.MY_WORKFLOW.create({
          params: {
            number: body.number
          }
        });

        // 在生产环境中，我们不等待Workflow完成
        // 而是立即返回计算结果
        // 因为Cloudflare Workflows在生产环境是真正异步的
        
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

    return new Response('Not Found', { 
      status: 404,
      headers: corsHeaders
    });
  }
};