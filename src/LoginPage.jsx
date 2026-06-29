import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'

export default function LoginPage() {
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
    setMsg({ type: 'info', text: 'Sending OTP…' })
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }
    })
    if (error) {
      setMsg({ type: 'error', text: 'Email not authorized. Please contact admin.' })
    } else {
      navigate('/otp', { state: { email } })
    }
    setLoading(false)
  }

  return (
    <div style={styles.body}>
      <div style={styles.wrap}>
        <div style={styles.brand}>
          <div style={styles.icon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
              <rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/>
              <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
          </div>
          <h1 style={styles.h1}>Vendor Portal</h1>
          <p style={styles.sub}>Secure access to your trip data</p>
        </div>
        <div style={styles.card}>
          <label style={styles.label}>Registered Email</label>
          <div style={styles.inputRow}>
            <input
              style={styles.input}
              type="email"
              placeholder="you@example.com"
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
        <p style={styles.foot}>Only authorized vendor emails can access this portal.</p>
      </div>
    </div>
  )
}

const styles = {
  body: { fontFamily: 'Inter, sans-serif', background: '#0f1117', color: '#e8eaf0', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  wrap: { width: '100%', maxWidth: '420px' },
  brand: { textAlign: 'center', marginBottom: '2rem' },
  icon: { width: '56px', height: '56px', background: '#6c63ff', borderRadius: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' },
  h1: { fontSize: '1.5rem', fontWeight: 700, margin: 0 },
  sub: { color: '#7c7f9a', fontSize: '0.875rem', marginTop: '0.3rem' },
  card: { background: '#1a1d27', border: '1px solid #2a2d3e', borderRadius: '20px', padding: '2rem' },
  label: { display: 'block', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#7c7f9a', marginBottom: '0.5rem' },
  inputRow: { marginBottom: '1rem' },
  input: { width: '100%', background: '#0f1117', border: '1px solid #2a2d3e', borderRadius: '10px', color: '#e8eaf0', fontFamily: 'Inter, sans-serif', fontSize: '0.95rem', padding: '0.75rem 1rem', outline: 'none', boxSizing: 'border-box' },
  btn: { width: '100%', padding: '0.8rem', background: '#6c63ff', border: 'none', borderRadius: '10px', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer' },
  msg: { marginTop: '0.75rem', padding: '0.7rem 1rem', borderRadius: '8px', fontSize: '0.85rem' },
  error: { background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', color: '#ff6b6b' },
  info: { background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.3)', color: '#a09dff' },
  ok: { background: 'rgba(99,255,180,0.1)', border: '1px solid rgba(99,255,180,0.3)', color: '#63ffb4' },
  foot: { textAlign: 'center', marginTop: '1.25rem', fontSize: '0.75rem', color: '#7c7f9a' }
}
