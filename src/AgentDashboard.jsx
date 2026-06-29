import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'

const API = 'http://localhost:8090'

export default function AgentDashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const email = location.state?.email || ''
  const agentName = location.state?.agentName || 'Agent'
  const [disputes, setDisputes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('open')
  const [resolveModal, setResolveModal] = useState(null)
  const [resolution, setResolution] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [finalAmount, setFinalAmount] = useState('')
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploading, setUploading] = useState(false)
  const [ageingData, setAgeingData] = useState(null)
  const [claudePrompt, setClaudePrompt] = useState('')
  const [claudeResponse, setClaudeResponse] = useState('')
  const [claudeLoading, setClaudeLoading] = useState(false)
  const [claudeError, setClaudeError] = useState('')

    const [bulkResolveFile, setBulkResolveFile] = useState(null)
const [bulkResolveErrors, setBulkResolveErrors] = useState([])
const [bulkResolveSuccess, setBulkResolveSuccess] = useState('')
const [bulkResolveLoading, setBulkResolveLoading] = useState(false)
const [bulkResolveModal, setBulkResolveModal] = useState(false)


  useEffect(() => {
    if (!email) { navigate('/agent'); return }
    loadDisputes()
    loadAgeing()
  }, [])

  async function loadDisputes() {
    try {
      const res = await axios.post(`${API}/api/agent/disputes`, { email })
      if (res.data.success) {
        setDisputes(res.data.disputes)
      } else {
        setError(res.data.message)
      }
    } catch {
      setError('Failed to load disputes.')
    }
    setLoading(false)
  }

  async function loadAgeing() {
  try {
    const res = await axios.post(`${API}/api/agent/ageing`, { email })
    if (res.data.success) setAgeingData(res.data)
  } catch {}
}

  async function handleResolve() {
    if (!resolution) return alert('Please select a resolution.')
if (resolution === 'Rejected' && !rejectionReason) return alert('Please enter rejection reason.')
if ((resolution === 'Approved' || resolution === 'Partially approved') && !finalAmount) {
  alert('Please enter the final approved amount.')
  return
}
if (resolution === 'Approved' && parseFloat(finalAmount) > resolveModal.amount * 1.2) {
  alert(`Amount cannot exceed 120% of billed amount (₹${(resolveModal.amount * 1.2).toLocaleString('en-IN')}) for full approval.`)
  return
}
if (resolution === 'Partially approved' && parseFloat(finalAmount) > resolveModal.amount * 1.1) {
  alert(`Amount cannot exceed 110% of billed amount (₹${(resolveModal.amount * 1.1).toLocaleString('en-IN')}) for partial approval.`)
  return
}
if (resolution === 'Approved' && !rejectionReason) return alert('Please add approver comments.')
if (resolution === 'Partially approved' && !rejectionReason) return alert('Please enter reason for partial approval.')
    if (resolution === 'Partially approved' && !finalAmount) return alert('Please enter final amount.')

    setSaving(true)
    try {
      const res = await axios.post(`${API}/api/agent/resolve`, {
        agentEmail: email,
        tripId: resolveModal.trip_id,
        resolution,
        rejectionReason,
        finalAmount: parseFloat(finalAmount) || null,
        remarks
      })
      if (res.data.success) {
        setDisputes(prev => prev.map(d =>
          d.trip_id === resolveModal.trip_id
            ? { ...d, status: 'resolved', valmo_remarks: resolution,
                reason_for_rejection: rejectionReason,
                final_amount_approved: finalAmount,
                resolved_by: email }
            : d
        ))
        setResolveModal(null)
        resetForm()
      }
    } catch {
      alert('Failed to save resolution.')
    }
    setSaving(false)
  }

  function resetForm() {
    setResolution('')
    setRejectionReason('')
    setFinalAmount('')
    setRemarks('')
  }

  async function handleUploadMapping(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setUploadMsg('')
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await axios.post(`${API}/api/agent/upload-mapping`, formData)
      setUploadMsg(res.data.message)
    } catch {
      setUploadMsg('Upload failed. Please try again.')
    }
    setUploading(false)
  }

  async function downloadBulkTemplate() {
  try {
    const res = await axios.post(`${API}/api/agent/bulk-resolution-template`,
      { email },
      { responseType: 'blob' }
    )
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = 'bulk_resolution_template.xlsx'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  } catch {
    alert('Failed to download template. Please try again.')
  }
}

