import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const API = 'http://localhost:8090'

export default function AgentLogin() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const navigate = useNavigate()

  async function handleSubmit() {
    if (!email || !email.includes('@')) {
      setMsg({ type: 'error', text: 'Please enter a valid email address.' })
      return
    }
    setLoading(true)
    setMsg({ type: 'info', text: 'Checking agent credentials…' })
    try {
      const res = await axios.post(`${API}/api/agent/request-otp`, { email })
      if (res.data.success) {
        navigate('/agent/otp', { state: { email } })
      } else {
        setMsg({ type: 'error', text: res.data.message })
      }
    } catch {
      setMsg({ type: 'error', text: 'Server error. Please try again.' })
    }
    setLoading(false)
  }

  return (
    <div style={styles.body}>
      <div style={styles.wrap}>
        <div style={styles.brand}>
          <div style={styles.icon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <h1 style={styles.h1}>Agent Portal</h1>
          <p style={styles.sub}>Dispute resolution dashboard</p>
        </div>
        <div style={styles.card}>
          <label style={styles.label}>Agent Email</label>
          <div style={styles.inputRow}>
            <input
              style={styles.input}
              type="email"
              placeholder="agent@meesho.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <button style={{...styles.btn, opacity: loading ? 0.55 : 1}} onClick={handleSubmit} disabled={loading}>
            {loading ? 'Sending OTP…' : 'Send OTP'}
          </button>
          {msg.text && <div style={{...styles.msg, ...styles[msg.type]}}>{msg.text}</div>}
        </div>
        <p style={styles.foot}>
          <span style={{color:'#4f46e5', cursor:'pointer'}} onClick={() => navigate('/')}>← Back to Vendor Portal</span>
        </p>
      </div>
    </div>
  )
}

const styles = {
  body: { fontFamily:'Inter,sans-serif', background:'#0f1117', color:'#e8eaf0', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' },
  wrap: { width:'100%', maxWidth:'420px' },
  brand: { textAlign:'center', marginBottom:'2rem' },
  icon: { width:'56px', height:'56px', background:'#4f46e5', borderRadius:'16px', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:'1rem' },
  h1: { fontSize:'1.5rem', fontWeight:700, margin:0 },
  sub: { color:'#7c7f9a', fontSize:'0.875rem', marginTop:'0.3rem' },
  card: { background:'#1a1d27', border:'1px solid #2a2d3e', borderRadius:'20px', padding:'2rem' },
  label: { display:'block', fontSize:'0.75rem', fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:'#7c7f9a', marginBottom:'0.5rem' },
  inputRow: { marginBottom:'1rem' },
  input: { width:'100%', background:'#0f1117', border:'1px solid #2a2d3e', borderRadius:'10px', color:'#e8eaf0', fontFamily:'Inter,sans-serif', fontSize:'0.95rem', padding:'0.75rem 1rem', outline:'none', boxSizing:'border-box' },
  btn: { width:'100%', padding:'0.8rem', background:'#4f46e5', border:'none', borderRadius:'10px', color:'#fff', fontFamily:'Inter,sans-serif', fontSize:'0.95rem', fontWeight:600, cursor:'pointer' },
  msg: { marginTop:'0.75rem', padding:'0.7rem 1rem', borderRadius:'8px', fontSize:'0.85rem' },
  error: { background:'rgba(255,107,107,0.1)', border:'1px solid rgba(255,107,107,0.3)', color:'#ff6b6b' },
  info: { background:'rgba(79,70,229,0.1)', border:'1px solid rgba(79,70,229,0.3)', color:'#a09dff' },
  foot: { textAlign:'center', marginTop:'1.25rem', fontSize:'0.75rem', color:'#7c7f9a' }
}