import { useState } from 'react'
import './App.css'

function App() {
  const [number, setNumber] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: parseInt(number)
        })
      })

      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({ error: '请求失败: ' + error })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>🔢 多步骤计算 Workflow</h1>
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '400px', margin: '0 auto' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '16px', fontWeight: 'bold' }}>
            输入一个数字:
            <input
              type="number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              required
              placeholder="例如: 10"
              style={{ 
                width: '100%', 
                padding: '12px', 
                marginTop: '8px',
                fontSize: '16px',
                border: '2px solid #ddd',
                borderRadius: '5px'
              }}
            />
          </label>
        </div>
        
        <button 
          type="submit" 
          disabled={loading}
          style={{ 
            padding: '12px 24px', 
            backgroundColor: loading ? '#ccc' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.3s'
          }}
        >
          {loading ? '🔄 计算中...' : '🚀 开始计算'}
        </button>
      </form>

      {result && result.result && (
        <div style={{ marginTop: '40px' }}>
          {/* 突出显示最终结果 */}
          <div style={{ 
            textAlign: 'center', 
            padding: '30px', 
            backgroundColor: '#e8f5e9',
            borderRadius: '10px',
            marginBottom: '20px',
            border: '2px solid #4CAF50'
          }}>
            <h2 style={{ color: '#2e7d32', marginBottom: '10px' }}>🎯 计算结果</h2>
            <div style={{ fontSize: '48px', fontWeight: 'bold', color: '#1b5e20' }}>
              {result.result.finalResult}
            </div>
            <div style={{ fontSize: '18px', color: '#388e3c', marginTop: '10px' }}>
              {result.result.formula}
            </div>
          </div>

          {/* 显示计算步骤 */}
          <div style={{ 
            padding: '20px', 
            backgroundColor: '#f5f5f5', 
            borderRadius: '10px',
            border: '1px solid #ddd'
          }}>
            <h3 style={{ marginBottom: '15px', color: '#333' }}>📝 计算步骤日志</h3>
            <div style={{ 
              backgroundColor: 'white', 
              padding: '15px', 
              borderRadius: '5px',
              fontFamily: 'monospace'
            }}>
              {result.result.steps.map((step: string, index: number) => (
                <div key={index} style={{ 
                  padding: '8px 0', 
                  borderBottom: index < result.result.steps.length - 1 ? '1px solid #eee' : 'none',
                  color: index === result.result.steps.length - 1 ? '#4CAF50' : '#555'
                }}>
                  {step}
                </div>
              ))}
            </div>
            
            {/* 元数据 */}
            <div style={{ marginTop: '15px', fontSize: '12px', color: '#666' }}>
              <div>🆔 Workflow ID: {result.workflowId}</div>
              <div>⏰ 时间戳: {result.result.timestamp}</div>
              <div>✅ 状态: {result.status}</div>
            </div>
          </div>
        </div>
      )}

      {result && result.error && (
        <div style={{ 
          marginTop: '30px', 
          padding: '20px', 
          backgroundColor: '#ffebee', 
          borderRadius: '5px',
          border: '1px solid #ef5350'
        }}>
          <h3 style={{ color: '#c62828' }}>❌ 错误</h3>
          <p style={{ color: '#d32f2f' }}>{result.error}</p>
        </div>
      )}
    </div>
  )
}

export default App
