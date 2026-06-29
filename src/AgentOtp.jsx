import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'

export default function AgentOtp() {
  const [otp, setOtp] = useState(['','','','','','','',''])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ type:'', text:'' })
  const [secondsLeft, setSecondsLeft] = useState(300)
  const inputs = useRef([])
  const navigate = useNavigate()
  const location = useLocation()
  const email = location.state?.email || ''

  useEffect(() => {
    if (!email) { navigate('/agent'); return }
    inputs.current[0]?.focus()
    const interval = setInterval(() => {
      setSecondsLeft(s => { if (s <= 1) { clearInterval(interval); return 0 } return s - 1 })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  function handleChange(val, idx) {
    val = val.replace(/[^0-9]/g, '')
    const newOtp = [...otp]
    newOtp[idx] = val
    setOtp(newOtp)
    if (val && idx < 7) inputs.current[idx+1]?.focus()
    if (newOtp.join('').length === 8) verifyOTP(newOtp.join(''))
  }

  function handleKeyDown(e, idx) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) inputs.current[idx-1]?.focus()
  }

  async function verifyOTP(otpVal) {
    const code = otpVal || otp.join('')
    if (code.length !== 8) { setMsg({ type:'error', text:'Please enter all 8 digits.' }); return }
    setLoading(true)
    setMsg({ type:'info', text:'Verifying…' })
    const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    if (error) {
      setMsg({ type:'error', text: 'Invalid or expired OTP. Please try again.' })
      setOtp(['','','','','',''])
      inputs.current[0]?.focus()
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, name')
        .eq('id', data.user.id)
        .single()
      if (!profile || profile.role !== 'agent') {
        await supabase.auth.signOut()
        setMsg({ type:'error', text: 'This email is not authorized as an agent.' })
      } else {
        setMsg({ type:'ok', text:'Verified! Loading your dashboard…' })
        navigate('/agent/dashboard')
      }
    }
    setLoading(false)
  }

  const m = Math.floor(secondsLeft/60), s = secondsLeft%60

  return (
    <div style={styles.body}>
      <div style={styles.wrap}>
        <div style={styles.brand}>
          <div style={styles.icon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h1 style={styles.h1}>Agent Verification</h1>
          <p style={styles.sub}>Enter the 6-digit OTP sent to {email}</p>
        </div>
        <div style={styles.card}>
          <label style={styles.label}>One-Time Password</label>
          <div style={styles.otpRow}>
            {otp.map((val,idx) => (
              <input key={idx} ref={el => inputs.current[idx]=el} style={styles.otpInput}
                type="tel" maxLength={1} value={val}
                onChange={e => handleChange(e.target.value, idx)}
                onKeyDown={e => handleKeyDown(e, idx)}/>
            ))}
          </div>
          <button style={{...styles.btn, opacity:loading?0.55:1}} onClick={() => verifyOTP()} disabled={loading}>
            {loading ? 'Verifying…' : 'Verify OTP'}
          </button>
          {msg.text && <div style={{...styles.msg, ...styles[msg.type]}}>{msg.text}</div>}
          <div style={styles.timer}>
            {secondsLeft > 0
              ? <>OTP expires in <span style={{color:'#ffd166',fontWeight:600}}>{m}:{s<10?'0':''}{s}</span></>
              : 'OTP expired. Please go back and request a new one.'}
          </div>
        </div>
        <p style={styles.foot}>
          <span style={{color:'#4f46e5',cursor:'pointer'}} onClick={() => navigate('/agent')}>← Back</span>
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
  otpRow: { display:'flex', gap:'0.5rem', marginBottom:'1rem' },
  otpInput: { flex:1, background:'#0f1117', border:'1px solid #2a2d3e', borderRadius:'10px', color:'#e8eaf0', fontFamily:'Inter,sans-serif', fontSize:'1.4rem', fontWeight:700, padding:'0.75rem 0', textAlign:'center', outline:'none', width:0 },
  btn: { width:'100%', padding:'0.8rem', background:'#4f46e5', border:'none', borderRadius:'10px', color:'#fff', fontFamily:'Inter,sans-serif', fontSize:'0.95rem', fontWeight:600, cursor:'pointer' },
  msg: { marginTop:'0.75rem', padding:'0.7rem 1rem', borderRadius:'8px', fontSize:'0.85rem' },
  error: { background:'rgba(255,107,107,0.1)', border:'1px solid rgba(255,107,107,0.3)', color:'#ff6b6b' },
  info: { background:'rgba(79,70,229,0.1)', border:'1px solid rgba(79,70,229,0.3)', color:'#a09dff' },
  ok: { background:'rgba(99,255,180,0.1)', border:'1px solid rgba(99,255,180,0.3)', color:'#63ffb4' },
  timer: { textAlign:'center', fontSize:'0.78rem', color:'#7c7f9a', marginTop:'0.75rem' },
  foot: { textAlign:'center', marginTop:'1.25rem', fontSize:'0.75rem', color:'#7c7f9a' }
}