async function submitBulkResolve() {
  if (!bulkResolveFile) { alert('Please select a file.'); return }
  setBulkResolveLoading(true)
  setBulkResolveErrors([])
  setBulkResolveSuccess('')

  try {
    const formData = new FormData()
    formData.append('file', bulkResolveFile)
    formData.append('agentEmail', email)

    const res = await axios.post(`${API}/api/agent/bulk-resolve`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })

    if (res.data.success) {
      setBulkResolveSuccess(res.data.message)
      setBulkResolveFile(null)
      loadDisputes()
      loadAgeing()
    } else if (res.data.errors) {
      setBulkResolveErrors(res.data.errors)
    } else {
      setBulkResolveErrors([{ row: '—', trip_id: '—', error: res.data.message }])
    }
  } catch (err) {
    setBulkResolveErrors([{ row: '—', trip_id: '—', error: 'Server error. Please try again.' }])
  }
  setBulkResolveLoading(false)
}

  async function submitClaudePrompt() {
    const prompt = claudePrompt.trim()
    if (!prompt) return alert('Please enter a question for Claude.')

    setClaudeLoading(true)
    setClaudeError('')
    setClaudeResponse('')

    try {
      const res = await axios.post(`${API}/api/claude`, {
        agentEmail: email,
        prompt
      })

      if (res.data.success) {
        setClaudeResponse(res.data.answer || 'Claude did not return a response.')
      } else {
        setClaudeError(res.data.message || 'Claude request failed.')
      }
    } catch (err) {
      setClaudeError('Failed to reach the Claude service. Please try again.')
    }

    setClaudeLoading(false)
  }

  const filtered = disputes.filter(d =>
    filter === 'all' ? true : d.status === filter
  )

  const openCount = disputes.filter(d => d.status === 'open').length
  const resolvedCount = disputes.filter(d => d.status === 'resolved').length

  if (loading) return (
    <div style={styles.splash}>
      <div style={styles.spinner}/>
      <div style={{color:'#6b7280',fontSize:'0.85rem'}}>Loading disputes…</div>
    </div>
  )

  if (error) return (
    <div style={styles.splash}>
      <div style={{color:'#dc2626'}}>{error}</div>
      <span style={{color:'#4f46e5',cursor:'pointer'}} onClick={() => navigate('/agent')}>← Back to login</span>
    </div>
  )

  return (
    <div style={styles.layout}>

      {/* RESOLVE MODAL */}
      {resolveModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={{margin:'0 0 0.5rem',fontSize:'1rem',color:'#1a1d2e'}}>Resolve Dispute</h3>
            <div style={{fontSize:'0.82rem',color:'#4f46e5',fontWeight:600,marginBottom:'0.25rem'}}>{resolveModal.trip_id}</div>
            <div style={{fontSize:'0.82rem',color:'#6b7280',marginBottom:'0.25rem'}}>Vendor: {resolveModal.vendor_name}</div>
            <div style={{fontSize:'0.82rem',color:'#6b7280',marginBottom:'0.25rem'}}>Amount: ₹{Number(resolveModal.amount).toLocaleString('en-IN')}</div>
           <div style={{fontSize:'0.82rem',color:'#6b7280',marginBottom:'0.25rem',fontStyle:'italic'}}>Reason: {resolveModal.dispute_reason}</div>
{resolveModal.dispute_summary && (
  <div style={{fontSize:'0.82rem',color:'#1a1d2e',marginBottom:'1rem',background:'#f8fafc',border:'1px solid #e2e4ed',borderRadius:'8px',padding:'0.5rem 0.75rem'}}>
    <span style={{fontWeight:600,color:'#4f46e5'}}>Summary: </span>{resolveModal.dispute_summary}
  </div>
)}

            <label style={styles.formLabel}>Resolution</label>
            <select style={styles.formSelect} value={resolution} onChange={e => { setResolution(e.target.value); setFinalAmount(''); setRejectionReason('') }}>
              <option value="">Select resolution…</option>
              <option value="Approved">Approve (full amount)</option>
              <option value="Partially approved">Partially approve</option>
              <option value="Rejected">Reject</option>
            </select>

{resolution === 'Approved' && (
  <>
    <label style={styles.formLabel}>Final Approved Amount (₹) <span style={{color:'#dc2626'}}>*</span></label>
    <input
      style={{
        ...styles.formInput,
        borderColor: finalAmount && parseFloat(finalAmount) > resolveModal.amount * 1.2 ? '#dc2626' : '#e2e4ed'
      }}
      type="number"
      placeholder="Enter amount…"
      value={finalAmount}
      onChange={e => setFinalAmount(e.target.value)}
    />

    {/* Amount in words */}
    {finalAmount && !isNaN(parseFloat(finalAmount)) && parseFloat(finalAmount) > 0 && (
      <div style={{fontSize:'0.75rem',color:'#4f46e5',marginTop:'0.3rem',fontWeight:600}}>
        ₹{parseFloat(finalAmount).toLocaleString('en-IN')} = {amountToWords(parseFloat(finalAmount))}
      </div>
    )}

    {/* Cap warning */}
    {finalAmount && parseFloat(finalAmount) > resolveModal.amount * 1.2 && (
      <div style={{marginTop:'0.4rem',padding:'0.5rem 0.75rem',background:'rgba(220,38,38,0.08)',border:'1px solid rgba(220,38,38,0.3)',borderRadius:'8px',fontSize:'0.78rem',color:'#dc2626',fontWeight:600}}>
        ✕ Amount cannot exceed 120% of billed amount (₹{(resolveModal.amount * 1.2).toLocaleString('en-IN')}). Please correct.
      </div>
    )}

    {/* Low amount warning */}
    {finalAmount && parseFloat(finalAmount) > 0 && parseFloat(finalAmount) < resolveModal.amount && parseFloat(finalAmount) <= resolveModal.amount * 1.2 && (
      <div style={{marginTop:'0.4rem',padding:'0.5rem 0.75rem',background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.3)',borderRadius:'8px',fontSize:'0.78rem',color:'#d97706',fontWeight:600}}>
        ⚠ Entered amount (₹{parseFloat(finalAmount).toLocaleString('en-IN')}) is less than original billed amount (₹{resolveModal.amount?.toLocaleString('en-IN')}). Please confirm this is correct before submitting.
      </div>
    )}

    <label style={{...styles.formLabel, marginTop:'0.75rem'}}>Approver Comments <span style={{color:'#dc2626'}}>*</span></label>
    <textarea style={styles.formTextarea} placeholder="Add comments for this approval…" value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}/>
  </>
)}

            {resolution === 'Partially approved' && (
  <>
    <label style={styles.formLabel}>Final Approved Amount (₹) <span style={{color:'#dc2626'}}>*</span></label>
    <input
      style={{
        ...styles.formInput,
        borderColor: finalAmount && parseFloat(finalAmount) > resolveModal.amount * 1.1 ? '#dc2626' : '#e2e4ed'
      }}
      type="number"
      placeholder="Enter amount…"
      value={finalAmount}
      onChange={e => setFinalAmount(e.target.value)}
    />

    {/* Amount in words */}
    {finalAmount && !isNaN(parseFloat(finalAmount)) && parseFloat(finalAmount) > 0 && (
      <div style={{fontSize:'0.75rem',color:'#4f46e5',marginTop:'0.3rem',fontWeight:600}}>
        ₹{parseFloat(finalAmount).toLocaleString('en-IN')} = {amountToWords(parseFloat(finalAmount))}
      </div>
    )}

    {/* Cap warning */}
    {finalAmount && parseFloat(finalAmount) > resolveModal.amount * 1.1 && (
      <div style={{marginTop:'0.4rem',padding:'0.5rem 0.75rem',background:'rgba(220,38,38,0.08)',border:'1px solid rgba(220,38,38,0.3)',borderRadius:'8px',fontSize:'0.78rem',color:'#dc2626',fontWeight:600}}>
        ✕ Amount cannot exceed 110% of billed amount (₹{(resolveModal.amount * 1.1).toLocaleString('en-IN')}). Please correct.
      </div>
    )}

    {/* Low amount warning */}
    {finalAmount && parseFloat(finalAmount) > 0 && parseFloat(finalAmount) < resolveModal.amount && parseFloat(finalAmount) <= resolveModal.amount && (
      <div style={{marginTop:'0.4rem',padding:'0.5rem 0.75rem',background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.3)',borderRadius:'8px',fontSize:'0.78rem',color:'#d97706',fontWeight:600}}>
        ⚠ Entered amount (₹{parseFloat(finalAmount).toLocaleString('en-IN')}) is less than original billed amount (₹{resolveModal.amount?.toLocaleString('en-IN')}). Please confirm this is correct before submitting.
      </div>
    )}

    <label style={{...styles.formLabel, marginTop:'0.75rem'}}>Reason for Partial Approval <span style={{color:'#dc2626'}}>*</span></label>
    <textarea style={styles.formTextarea} placeholder="Explain why the amount was partially approved…" value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}/>
  </>
)}

            {resolution === 'Rejected' && (
              <>
                <label style={styles.formLabel}>Rejection Reason</label>
                <textarea style={styles.formTextarea} placeholder="Enter reason for rejection…" value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}/>
              </>
            )}

            <label style={styles.formLabel}>Remarks (optional)</label>
            <textarea style={styles.formTextarea} placeholder="Any additional remarks…" value={remarks} onChange={e => setRemarks(e.target.value)}/>

            <div style={{display:'flex',gap:'0.75rem',marginTop:'1rem'}}>
              <button style={styles.modalCancel} onClick={() => { setResolveModal(null); resetForm() }}>Cancel</button>
              <button style={{...styles.modalConfirm, opacity: saving ? 0.6 : 1}} onClick={handleResolve} disabled={saving}>
                {saving ? 'Saving…' : 'Submit Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}

{/* BULK RESOLVE MODAL */}
{bulkResolveModal && (
  <div style={styles.modalOverlay}>
    <div style={{...styles.modal, maxWidth:'560px'}}>
      <h3 style={{margin:'0 0 0.25rem',fontSize:'1rem'}}>Bulk Dispute Resolution</h3>
      <p style={{fontSize:'0.82rem',color:'#6b7280',marginBottom:'1rem'}}>Download the pre-filled template, fill in resolution details, then upload to resolve all at once.</p>

      {/* Step 1 - Download */}
      <div style={{background:'#f0f7ff',border:'1px solid #bfdbfe',borderRadius:'10px',padding:'0.75rem 1rem',marginBottom:'1rem',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:'0.82rem',fontWeight:600,color:'#1e40af'}}>Step 1 — Download Pre-filled Template</div>
          <div style={{fontSize:'0.72rem',color:'#6b7280',marginTop:'0.2rem'}}>Contains all your open disputes with trip IDs pre-filled</div>
        </div>
        <button style={{padding:'0.4rem 0.75rem',background:'#1e40af',border:'none',borderRadius:'8px',color:'#fff',fontFamily:'Inter,sans-serif',fontSize:'0.78rem',fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}} onClick={downloadBulkTemplate}>
          ↓ Download Template
        </button>
      </div>

      {/* Valid resolutions hint */}
      {/* Notes + Valid resolutions hint */}
<div style={{background:'#fffbeb',border:'1px solid #fcd34d',borderRadius:'10px',padding:'0.75rem 1rem',marginBottom:'1rem'}}>
  <div style={{fontSize:'0.75rem',fontWeight:700,color:'#d97706',marginBottom:'0.5rem'}}>📋 Instructions</div>
  <div style={{fontSize:'0.72rem',color:'#6b7280',lineHeight:2}}>
    <div>• Do <strong>not</strong> edit <code>trip_id</code>, <code>vendor_name</code>, <code>transporter_id</code>, <code>billed_amount</code> columns</div>
    <div>• <strong>resolution</strong> must be exactly one of:</div>
    <div style={{paddingLeft:'1rem'}}>
      <div><strong style={{color:'#059669'}}>Approved</strong> — final_amount required, cannot exceed <strong>120%</strong> of billed amount</div>
      <div><strong style={{color:'#d97706'}}>Partially approved</strong> — final_amount required, cannot exceed <strong>110%</strong> of billed amount</div>
      <div><strong style={{color:'#dc2626'}}>Rejected</strong> — no amount needed</div>
    </div>
    <div>• <strong>reason</strong> is mandatory for all rows</div>
    <div>• <strong>remarks</strong> is optional</div>
    <div>• Rows with errors will block the entire upload — fix all errors before resubmitting</div>
  </div>
</div>

      {/* Step 2 - Upload */}
      <div style={{background:'#f8fafc',border:'1px solid #e2e4ed',borderRadius:'10px',padding:'0.75rem 1rem',marginBottom:'0.75rem'}}>
        <div style={{fontSize:'0.82rem',fontWeight:600,color:'#1a1d2e',marginBottom:'0.5rem'}}>Step 2 — Upload Filled Template <span style={{color:'#dc2626'}}>*</span></div>
        <input type="file" accept=".xlsx,.xls" style={{display:'none'}} id="bulkResolveInput"
          onChange={e => { setBulkResolveFile(e.target.files[0]); setBulkResolveErrors([]); setBulkResolveSuccess('') }}/>
        <label htmlFor="bulkResolveInput" style={{display:'inline-flex',alignItems:'center',gap:'0.4rem',padding:'0.5rem 1rem',background:'#fff',border:'1px solid #e2e4ed',borderRadius:'8px',cursor:'pointer',fontSize:'0.82rem',color:'#4f46e5',fontWeight:600}}>
          📊 {bulkResolveFile ? 'Change File' : 'Choose Excel File'}
        </label>
        {bulkResolveFile && (
          <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginTop:'0.5rem',padding:'0.4rem 0.75rem',background:'rgba(5,150,105,0.08)',border:'1px solid rgba(5,150,105,0.3)',borderRadius:'6px'}}>
            <span style={{fontSize:'0.78rem',color:'#059669',fontWeight:600}}>✓ {bulkResolveFile.name}</span>
            <span style={{cursor:'pointer',color:'#dc2626',marginLeft:'auto',fontWeight:700}} onClick={() => setBulkResolveFile(null)}>×</span>
          </div>
        )}
      </div>

      {/* Success */}
      {bulkResolveSuccess && (
        <div style={{background:'rgba(5,150,105,0.08)',border:'1px solid rgba(5,150,105,0.3)',borderRadius:'8px',padding:'0.75rem 1rem',marginBottom:'0.75rem',fontSize:'0.85rem',color:'#059669',fontWeight:600}}>
          ✓ {bulkResolveSuccess}
        </div>
      )}

      {/* Error table */}
      {bulkResolveErrors.length > 0 && (
        <div style={{marginBottom:'0.75rem'}}>
          <div style={{fontSize:'0.82rem',fontWeight:700,color:'#dc2626',marginBottom:'0.5rem'}}>
            ✕ {bulkResolveErrors.length} error{bulkResolveErrors.length > 1 ? 's' : ''} found — fix and re-upload
          </div>
          <div style={{maxHeight:'180px',overflowY:'auto',border:'1px solid #fecaca',borderRadius:'8px'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.75rem'}}>
              <thead>
                <tr style={{background:'#fef2f2'}}>
                  <th style={{padding:'0.4rem 0.75rem',textAlign:'left',color:'#dc2626',fontWeight:700}}>Row</th>
                  <th style={{padding:'0.4rem 0.75rem',textAlign:'left',color:'#dc2626',fontWeight:700}}>Trip ID</th>
                  <th style={{padding:'0.4rem 0.75rem',textAlign:'left',color:'#dc2626',fontWeight:700}}>Error</th>
                </tr>
              </thead>
              <tbody>
                {bulkResolveErrors.map((e,i) => (
                  <tr key={i} style={{borderTop:'1px solid #fecaca'}}>
                    <td style={{padding:'0.4rem 0.75rem',color:'#6b7280'}}>{e.row}</td>
                    <td style={{padding:'0.4rem 0.75rem',color:'#4f46e5',fontWeight:600}}>{e.trip_id}</td>
                    <td style={{padding:'0.4rem 0.75rem',color:'#dc2626'}}>{e.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{display:'flex',gap:'0.75rem'}}>
        <button style={styles.modalCancel} onClick={() => { setBulkResolveModal(false); setBulkResolveFile(null); setBulkResolveErrors([]); setBulkResolveSuccess('') }}>Close</button>
        <button style={{...styles.modalConfirm, opacity: bulkResolveLoading ? 0.6 : 1}} onClick={submitBulkResolve} disabled={bulkResolveLoading}>
          {bulkResolveLoading ? 'Processing…' : 'Submit All Resolutions'}
        </button>
      </div>
    </div>
  </div>
)}

      {/* SIDEBAR */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarBrand}>
          <div style={styles.sidebarLogo}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div>
            <div style={{fontSize:'0.9rem',fontWeight:700,color:'#fff'}}>Agent Portal</div>
            <div style={{fontSize:'0.68rem',color:'rgba(255,255,255,0.45)'}}>Dispute Resolution</div>
          </div>
        </div>

        <div style={{padding:'0.75rem 1rem'}}>
  <div style={{fontSize:'0.65rem',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'rgba(255,255,255,0.35)',marginBottom:'0.5rem'}}>Pending Ageing</div>

  {ageingData ? (
    <>
      {Object.entries(ageingData.buckets).map(([key, bucket]) => (
        <div key={key} style={{
          background:'rgba(255,255,255,0.05)',
          borderRadius:'8px',
          padding:'0.5rem 0.75rem',
          marginBottom:'0.4rem',
          display:'flex',
          alignItems:'center',
          justifyContent:'space-between',
          border:`1px solid ${bucket.color}40`
        }}>
          <div style={{fontSize:'0.72rem',color:'rgba(255,255,255,0.6)',lineHeight:1.3}}>{bucket.label}</div>
          <div style={{
            fontSize:'1.2rem',
            fontWeight:800,
            color: bucket.color,
            minWidth:'28px',
            textAlign:'right'
          }}>{bucket.count}</div>
        </div>
      ))}
      <div style={{
        marginTop:'0.5rem',
        padding:'0.4rem 0.75rem',
        background: ageingData.buckets.beyond24.count > 0 ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.05)',
        borderRadius:'8px',
        border: ageingData.buckets.beyond24.count > 0 ? '1px solid rgba(220,38,38,0.4)' : '1px solid rgba(255,255,255,0.1)',
        fontSize:'0.72rem',
        color: ageingData.buckets.beyond24.count > 0 ? '#fca5a5' : 'rgba(255,255,255,0.4)',
        textAlign:'center',
        fontWeight: ageingData.buckets.beyond24.count > 0 ? 700 : 400
      }}>
        {ageingData.buckets.beyond24.count > 0
          ? `🚨 ${ageingData.buckets.beyond24.count} overdue — action needed!`
          : '✓ All within SLA'}
      </div>
      <button style={{width:'100%',marginTop:'0.5rem',padding:'0.3rem',background:'transparent',border:'none',color:'rgba(255,255,255,0.3)',fontSize:'0.68rem',cursor:'pointer',fontFamily:'Inter,sans-serif'}} onClick={loadAgeing}>
        ↻ Refresh ageing
      </button>
    </>
  ) : (
    <div style={{fontSize:'0.75rem',color:'rgba(255,255,255,0.3)',textAlign:'center',padding:'0.5rem'}}>Loading…</div>
  )}

  <div style={{marginTop:'0.75rem',padding:'0.5rem 0.75rem',background:'rgba(255,255,255,0.05)',borderRadius:'8px',display:'flex',justifyContent:'space-between'}}>
    <div style={{fontSize:'0.72rem',color:'rgba(255,255,255,0.4)'}}>Resolved</div>
    <div style={{fontSize:'1rem',fontWeight:700,color:'#10b981'}}>{resolvedCount}</div>
  </div>
</div>

        <div style={{padding:'0 1rem',marginTop:'0.5rem'}}>
          <div style={{fontSize:'0.65rem',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'rgba(255,255,255,0.35)',marginBottom:'0.5rem'}}>Upload Mapping</div>
          <label style={styles.uploadBtn}>
            {uploading ? 'Uploading…' : '↑ Upload CSV'}
            <input type="file" accept=".csv" style={{display:'none'}} onChange={handleUploadMapping}/>
          </label>
          {uploadMsg && <div style={{fontSize:'0.72rem',color:'#10b981',marginTop:'0.4rem'}}>{uploadMsg}</div>}
          <div style={{fontSize:'0.68rem',color:'rgba(255,255,255,0.3)',marginTop:'0.4rem',lineHeight:1.4}}>
            CSV format:<br/>agent_email, transporter_id
          </div>
        </div>

        <div style={styles.sidebarFooter}>
          <div style={{fontSize:'0.72rem',color:'rgba(255,255,255,0.4)',padding:'0 0.75rem',marginBottom:'0.5rem',wordBreak:'break-all'}}>{email}</div>
          <button style={styles.logoutBtn} onClick={() => navigate('/agent')}>Log Out</button>
        </div>
      </aside>

      {/* MAIN */}
      <div style={styles.mainArea}>
        <header style={styles.header}>
          <div style={{fontSize:'1.05rem',fontWeight:700}}>My Disputes</div>
          <div style={styles.agentBadge}>{agentName}</div>
        </header>

        <div style={{padding:'1.5rem'}}>
          {/* FILTER TABS */}
          <div style={{display:'flex',gap:'0.5rem',marginBottom:'1rem'}}>
            {[['open','Open'],['resolved','Resolved'],['all','All']].map(([val,label]) => (
              <button key={val} style={{...styles.filterTab, ...(filter===val ? styles.filterTabActive : {})}} onClick={() => setFilter(val)}>
                {label}
              </button>
            ))}
            <button style={styles.refreshBtn} onClick={loadDisputes}>↻ Refresh</button>
<button style={{...styles.refreshBtn, marginLeft:'0', background:'#4f46e5', color:'#fff', border:'1px solid #4f46e5', fontWeight:600}} onClick={() => { setBulkResolveModal(true); setBulkResolveErrors([]); setBulkResolveSuccess('') }}>
  ⚡ Bulk Resolve
</button>
          </div>

          <div style={{marginBottom:'1rem',padding:'1rem',border:'1px solid #e2e4ed',borderRadius:'16px',background:'#fff',boxShadow:'0 1px 4px rgba(0,0,0,0.05)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.75rem'}}>
              <div>
                <div style={{fontSize:'0.95rem',fontWeight:700,color:'#111827'}}>Claude Assistant</div>
                <div style={{fontSize:'0.78rem',color:'#6b7280'}}>Ask Claude for dispute guidance or a summary of the current disputes.</div>
              </div>
              <div style={{fontSize:'0.75rem',fontWeight:700,color:'#4f46e5'}}>Claude</div>
            </div>
            <textarea
              style={{...styles.formTextarea, minHeight:'100px'}}
              placeholder="Enter your question for Claude..."
              value={claudePrompt}
              onChange={e => setClaudePrompt(e.target.value)}
            />
            <div style={{display:'flex',gap:'0.75rem',marginTop:'0.75rem',alignItems:'center'}}>
              <button style={{...styles.modalConfirm, padding:'0.65rem 1rem', minWidth:'140px', opacity: claudeLoading ? 0.6 : 1}} onClick={submitClaudePrompt} disabled={claudeLoading}>
                {claudeLoading ? 'Asking Claude…' : 'Ask Claude'}
              </button>
              <button style={styles.modalCancel} onClick={() => { setClaudePrompt(''); setClaudeResponse(''); setClaudeError('') }}>
                Clear
              </button>
            </div>
            {claudeError && <div style={{marginTop:'0.75rem',color:'#dc2626',fontSize:'0.82rem'}}>{claudeError}</div>}
            {claudeResponse && (
              <div style={{marginTop:'0.75rem',padding:'0.9rem',border:'1px solid #e2e4ed',borderRadius:'12px',background:'#f8fafc',color:'#1f2937',fontSize:'0.88rem',whiteSpace:'pre-wrap',lineHeight:1.6}}>
                {claudeResponse}
              </div>
            )}
          </div>

          {/* DISPUTES TABLE */}
          <div style={styles.tableWrap}>
            <div style={{overflowX:'auto'}}>
              <table style={styles.table}>
                <thead>
                  <tr style={{background:'#f0f1f5',borderBottom:'1px solid #e2e4ed'}}>
                    {['Trip ID','Vendor','Transporter ID','Amount (₹)','Dispute Reason','Raised At','Status','Proof','Valmo Remarks','Final Amount','Action'].map(h => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={10} style={{textAlign:'center',padding:'3rem',color:'#6b7280'}}>
                      No {filter === 'all' ? '' : filter} disputes found.
                    </td></tr>
                  ) : filtered.map((d, i) => (
                    <tr key={i} style={{borderBottom:'1px solid #e2e4ed'}}>
                      <td style={{...styles.td,color:'#4f46e5',fontWeight:600,whiteSpace:'nowrap'}}>{d.trip_id}</td>
                      <td style={{...styles.td,whiteSpace:'nowrap'}}>{d.vendor_name}</td>
                      <td style={{...styles.td,whiteSpace:'nowrap'}}>{d.transporter_id}</td>
                      <td style={{...styles.td,fontWeight:700,color:'#059669',whiteSpace:'nowrap'}}>₹{Number(d.amount).toLocaleString('en-IN')}</td>
                      <td style={{...styles.td,maxWidth:'200px',fontSize:'0.78rem',color:'#6b7280'}}>{d.dispute_reason}</td>
                      <td style={{...styles.td,whiteSpace:'nowrap',fontSize:'0.78rem'}}>{d.raised_at?.slice(0,16).replace('T',' ')}</td>
                      <td style={styles.td}>
                        {d.status === 'open'
                          ? <span style={styles.badgeOpen}>Open</span>
                          : <span style={styles.badgeResolved}>Resolved</span>}
                      </td>
                      <td style={styles.td}>{d.proof_file ? <a href={`http://localhost:8090/api/proof/${d.proof_file}`} target="_blank" rel="noreferrer" style={{display:'inline-flex',alignItems:'center',gap:'0.3rem',padding:'0.3rem 0.6rem',background:'rgba(79,70,229,0.08)',border:'1px solid rgba(79,70,229,0.2)',borderRadius:'6px',color:'#4f46e5',fontSize:'0.75rem',fontWeight:600,textDecoration:'none',whiteSpace:'nowrap'}}>📎 View Proof</a> : <span style={{fontSize:'0.75rem',color:'#6b7280'}}>No proof</span>}</td>
                      <td style={styles.td}>
                        {d.valmo_remarks
                          ? <span style={d.valmo_remarks==='Approved' ? styles.badgeApproved : d.valmo_remarks==='Rejected' ? styles.badgeRejected : styles.badgePartial}>{d.valmo_remarks}</span>
                          : '—'}
                      </td>
                      <td style={{...styles.td,fontWeight:700,color:'#059669',whiteSpace:'nowrap'}}>
                        {d.final_amount_approved ? '₹'+Number(d.final_amount_approved).toLocaleString('en-IN') : '—'}
                      </td>
                      <td style={styles.td}>
                        {d.status === 'open'
                          ? <button style={styles.resolveBtn} onClick={() => { setResolveModal(d); resetForm() }}>Resolve</button>
                          : <span style={{fontSize:'0.75rem',color:'#6b7280'}}>Done</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  splash: { display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',flexDirection:'column',gap:'1rem',background:'#f5f6fa' },
  spinner: { width:'40px',height:'40px',border:'3px solid #e2e4ed',borderTopColor:'#4f46e5',borderRadius:'50%' },
  layout: { display:'flex',minHeight:'100vh',fontFamily:'Inter,sans-serif',background:'#f5f6fa',color:'#1a1d2e' },
  sidebar: { width:'220px',background:'#1e2a4a',flexShrink:0,display:'flex',flexDirection:'column',position:'fixed',top:0,left:0,bottom:0,zIndex:200 },
  sidebarBrand: { padding:'1.25rem 1rem 1rem',borderBottom:'1px solid rgba(255,255,255,0.08)',display:'flex',alignItems:'center',gap:'0.65rem' },
  sidebarLogo: { width:'34px',height:'34px',background:'#4f46e5',borderRadius:'9px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 },
  statBox: { background:'rgba(255,255,255,0.05)',borderRadius:'10px',padding:'0.75rem 1rem' },
  uploadBtn: { display:'block',width:'100%',padding:'0.5rem',background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:'8px',color:'rgba(255,255,255,0.7)',fontSize:'0.8rem',textAlign:'center',cursor:'pointer' },
  sidebarFooter: { marginTop:'auto',padding:'0.75rem 0.6rem',borderTop:'1px solid rgba(255,255,255,0.08)' },
  logoutBtn: { display:'flex',alignItems:'center',gap:'0.6rem',width:'100%',padding:'0.55rem 0.75rem',borderRadius:'8px',background:'transparent',border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:'0.82rem',color:'rgba(255,255,255,0.5)' },
  mainArea: { marginLeft:'220px',flex:1,display:'flex',flexDirection:'column',minHeight:'100vh' },
  header: { background:'#fff',borderBottom:'1px solid #e2e4ed',padding:'0 1.5rem',height:'60px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100 },
  agentBadge: { background:'#f0f1f5',border:'1px solid #e2e4ed',borderRadius:'8px',padding:'0.3rem 0.75rem',fontSize:'0.8rem',fontWeight:600 },
  filterTab: { padding:'0.4rem 1rem',borderRadius:'8px',border:'1px solid #e2e4ed',background:'#fff',color:'#6b7280',fontSize:'0.82rem',cursor:'pointer',fontFamily:'Inter,sans-serif' },
  filterTabActive: { background:'#4f46e5',color:'#fff',border:'1px solid #4f46e5',fontWeight:600 },
  refreshBtn: { marginLeft:'auto',padding:'0.4rem 0.75rem',borderRadius:'8px',border:'1px solid #e2e4ed',background:'#fff',color:'#6b7280',fontSize:'0.82rem',cursor:'pointer',fontFamily:'Inter,sans-serif' },
  tableWrap: { background:'#fff',border:'1px solid #e2e4ed',borderRadius:'16px',overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,0.05)' },
  table: { width:'100%',borderCollapse:'collapse',fontSize:'0.82rem' },
  th: { padding:'0.75rem 1rem',textAlign:'left',fontSize:'0.7rem',fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:'#6b7280',whiteSpace:'nowrap' },
  td: { padding:'0.7rem 1rem',verticalAlign:'top',color:'#1a1d2e' },
  badgeOpen: { background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.3)',color:'#d97706',borderRadius:'6px',padding:'0.2rem 0.5rem',fontSize:'0.72rem',fontWeight:600 },
  badgeResolved: { background:'rgba(5,150,105,0.1)',border:'1px solid rgba(5,150,105,0.3)',color:'#059669',borderRadius:'6px',padding:'0.2rem 0.5rem',fontSize:'0.72rem',fontWeight:600 },
  badgeApproved: { background:'rgba(5,150,105,0.1)',border:'1px solid rgba(5,150,105,0.3)',color:'#059669',borderRadius:'6px',padding:'0.2rem 0.5rem',fontSize:'0.72rem',fontWeight:600 },
  badgeRejected: { background:'rgba(220,38,38,0.1)',border:'1px solid rgba(220,38,38,0.3)',color:'#dc2626',borderRadius:'6px',padding:'0.2rem 0.5rem',fontSize:'0.72rem',fontWeight:600 },
  badgePartial: { background:'rgba(217,119,6,0.1)',border:'1px solid rgba(217,119,6,0.3)',color:'#d97706',borderRadius:'6px',padding:'0.2rem 0.5rem',fontSize:'0.72rem',fontWeight:600 },
  resolveBtn: { background:'#4f46e5',border:'none',borderRadius:'8px',color:'#fff',padding:'0.35rem 0.75rem',fontSize:'0.75rem',fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif' },
  modalOverlay: { position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'1rem' },
  modal: { background:'#fff',border:'1px solid #e2e4ed',borderRadius:'16px',padding:'2rem',maxWidth:'420px',width:'100%',maxHeight:'90vh',overflowY:'auto' },
  formLabel: { display:'block',fontSize:'0.75rem',fontWeight:600,color:'#6b7280',marginBottom:'0.4rem',marginTop:'0.75rem',textTransform:'uppercase',letterSpacing:'0.05em' },
  formSelect: { width:'100%',padding:'0.6rem 0.75rem',border:'1px solid #e2e4ed',borderRadius:'8px',fontFamily:'Inter,sans-serif',fontSize:'0.85rem',color:'#1a1d2e',outline:'none' },
  formInput: { width:'100%',padding:'0.6rem 0.75rem',border:'1px solid #e2e4ed',borderRadius:'8px',fontFamily:'Inter,sans-serif',fontSize:'0.85rem',color:'#1a1d2e',outline:'none',boxSizing:'border-box' },
  formTextarea: { width:'100%',padding:'0.6rem 0.75rem',border:'1px solid #e2e4ed',borderRadius:'8px',fontFamily:'Inter,sans-serif',fontSize:'0.85rem',color:'#1a1d2e',outline:'none',minHeight:'80px',resize:'vertical',boxSizing:'border-box' },
  modalCancel: { flex:1,padding:'0.7rem',background:'transparent',border:'1px solid #e2e4ed',borderRadius:'10px',color:'#6b7280',fontFamily:'Inter,sans-serif',fontSize:'0.9rem',cursor:'pointer' },
  modalConfirm: { flex:1,padding:'0.7rem',background:'#4f46e5',border:'none',borderRadius:'10px',color:'#fff',fontFamily:'Inter,sans-serif',fontSize:'0.9rem',fontWeight:700,cursor:'pointer' }
}

function amountToWords(amount) {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  function convert(n) {
    if (n === 0) return ''
    if (n < 20) return ones[n] + ' '
    if (n < 100) return tens[Math.floor(n/10)] + ' ' + ones[n%10] + ' '
    if (n < 1000) return ones[Math.floor(n/100)] + ' Hundred ' + convert(n%100)
    if (n < 100000) return convert(Math.floor(n/1000)) + 'Thousand ' + convert(n%1000)
    if (n < 10000000) return convert(Math.floor(n/100000)) + 'Lakh ' + convert(n%100000)
    return convert(Math.floor(n/10000000)) + 'Crore ' + convert(n%10000000)
  }
  const rupees = Math.floor(amount)
  const paise = Math.round((amount - rupees) * 100)
  let result = convert(rupees).trim() + ' Rupees'
  if (paise > 0) result += ' and ' + convert(paise).trim() + ' Paise'
  return result
}