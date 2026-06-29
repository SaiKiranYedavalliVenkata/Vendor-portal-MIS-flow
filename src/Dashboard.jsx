import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from './lib/supabase'

export default function Dashboard() {
  const navigate = useNavigate()
  const [userEmail, setUserEmail] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [allRows, setAllRows] = useState([])
  const [statsBar, setStatsBar] = useState([])
  const [tripActions, setTripActions] = useState({})
  const [resolutions, setResolutions] = useState({})
  const [transporterIds, setTransporterIds] = useState([])
  const [vendorName, setVendorName] = useState('')
  const [totalRows, setTotalRows] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)
  const [activePage, setActivePage] = useState('summary')
  const [search, setSearch] = useState('')
  const [originFilter, setOriginFilter] = useState('')
  const [transporterFilter, setTransporterFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [sortCol, setSortCol] = useState('start_date')
  const [sortDir, setSortDir] = useState(1)
  const [pendingAccept, setPendingAccept] = useState(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [disputeModal, setDisputeModal] = useState(null)
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeLoading, setDisputeLoading] = useState(false)
  const [disputeCategory, setDisputeCategory] = useState('')
  const [disputeSecondary, setDisputeSecondary] = useState('')
  const [missingTripId, setMissingTripId] = useState('')
  const [missingTripInput, setMissingTripInput] = useState('')
  const [missingTripIds, setMissingTripIds] = useState([])
  const [missingTripError, setMissingTripError] = useState('')
  const [bulkModal, setBulkModal] = useState(false)
  const [bulkExcel, setBulkExcel] = useState(null)
  const [bulkProofs, setBulkProofs] = useState([])
  const [bulkErrors, setBulkErrors] = useState([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkSuccess, setBulkSuccess] = useState('')
  const [proofFile, setProofFile] = useState(null)
  const [proofError, setProofError] = useState('')
  const [disputeSummary, setDisputeSummary] = useState('')
  const [ageingData, setAgeingData] = useState(null)
  const [ageingLoading, setAgeingLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate('/'); return }
      setUserEmail(session.user.email)
    })
  }, [])

  useEffect(() => {
    if (!userEmail) return
    loadData(userEmail, 0)
    loadAgeing(userEmail)
  }, [userEmail])

  const PAGE_SIZE = 50

  async function loadData(email, pg) {
    try {
      const { data: vendorRows } = await supabase
        .from('vendors')
        .select('transporter_id, vendor_name, oracle_id')
        .eq('email', email)

      if (!vendorRows || vendorRows.length === 0) {
        setError('No vendor data found for this account. Please contact admin.')
        setLoading(false)
        return
      }

      const tIds = vendorRows.map(v => v.transporter_id)

      const { data: tripsData, count } = await supabase
        .from('trips')
        .select('*', { count: 'exact' })
        .in('transporter_id', tIds)
        .order('start_date', { ascending: false })
        .range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)

      const tripIds = (tripsData || []).map(t => t.trip_id)
      const { data: disputesData } = tripIds.length > 0
        ? await supabase.from('disputes').select('trip_id, status, valmo_remarks, reason_for_rejection, final_amount_approved').in('trip_id', tripIds)
        : { data: [] }

      const actions = {}
      ;(tripsData || []).forEach(t => { actions[t.trip_id] = t.status || 'pending' })

      const resMap = {}
      ;(disputesData || []).forEach(d => {
        if (d.valmo_remarks) resMap[d.trip_id] = d
      })

      const bar = vendorRows.map(v => {
        const vTrips = (tripsData || []).filter(t => t.transporter_id === v.transporter_id)
        return {
          transporter_id: v.transporter_id,
          vendor_name: v.vendor_name,
          oracle_id: v.oracle_id,
          total_trips: vTrips.length,
          total_amount: vTrips.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)
        }
      })

      setAllRows(prev => pg === 0 ? (tripsData || []) : [...prev, ...(tripsData || [])])
      setStatsBar(bar)
      setTripActions(prev => ({ ...prev, ...actions }))
      setResolutions(prev => ({ ...prev, ...resMap }))
      setTransporterIds(tIds)
      setVendorName(vendorRows[0]?.vendor_name || email)
      setTotalRows(count || 0)
      setHasMore((pg + 1) * PAGE_SIZE < (count || 0))
      setPage(pg)
      setLoading(false)
    } catch {
      setError('Failed to load data. Please try again.')
      setLoading(false)
    }
  }

  async function loadAgeing(email) {
    setAgeingLoading(true)
    try {
      const { data: vendorRows } = await supabase
        .from('vendors').select('transporter_id').eq('email', email)
      const tIds = (vendorRows || []).map(v => v.transporter_id)
      if (!tIds.length) { setAgeingLoading(false); return }

      const { data: pendingTrips } = await supabase
        .from('trips').select('trip_id, end_date, amount')
        .in('transporter_id', tIds).eq('status', 'pending')

      const now = new Date()
      const buckets = {
        within1: { label: '0–1 Day', count: 0, amount: 0 },
        within2: { label: '1–2 Days', count: 0, amount: 0 },
        within3: { label: '2–3 Days', count: 0, amount: 0 },
        within7: { label: '3–7 Days', count: 0, amount: 0 },
        beyond7: { label: '7+ Days', count: 0, amount: 0 }
      }
      ;(pendingTrips || []).forEach(t => {
        if (!t.end_date) return
        const diff = (now - new Date(t.end_date)) / 86400000
        const amt = parseFloat(t.amount) || 0
        if (diff <= 1) { buckets.within1.count++; buckets.within1.amount += amt }
        else if (diff <= 2) { buckets.within2.count++; buckets.within2.amount += amt }
        else if (diff <= 3) { buckets.within3.count++; buckets.within3.amount += amt }
        else if (diff <= 7) { buckets.within7.count++; buckets.within7.amount += amt }
        else { buckets.beyond7.count++; buckets.beyond7.amount += amt }
      })
      setAgeingData({ success: true, totalPending: (pendingTrips || []).length, buckets })
    } catch {}
    setAgeingLoading(false)
  }

  function renderRoute(str) {
    if (!str) return '—'
    return str.split('->').map(s => s.trim()).join(' › ')
  }

  function v(r, key) {
    const val = r[key]
    return (val !== undefined && val !== null && val !== '' && val !== 'null') ? val : '—'
  }

  const origins = [...new Set(allRows.map(r => r.origin_node).filter(Boolean))].sort()

  const filteredRows = allRows.filter(r => {
    const status = tripActions[r.trip_id] || 'pending'
    return (!search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) &&
           (!originFilter || r.origin_node === originFilter) &&
           (!transporterFilter || r.transporter_id === transporterFilter) &&
           (!actionFilter || status === actionFilter)
  }).sort((a, b) => {
    let va = a[sortCol] || '', vb = b[sortCol] || ''
    if (sortCol === 'amount') { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0 }
    if (va < vb) return -sortDir; if (va > vb) return sortDir; return 0
  })

  function sortBy(col) {
    if (sortCol === col) setSortDir(d => d * -1)
    else { setSortCol(col); setSortDir(1) }
  }

  async function confirmAccept() {
    if (!pendingAccept) return
    setModalLoading(true)
    const { error } = await supabase
      .from('trips')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('trip_id', pendingAccept.tripId)
    if (!error) setTripActions(prev => ({ ...prev, [pendingAccept.tripId]: 'accepted' }))
    setModalLoading(false)
    setPendingAccept(null)
  }

  async function submitDispute() {
    if (!disputeCategory) { alert('Please select a dispute category.'); return }
    if (disputeModal.trip_id === 'MISSING' && !missingTripId.trim()) { alert('Please enter the missing trip ID.'); return }
    if (disputeCategory === 'Trip Missing') {
      if (missingTripIds.length === 0) { alert('Please add at least one missing trip ID.'); return }
    } else if (!disputeSecondary.trim()) {
      alert('Please answer the follow-up question before submitting.'); return
    }
    if (disputeCategory !== 'Trip Missing' && !disputeSummary.trim()) {
      alert('Please provide an additional summary before submitting.'); return
    }
    if (!proofFile) { alert('Please upload proof before submitting.'); return }

    const fullReason = disputeCategory === 'Trip Missing'
      ? `Trip Missing — ${missingTripIds.join(', ')}`
      : disputeCategory + (disputeSecondary ? ` — ${disputeSecondary}` : '') + (disputeSummary ? ` | Summary: ${disputeSummary}` : '')

    const tripIdForDispute = disputeModal.trip_id === 'MISSING' ? missingTripId.trim() : disputeModal.trip_id

    setDisputeLoading(true)
    try {
      const filePath = `${userEmail}/${tripIdForDispute}/${Date.now()}_${proofFile.name}`
      const { error: uploadErr } = await supabase.storage.from('dispute-proofs').upload(filePath, proofFile)
      if (uploadErr) { alert('Proof upload failed: ' + uploadErr.message); setDisputeLoading(false); return }
      const { data: urlData } = supabase.storage.from('dispute-proofs').getPublicUrl(filePath)

      const { data: mapping } = await supabase
        .from('agent_transporter_mapping').select('agent_email')
        .eq('transporter_id', disputeModal.transporter_id || transporterIds[0]).limit(1)

      const { error: insertErr } = await supabase.from('disputes').insert({
        trip_id: tripIdForDispute,
        transporter_id: disputeModal.transporter_id || transporterIds[0],
        vendor_email: userEmail,
        vendor_name: disputeModal.vendor_name || vendorName,
        amount: disputeModal.amount || 0,
        dispute_reason: fullReason,
        dispute_category: disputeCategory,
        dispute_secondary: disputeSecondary,
        dispute_summary: disputeSummary,
        proof_file: urlData.publicUrl,
        status: 'open',
        assigned_to: mapping?.[0]?.agent_email || null
      })

      if (!insertErr) {
        if (disputeModal.trip_id !== 'MISSING') {
          await supabase.from('trips').update({ status: 'disputed', updated_at: new Date().toISOString() }).eq('trip_id', disputeModal.trip_id)
          setTripActions(prev => ({ ...prev, [disputeModal.trip_id]: 'disputed' }))
        }
        setDisputeModal(null); setDisputeReason(''); setDisputeCategory(''); setDisputeSecondary('')
        setMissingTripId(''); setMissingTripInput(''); setMissingTripIds([]); setMissingTripError('')
        setProofFile(null); setProofError(''); setDisputeSummary('')
        alert('Dispute submitted successfully!')
      } else {
        alert('Failed to submit dispute: ' + insertErr.message)
      }
    } catch (err) {
      alert('Failed to raise dispute. Please try again.')
    }
    setDisputeLoading(false)
  }

  function addMissingTripId() {
    const val = missingTripInput.trim().toUpperCase()
    const pattern = /^TR-\d{8}-\d{4}$/
    if (!pattern.test(val)) { setMissingTripError('Invalid format. Use TR-XXXXXXXX-XXXX (e.g. TR-12345678-1234)'); return }
    if (missingTripIds.includes(val)) { setMissingTripError('This trip ID has already been added.'); return }
    setMissingTripIds(prev => [...prev, val])
    setMissingTripInput('')
    setMissingTripError('')
  }

  async function submitBulkDispute() {
    if (!bulkExcel) { alert('Please upload an Excel file.'); return }
    if (bulkProofs.length === 0) { alert('Please upload at least one proof file.'); return }
    setBulkLoading(true); setBulkErrors([]); setBulkSuccess('')

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
        const errors = []
        let imported = 0

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]; const rowNum = i + 2
          if (!row.trip_id) { errors.push({ row: rowNum, trip_id: '—', error: 'Missing trip_id' }); continue }
          if (!row.dispute_category) { errors.push({ row: rowNum, trip_id: row.trip_id, error: 'Missing dispute_category' }); continue }
          if (!row.proof_filename) { errors.push({ row: rowNum, trip_id: row.trip_id, error: 'Missing proof_filename' }); continue }
          const pf = bulkProofs.find(f => f.name === row.proof_filename)
          if (!pf) { errors.push({ row: rowNum, trip_id: row.trip_id, error: `Proof file "${row.proof_filename}" not found` }); continue }

          const filePath = `${userEmail}/${row.trip_id}/${Date.now()}_${pf.name}`
          const { error: upErr } = await supabase.storage.from('dispute-proofs').upload(filePath, pf)
          if (upErr) { errors.push({ row: rowNum, trip_id: row.trip_id, error: 'Proof upload failed' }); continue }
          const { data: urlData } = supabase.storage.from('dispute-proofs').getPublicUrl(filePath)

          const trip = allRows.find(t => t.trip_id === row.trip_id)
          const { data: mapping } = await supabase.from('agent_transporter_mapping').select('agent_email').eq('transporter_id', row.transporter_id || trip?.transporter_id || transporterIds[0]).limit(1)

          const { error: insErr } = await supabase.from('disputes').insert({
            trip_id: row.trip_id,
            vendor_email: userEmail,
            vendor_name: trip?.vendor_name || vendorName,
            transporter_id: row.transporter_id || trip?.transporter_id || transporterIds[0],
            amount: trip?.amount || 0,
            dispute_reason: row.dispute_category + (row.secondary_answer ? ` — ${row.secondary_answer}` : '') + (row.summary ? ` | Summary: ${row.summary}` : ''),
            dispute_category: row.dispute_category,
            dispute_secondary: row.secondary_answer || '',
            dispute_summary: row.summary || '',
            proof_file: urlData.publicUrl,
            status: 'open',
            assigned_to: mapping?.[0]?.agent_email || null
          })

          if (insErr) { errors.push({ row: rowNum, trip_id: row.trip_id, error: insErr.message }) }
          else {
            await supabase.from('trips').update({ status: 'disputed' }).eq('trip_id', row.trip_id)
            imported++
          }
        }

        if (errors.length === 0) {
          setBulkSuccess(`Successfully imported ${imported} disputes!`)
          setBulkExcel(null); setBulkProofs([])
          loadData(userEmail, 0)
        } else {
          setBulkErrors(errors)
        }
      } catch (err) {
        setBulkErrors([{ row: '—', trip_id: '—', error: err.message }])
      }
      setBulkLoading(false)
    }
    reader.readAsArrayBuffer(bulkExcel)
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['trip_id', 'transporter_id', 'dispute_category', 'secondary_answer', 'summary', 'proof_filename'],
      [' ', transporterIds[0] || '', 'Wrong Rate', 'Correct rate description', 'Brief summary of issue', 'proof.jpg']
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Disputes')
    XLSX.writeFile(wb, 'bulk_dispute_template.xlsx')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  if (loading) return (
    <div style={styles.splash}>
      <div style={styles.spinner}/>
      <div style={{color:'#6b7280',fontSize:'0.85rem'}}>Loading your dashboard…</div>
    </div>
  )

  if (error) return (
    <div style={styles.splash}>
      <div style={{color:'#dc2626',textAlign:'center',maxWidth:'400px'}}>{error}</div>
      <span style={{color:'#4f46e5',cursor:'pointer',fontSize:'0.85rem'}} onClick={() => navigate('/')}>← Back to login</span>
    </div>
  )

  const email = userEmail || ''

  return (
    <div style={styles.layout}>
      {/* ACCEPT MODAL */}
      {pendingAccept && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={{margin:'0 0 0.5rem',fontSize:'1rem'}}>Confirm Amount Acceptance</h3>
            <p style={{fontSize:'0.85rem',color:'#6b7280',marginBottom:'0.5rem'}}>You are accepting the billed amount for:</p>
            <div style={{color:'#4f46e5',fontWeight:600,marginBottom:'0.5rem'}}>{pendingAccept.tripId}</div>
            <div style={{fontSize:'1.5rem',fontWeight:700,color:'#059669',marginBottom:'1rem'}}>₹{Number(pendingAccept.amount).toLocaleString('en-IN')}</div>
            <p style={{fontSize:'0.85rem',color:'#6b7280',marginBottom:'1.5rem'}}>This action is <strong>permanent</strong>.</p>
            <div style={{display:'flex',gap:'0.75rem'}}>
              <button style={styles.modalCancel} onClick={() => setPendingAccept(null)}>Cancel</button>
              <button style={styles.modalConfirm} onClick={confirmAccept} disabled={modalLoading}>
                {modalLoading ? 'Saving…' : 'Confirm Accept'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISPUTE MODAL */}
      {disputeModal && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modal, maxWidth:'480px'}}>
            <h3 style={{margin:'0 0 0.25rem',fontSize:'1rem'}}>Raise Dispute</h3>
            {disputeModal.trip_id !== 'MISSING' && <>
              <div style={{color:'#4f46e5',fontWeight:600,fontSize:'0.85rem',marginBottom:'0.1rem'}}>{disputeModal.trip_id}</div>
              <div style={{fontSize:'1.1rem',fontWeight:700,color:'#059669',marginBottom:'1rem'}}>₹{Number(disputeModal.amount).toLocaleString('en-IN')}</div>
            </>}
            {disputeModal.trip_id === 'MISSING' && (
              <div style={{marginBottom:'1rem'}}>
                <label style={styles.disputeLabel}>Missing Trip ID</label>
                <input style={styles.disputeInput} placeholder="Enter trip ID e.g. TR-12345678-1234" value={missingTripId} onChange={e => setMissingTripId(e.target.value)}/>
              </div>
            )}

            <label style={styles.disputeLabel}>Select Dispute Category</label>
            <div style={{display:'flex',flexDirection:'column',gap:'0.4rem',marginBottom:'1rem'}}>
              {['Wrong RFQ applied','Wrong Rate','Adhoc/Regular Mismatch','Vehicle size mismatch','Route Changed / Addition stops added','Vehicle number Mismatch','Trip Missing'].map(cat => (
                <label key={cat} style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.5rem 0.75rem',border:`1px solid ${disputeCategory===cat?'#4f46e5':'#e2e4ed'}`,borderRadius:'8px',cursor:'pointer',background:disputeCategory===cat?'rgba(79,70,229,0.05)':'#fff',fontSize:'0.85rem',fontWeight:disputeCategory===cat?600:400}}>
                  <input type="radio" name="disputeCat" value={cat} checked={disputeCategory===cat} onChange={() => { setDisputeCategory(cat); setDisputeSecondary('') }} style={{accentColor:'#4f46e5'}}/>{cat}
                </label>
              ))}
            </div>

            {disputeCategory === 'Wrong RFQ applied' && (<div style={styles.secondaryBox}><label style={styles.secondaryLabel}>⤷ Share Correct RFQ <span style={{color:'#dc2626'}}>*</span></label><input style={styles.disputeInput} placeholder="Enter correct RFQ…" value={disputeSecondary} onChange={e => setDisputeSecondary(e.target.value)}/></div>)}
            {disputeCategory === 'Wrong Rate' && (<div style={styles.secondaryBox}><label style={styles.secondaryLabel}>⤷ Enter Correct Rate <span style={{color:'#dc2626'}}>*</span></label><input style={styles.disputeInput} placeholder="Enter correct rate as per you…" value={disputeSecondary} onChange={e => setDisputeSecondary(e.target.value)}/></div>)}
            {disputeCategory === 'Adhoc/Regular Mismatch' && (<div style={styles.secondaryBox}><label style={styles.secondaryLabel}>⤷ Confirm Correct Trip Type <span style={{color:'#dc2626'}}>*</span></label><div style={{display:'flex',gap:'0.5rem'}}>{['Adhoc','Regular'].map(t => (<label key={t} style={{display:'flex',alignItems:'center',gap:'0.4rem',padding:'0.4rem 0.75rem',border:`1px solid ${disputeSecondary===t?'#4f46e5':'#e2e4ed'}`,borderRadius:'8px',cursor:'pointer',background:disputeSecondary===t?'rgba(79,70,229,0.05)':'#fff',fontSize:'0.85rem'}}><input type="radio" name="tripType" value={t} checked={disputeSecondary===t} onChange={() => setDisputeSecondary(t)} style={{accentColor:'#4f46e5'}}/>{t}</label>))}</div></div>)}
            {disputeCategory === 'Vehicle size mismatch' && (<div style={styles.secondaryBox}><label style={styles.secondaryLabel}>⤷ Confirm Correct Vehicle Size <span style={{color:'#dc2626'}}>*</span></label><input style={styles.disputeInput} placeholder="e.g. 8, 10, 12, 14, 20…" value={disputeSecondary} onChange={e => setDisputeSecondary(e.target.value)}/></div>)}
            {disputeCategory === 'Route Changed / Addition stops added' && (<div style={styles.secondaryBox}><label style={styles.secondaryLabel}>⤷ Confirm Correct Route <span style={{color:'#dc2626'}}>*</span></label><input style={styles.disputeInput} placeholder="e.g. SLS->MLB->FPJ" value={disputeSecondary} onChange={e => setDisputeSecondary(e.target.value)}/></div>)}
            {disputeCategory === 'Vehicle number Mismatch' && (<div style={styles.secondaryBox}><label style={styles.secondaryLabel}>⤷ Confirm Correct Vehicle Number <span style={{color:'#dc2626'}}>*</span></label><input style={styles.disputeInput} placeholder="e.g. MH12AB1234" value={disputeSecondary} onChange={e => setDisputeSecondary(e.target.value)}/></div>)}

            {disputeCategory === 'Trip Missing' && (
              <div style={styles.secondaryBox}>
                <label style={styles.secondaryLabel}>⤷ Enter Missing Trip IDs <span style={{color:'#dc2626'}}>*</span></label>
                <div style={{fontSize:'0.72rem',color:'#d97706',marginBottom:'0.5rem'}}>Format: TR-XXXXXXXX-XXXX</div>
                <div style={{display:'flex',gap:'0.5rem',marginBottom:'0.5rem'}}>
                  <input style={{...styles.disputeInput,flex:1}} placeholder="TR-12345678-1234" value={missingTripInput} onChange={e => setMissingTripInput(e.target.value)} onKeyDown={e => e.key==='Enter' && addMissingTripId()}/>
                  <button style={{padding:'0.6rem 1rem',background:'#4f46e5',border:'none',borderRadius:'8px',color:'#fff',fontFamily:'Inter,sans-serif',fontSize:'0.82rem',fontWeight:600,cursor:'pointer'}} onClick={addMissingTripId}>+ Add</button>
                </div>
                {missingTripError && <div style={{fontSize:'0.75rem',color:'#dc2626',marginBottom:'0.5rem'}}>{missingTripError}</div>}
                {missingTripIds.length > 0 && <div style={{display:'flex',flexWrap:'wrap',gap:'0.4rem'}}>{missingTripIds.map((id,i) => (<div key={i} style={{display:'flex',alignItems:'center',gap:'0.3rem',background:'rgba(5,150,105,0.08)',border:'1px solid rgba(5,150,105,0.3)',borderRadius:'6px',padding:'0.2rem 0.5rem',fontSize:'0.78rem',color:'#059669',fontWeight:600}}>{id}<span style={{cursor:'pointer',color:'#dc2626',fontWeight:700,marginLeft:'2px'}} onClick={() => setMissingTripIds(prev => prev.filter((_,j)=>j!==i))}>×</span></div>))}</div>}
              </div>
            )}

            {disputeCategory && disputeCategory !== 'Trip Missing' && (
              <div style={{marginTop:'0.75rem'}}>
                <label style={styles.disputeLabel}>Additional Summary <span style={{color:'#dc2626'}}>*</span></label>
                <textarea style={{width:'100%',padding:'0.6rem 0.75rem',border:'1px solid #e2e4ed',borderRadius:'8px',fontFamily:'Inter,sans-serif',fontSize:'0.85rem',color:'#1a1d2e',outline:'none',minHeight:'80px',resize:'vertical',boxSizing:'border-box'}} placeholder="Provide a detailed summary…" value={disputeSummary} onChange={e => setDisputeSummary(e.target.value)}/>
              </div>
            )}

            <div style={{marginTop:'0.75rem',padding:'0.75rem 1rem',background:'#f8fafc',border:'1px solid #e2e4ed',borderRadius:'10px'}}>
              <label style={{display:'block',fontSize:'0.75rem',fontWeight:700,color:'#1a1d2e',marginBottom:'0.4rem',textTransform:'uppercase',letterSpacing:'0.05em'}}>Upload Proof <span style={{color:'#dc2626'}}>*</span></label>
              <div style={{fontSize:'0.72rem',color:'#6b7280',marginBottom:'0.5rem'}}>JPG, PNG or PDF — max 10MB</div>
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" style={{display:'none'}} id="proofUpload" onChange={e => {
                const file = e.target.files[0]; if (!file) return
                if (!['image/jpeg','image/png','image/jpg','application/pdf'].includes(file.type)) { setProofError('Only JPG, PNG and PDF files are allowed.'); setProofFile(null); return }
                if (file.size > 10*1024*1024) { setProofError('File size must be under 10MB.'); setProofFile(null); return }
                setProofFile(file); setProofError('')
              }}/>
              <label htmlFor="proofUpload" style={{display:'inline-flex',alignItems:'center',gap:'0.4rem',padding:'0.5rem 1rem',background:'#fff',border:'1px solid #e2e4ed',borderRadius:'8px',cursor:'pointer',fontSize:'0.82rem',color:'#4f46e5',fontWeight:600}}>📎 {proofFile ? 'Change File' : 'Choose File'}</label>
              {proofFile && <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginTop:'0.5rem',padding:'0.4rem 0.75rem',background:'rgba(5,150,105,0.08)',border:'1px solid rgba(5,150,105,0.3)',borderRadius:'6px'}}><span style={{fontSize:'0.78rem',color:'#059669',fontWeight:600}}>✓ {proofFile.name}</span><span style={{cursor:'pointer',color:'#dc2626',marginLeft:'auto',fontWeight:700}} onClick={() => { setProofFile(null); document.getElementById('proofUpload').value=''; }}>×</span></div>}
              {proofError && <div style={{fontSize:'0.75rem',color:'#dc2626',marginTop:'0.4rem'}}>{proofError}</div>}
            </div>

            <div style={{display:'flex',gap:'0.75rem',marginTop:'0.5rem'}}>
              <button style={styles.modalCancel} onClick={() => { setDisputeModal(null); setDisputeReason(''); setDisputeCategory(''); setDisputeSecondary(''); setMissingTripId(''); setMissingTripInput(''); setMissingTripIds([]); setMissingTripError(''); setProofFile(null); setProofError(''); setDisputeSummary('') }}>Cancel</button>
              <button style={{...styles.modalConfirm,background:'#d97706',opacity:disputeLoading?0.6:1}} onClick={submitDispute} disabled={disputeLoading}>{disputeLoading?'Submitting…':'Submit Dispute'}</button>
            </div>
          </div>
        </div>
      )}

      {/* BULK DISPUTE MODAL */}
      {bulkModal && (
        <div style={styles.modalOverlay}>
          <div style={{...styles.modal,maxWidth:'580px'}}>
            <h3 style={{margin:'0 0 0.25rem',fontSize:'1rem'}}>Bulk Dispute Upload</h3>
            <p style={{fontSize:'0.82rem',color:'#6b7280',marginBottom:'1rem'}}>Upload an Excel file with multiple disputes and proof files.</p>
            <div style={{background:'#f0f7ff',border:'1px solid #bfdbfe',borderRadius:'10px',padding:'0.75rem 1rem',marginBottom:'1rem',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div><div style={{fontSize:'0.82rem',fontWeight:600,color:'#1e40af'}}>Step 1 — Download Template</div><div style={{fontSize:'0.72rem',color:'#6b7280',marginTop:'0.2rem'}}>Fill in the Excel template with your dispute details</div></div>
              <button style={{padding:'0.4rem 0.75rem',background:'#1e40af',border:'none',borderRadius:'8px',color:'#fff',fontFamily:'Inter,sans-serif',fontSize:'0.78rem',fontWeight:600,cursor:'pointer'}} onClick={downloadTemplate}>↓ Download Template</button>
            </div>
            <div style={{background:'#fffbeb',border:'1px solid #fcd34d',borderRadius:'10px',padding:'0.75rem 1rem',marginBottom:'1rem'}}>
              <div style={{fontSize:'0.75rem',fontWeight:700,color:'#d97706',marginBottom:'0.4rem'}}>Valid Dispute Categories</div>
              <div style={{fontSize:'0.72rem',color:'#6b7280',lineHeight:1.8}}>Wrong RFQ applied · Wrong Rate · Adhoc/Regular Mismatch · Vehicle size mismatch · Route Changed / Addition stops added · Vehicle number Mismatch · Trip Missing</div>
            </div>
            <div style={{background:'#f8fafc',border:'1px solid #e2e4ed',borderRadius:'10px',padding:'0.75rem 1rem',marginBottom:'0.75rem'}}>
              <div style={{fontSize:'0.82rem',fontWeight:600,color:'#1a1d2e',marginBottom:'0.5rem'}}>Step 2 — Upload Filled Excel <span style={{color:'#dc2626'}}>*</span></div>
              <input type="file" accept=".xlsx,.xls" style={{display:'none'}} id="bulkExcelInput" onChange={e => { const f=e.target.files[0]; if(f) setBulkExcel(f) }}/>
              <label htmlFor="bulkExcelInput" style={{display:'inline-flex',alignItems:'center',gap:'0.4rem',padding:'0.5rem 1rem',background:'#fff',border:'1px solid #e2e4ed',borderRadius:'8px',cursor:'pointer',fontSize:'0.82rem',color:'#4f46e5',fontWeight:600}}>📊 {bulkExcel?'Change Excel File':'Choose Excel File'}</label>
              {bulkExcel && <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginTop:'0.5rem',padding:'0.4rem 0.75rem',background:'rgba(5,150,105,0.08)',border:'1px solid rgba(5,150,105,0.3)',borderRadius:'6px'}}><span style={{fontSize:'0.78rem',color:'#059669',fontWeight:600}}>✓ {bulkExcel.name}</span><span style={{cursor:'pointer',color:'#dc2626',marginLeft:'auto',fontWeight:700}} onClick={() => { setBulkExcel(null); document.getElementById('bulkExcelInput').value='' }}>×</span></div>}
            </div>
            <div style={{background:'#f8fafc',border:'1px solid #e2e4ed',borderRadius:'10px',padding:'0.75rem 1rem',marginBottom:'0.75rem'}}>
              <div style={{fontSize:'0.82rem',fontWeight:600,color:'#1a1d2e',marginBottom:'0.25rem'}}>Step 3 — Upload Proof Files <span style={{color:'#dc2626'}}>*</span></div>
              <div style={{fontSize:'0.72rem',color:'#6b7280',marginBottom:'0.5rem'}}>Filenames must match proof_filename column exactly.</div>
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" multiple style={{display:'none'}} id="bulkProofInput" onChange={e => { const files=Array.from(e.target.files); const invalid=files.filter(f=>f.size>10*1024*1024); if(invalid.length>0){alert(`Files exceed 10MB: ${invalid.map(f=>f.name).join(', ')}`);return} setBulkProofs(files) }}/>
              <label htmlFor="bulkProofInput" style={{display:'inline-flex',alignItems:'center',gap:'0.4rem',padding:'0.5rem 1rem',background:'#fff',border:'1px solid #e2e4ed',borderRadius:'8px',cursor:'pointer',fontSize:'0.82rem',color:'#4f46e5',fontWeight:600}}>📎 {bulkProofs.length>0?`Change Files (${bulkProofs.length} selected)`:'Choose Proof Files'}</label>
              {bulkProofs.length>0 && <div style={{marginTop:'0.5rem',display:'flex',flexWrap:'wrap',gap:'0.4rem'}}>{bulkProofs.map((f,i)=>(<div key={i} style={{background:'rgba(5,150,105,0.08)',border:'1px solid rgba(5,150,105,0.3)',borderRadius:'6px',padding:'0.2rem 0.5rem',fontSize:'0.72rem',color:'#059669',fontWeight:600}}>✓ {f.name}</div>))}</div>}
            </div>
            {bulkSuccess && <div style={{background:'rgba(5,150,105,0.08)',border:'1px solid rgba(5,150,105,0.3)',borderRadius:'8px',padding:'0.75rem 1rem',marginBottom:'0.75rem',fontSize:'0.85rem',color:'#059669',fontWeight:600}}>✓ {bulkSuccess}</div>}
            {bulkErrors.length>0 && <div style={{marginBottom:'0.75rem'}}><div style={{fontSize:'0.82rem',fontWeight:700,color:'#dc2626',marginBottom:'0.5rem'}}>✕ {bulkErrors.length} error{bulkErrors.length>1?'s':''} found</div><div style={{maxHeight:'200px',overflowY:'auto',border:'1px solid #fecaca',borderRadius:'8px'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.75rem'}}><thead><tr style={{background:'#fef2f2'}}><th style={{padding:'0.4rem 0.75rem',textAlign:'left',color:'#dc2626'}}>Row</th><th style={{padding:'0.4rem 0.75rem',textAlign:'left',color:'#dc2626'}}>Trip ID</th><th style={{padding:'0.4rem 0.75rem',textAlign:'left',color:'#dc2626'}}>Error</th></tr></thead><tbody>{bulkErrors.map((e,i)=>(<tr key={i} style={{borderTop:'1px solid #fecaca'}}><td style={{padding:'0.4rem 0.75rem',color:'#6b7280'}}>{e.row}</td><td style={{padding:'0.4rem 0.75rem',color:'#4f46e5',fontWeight:600}}>{e.trip_id}</td><td style={{padding:'0.4rem 0.75rem',color:'#dc2626'}}>{e.error}</td></tr>))}</tbody></table></div></div>}
            <div style={{display:'flex',gap:'0.75rem',marginTop:'0.5rem'}}>
              <button style={styles.modalCancel} onClick={() => { setBulkModal(false); setBulkExcel(null); setBulkProofs([]); setBulkErrors([]); setBulkSuccess('') }}>Close</button>
              <button style={{...styles.modalConfirm,background:'#4f46e5',opacity:bulkLoading?0.6:1}} onClick={submitBulkDispute} disabled={bulkLoading}>{bulkLoading?'Uploading…':'Submit All Disputes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarBrand}>
          <div style={styles.sidebarLogo}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
              <rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/>
              <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
          </div>
          <div>
            <div style={{fontSize:'0.9rem',fontWeight:700,color:'#fff'}}>Vendor Portal</div>
            <div style={{fontSize:'0.68rem',color:'rgba(255,255,255,0.45)'}}>Valmo Logistics</div>
          </div>
        </div>
        <nav style={{padding:'1rem 0.6rem',flex:1}}>
          {['summary','trips'].map(p => (
            <button key={p} style={{...styles.navItem,...(activePage===p?styles.navActive:{})}} onClick={() => setActivePage(p)}>
              {p.charAt(0).toUpperCase()+p.slice(1)}
            </button>
          ))}
        </nav>
        <div style={styles.sidebarFooter}>
          <div style={{fontSize:'0.72rem',color:'rgba(255,255,255,0.4)',padding:'0 0.75rem',marginBottom:'0.5rem',wordBreak:'break-all'}}>{email}</div>
          <button style={styles.logoutBtn} onClick={handleLogout}>Log Out</button>
        </div>
      </aside>

      {/* MAIN */}
      <div style={styles.mainArea}>
        <header style={styles.header}>
          <div style={{fontSize:'1.05rem',fontWeight:700}}>{activePage==='summary'?'Summary':'Trips'}</div>
          <div style={styles.vendorBadge}>{vendorName}</div>
        </header>

        <div style={{padding:'1.5rem'}}>
          {activePage === 'summary' && (
            <div style={styles.tableWrap}>
              <div style={{fontSize:'0.7rem',fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:'#6b7280',padding:'0.85rem 1rem',borderBottom:'1px solid #e2e4ed',background:'#f0f1f5'}}>Vendor Summary</div>
              <div style={{overflowX:'auto'}}><table style={styles.table}>
                <thead><tr style={{background:'#f0f1f5',borderBottom:'1px solid #e2e4ed'}}>{['Transporter ID','Vendor Name','Oracle ID','Total Trips','Total Amount (₹)'].map(h=>(<th key={h} style={styles.th}>{h}</th>))}</tr></thead>
                <tbody>{statsBar.map((s,i)=>(<tr key={i} style={{borderBottom:'1px solid #e2e4ed'}}><td style={{...styles.td,color:'#4f46e5',fontWeight:600}}>{s.transporter_id||'—'}</td><td style={styles.td}>{s.vendor_name||'—'}</td><td style={styles.td}>{s.oracle_id||'—'}</td><td style={{...styles.td,textAlign:'right',fontWeight:700,color:'#4f46e5'}}>{(s.total_trips||0).toLocaleString('en-IN')}</td><td style={{...styles.td,textAlign:'right',fontWeight:700,color:'#059669'}}>₹{(parseFloat(s.total_amount)||0).toLocaleString('en-IN',{maximumFractionDigits:2})}</td></tr>))}</tbody>
              </table></div>
            </div>
          )}

          {/* AGEING */}
          <div style={{...styles.tableWrap,marginTop:'1.5rem'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0.85rem 1rem',borderBottom:'1px solid #e2e4ed',background:'#f0f1f5'}}>
              <div style={{fontSize:'0.7rem',fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:'#6b7280'}}>Pending Vendor Action — Ageing Report</div>
              <button style={{fontSize:'0.75rem',color:'#4f46e5',background:'none',border:'none',cursor:'pointer',fontWeight:600}} onClick={() => loadAgeing(email)}>↻ Refresh</button>
            </div>
            {ageingLoading ? (
              <div style={{padding:'2rem',textAlign:'center',color:'#6b7280',fontSize:'0.85rem'}}>Loading ageing data…</div>
            ) : ageingData ? (
              <>
                <div style={{padding:'0.75rem 1rem',borderBottom:'1px solid #e2e4ed',fontSize:'0.82rem',color:'#6b7280'}}>Total pending trips: <strong style={{color:'#1a1d2e'}}>{ageingData.totalPending?.toLocaleString('en-IN')}</strong></div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'0'}}>
                  {ageingData.buckets && Object.entries(ageingData.buckets).map(([key,bucket],i) => {
                    const colors = {
                      within1:{bg:'#f0fdf4',border:'#bbf7d0',text:'#166534',badge:'#dcfce7',badgeText:'#166534'},
                      within2:{bg:'#fffbeb',border:'#fde68a',text:'#92400e',badge:'#fef3c7',badgeText:'#92400e'},
                      within3:{bg:'#fef2f2',border:'#fecaca',text:'#991b1b',badge:'#fee2e2',badgeText:'#991b1b'},
                      within7:{bg:'#fef2f2',border:'#fecaca',text:'#991b1b',badge:'#fee2e2',badgeText:'#991b1b'},
                      beyond7:{bg:'#fdf2f8',border:'#f5d0fe',text:'#701a75',badge:'#fae8ff',badgeText:'#701a75'}
                    }
                    const c = colors[key]
                    return (
                      <div key={key} style={{background:c.bg,borderRight:i<4?`1px solid ${c.border}`:'none',borderTop:`3px solid ${c.border}`,padding:'1.25rem 1rem',textAlign:'center'}}>
                        <div style={{fontSize:'2rem',fontWeight:800,color:c.text,lineHeight:1}}>{bucket.count.toLocaleString('en-IN')}</div>
                        <div style={{fontSize:'0.72rem',fontWeight:600,color:c.text,marginTop:'0.4rem',lineHeight:1.3}}>{bucket.label}</div>
                        {bucket.count>0&&<div style={{marginTop:'0.5rem',display:'inline-block',background:c.badge,border:`1px solid ${c.border}`,borderRadius:'6px',padding:'0.15rem 0.4rem',fontSize:'0.68rem',fontWeight:600,color:c.badgeText}}>₹{(bucket.amount/1000).toFixed(0)}K at risk</div>}
                      </div>
                    )
                  })}
                </div>
                <div style={{padding:'0.6rem 1rem',background:'#f8fafc',borderTop:'1px solid #e2e4ed',fontSize:'0.72rem',color:'#6b7280'}}>⚠ SLA breach = trips where vendor has not acted within 2 days of trip end date</div>
              </>
            ) : (
              <div style={{padding:'2rem',textAlign:'center',color:'#6b7280',fontSize:'0.85rem'}}>No ageing data available.</div>
            )}
          </div>

          {/* TRIPS PAGE */}
          {activePage === 'trips' && (
            <>
              <div style={styles.toolbar}>
                <div style={{display:'flex',justifyContent:'flex-end',gap:'0.75rem',marginBottom:'0.75rem'}}>
                  <button style={styles.missingTripBtn} onClick={() => { setDisputeModal({trip_id:'MISSING',amount:0,vendor_name:vendorName}); setDisputeCategory('Trip Missing'); setDisputeSecondary('') }}>+ Report Missing Trip</button>
                  <button style={{...styles.missingTripBtn,borderColor:'#4f46e5',color:'#4f46e5'}} onClick={() => { setBulkModal(true); setBulkErrors([]); setBulkSuccess('') }}>↑ Bulk Upload Disputes</button>
                </div>
                <input style={styles.searchInput} placeholder="Search trip ID, vehicle, driver…" value={search} onChange={e => setSearch(e.target.value)}/>
                <select style={styles.select} value={transporterFilter} onChange={e => setTransporterFilter(e.target.value)}><option value="">All Transporter IDs</option>{transporterIds.map(t=><option key={t} value={t}>{t}</option>)}</select>
                <select style={styles.select} value={originFilter} onChange={e => setOriginFilter(e.target.value)}><option value="">All Origins</option>{origins.map(o=><option key={o} value={o}>{o}</option>)}</select>
                <select style={styles.select} value={actionFilter} onChange={e => setActionFilter(e.target.value)}><option value="">All Statuses</option><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="disputed">Disputed</option></select>
                <span style={{fontSize:'0.78rem',color:'#6b7280'}}>{filteredRows.length} trips</span>
              </div>
              <div style={styles.tableWrap}>
                <div style={{overflowX:'auto'}}><table style={styles.table}>
                  <thead><tr style={{background:'#f0f1f5',borderBottom:'1px solid #e2e4ed'}}>
                    {[['trip_id','Trip ID'],['vehicle','Vehicle'],['origin_node','Origin'],['start_date','Start Date'],['end_date','End Date'],['driver','Driver'],['billing_type','Billing'],['haul_type','Type'],['amount','Amount (₹)'],['','Action'],['','Valmo Remarks'],['','Agent Comments'],['','Final Amount']].map(([col,label])=>(
                      <th key={label} style={{...styles.th,cursor:col?'pointer':'default',color:sortCol===col?'#4f46e5':'#6b7280'}} onClick={() => col&&sortBy(col)}>{label}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filteredRows.length===0?(<tr><td colSpan={13} style={{textAlign:'center',padding:'3rem',color:'#6b7280'}}>No trips match your filters.</td></tr>):filteredRows.map((r,i)=>{
                      const status=tripActions[r.trip_id]||'pending'
                      const res=resolutions[r.trip_id]
                      const amt=parseFloat(r.amount)||0
                      return (
                        <tr key={i} style={{borderBottom:'1px solid #e2e4ed'}}>
                          <td style={{...styles.td,color:'#4f46e5',fontWeight:600,whiteSpace:'nowrap'}}>{v(r,'trip_id')}</td>
                          <td style={styles.td}><span style={styles.vehicleBadge}>{v(r,'vehicle')}</span></td>
                          <td style={{...styles.td,whiteSpace:'nowrap'}}>{v(r,'origin_node')}</td>
                          <td style={{...styles.td,whiteSpace:'nowrap'}}>{v(r,'start_date')}</td>
                          <td style={{...styles.td,whiteSpace:'nowrap'}}>{v(r,'end_date')}</td>
                          <td style={{...styles.td,whiteSpace:'nowrap'}}>{v(r,'driver')}</td>
                          <td style={{...styles.td,whiteSpace:'nowrap'}}>{v(r,'billing_type')}</td>
                          <td style={styles.td}><span style={styles.haulChip}>{v(r,'haul_type')}</span></td>
                          <td style={{...styles.td,fontWeight:700,color:'#059669',whiteSpace:'nowrap'}}>₹{amt.toLocaleString('en-IN')}</td>
                          <td style={{...styles.td,minWidth:'140px'}}>
                            {status==='accepted'&&<div style={styles.badgeAccepted}>✓ Accepted</div>}
                            {status==='disputed'&&<div style={styles.badgeDisputed}>⚠ Disputed</div>}
                            {status==='pending'&&<><button style={styles.btnAccept} onClick={()=>setPendingAccept({tripId:r.trip_id,transporterId:r.transporter_id,vendorName:r.vendor_name,amount:r.amount})}>✓ Accept Amount</button><button style={styles.btnDispute} onClick={()=>{setDisputeModal(r);setDisputeReason('')}}>⚠ Raise Dispute</button></>}
                          </td>
                          <td style={styles.td}>{res?.valmo_remarks?<span style={styles.badgeNoDispute}>{res.valmo_remarks}</span>:<span style={styles.badgeNoDispute}>No dispute</span>}</td>
                          <td style={{...styles.td,fontSize:'0.75rem',color:'#6b7280',maxWidth:'180px'}}>{res?.reason_for_rejection||'—'}</td>
                          <td style={{...styles.td,fontWeight:700,color:'#059669',whiteSpace:'nowrap'}}>{res?.final_amount_approved?'₹'+parseFloat(res.final_amount_approved).toLocaleString('en-IN'):'—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table></div>
              </div>
              {hasMore && (
                <div style={{textAlign:'center',marginTop:'1rem'}}>
                  <button style={styles.loadMoreBtn} onClick={() => loadData(email, page+1)}>Load More →</button>
                  <div style={{fontSize:'0.75rem',color:'#6b7280',marginTop:'0.4rem'}}>Showing {allRows.length} of {totalRows} trips</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  splash:{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',flexDirection:'column',gap:'1rem',background:'#f5f6fa'},
  spinner:{width:'40px',height:'40px',border:'3px solid #e2e4ed',borderTopColor:'#4f46e5',borderRadius:'50%',animation:'spin 0.8s linear infinite'},
  layout:{display:'flex',minHeight:'100vh',fontFamily:'Inter,sans-serif',background:'#f5f6fa',color:'#1a1d2e'},
  sidebar:{width:'220px',background:'#1e2a4a',flexShrink:0,display:'flex',flexDirection:'column',position:'fixed',top:0,left:0,bottom:0,zIndex:200},
  sidebarBrand:{padding:'1.25rem 1rem 1rem',borderBottom:'1px solid rgba(255,255,255,0.08)',display:'flex',alignItems:'center',gap:'0.65rem'},
  sidebarLogo:{width:'34px',height:'34px',background:'#4f46e5',borderRadius:'9px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0},
  navItem:{display:'flex',alignItems:'center',gap:'0.65rem',padding:'0.6rem 0.75rem',borderRadius:'8px',cursor:'pointer',fontSize:'0.875rem',fontWeight:500,color:'rgba(255,255,255,0.6)',border:'none',background:'transparent',width:'100%',textAlign:'left',marginBottom:'2px'},
  navActive:{background:'#4f46e5',color:'#fff',fontWeight:600},
  sidebarFooter:{padding:'0.75rem 0.6rem',borderTop:'1px solid rgba(255,255,255,0.08)'},
  logoutBtn:{display:'flex',alignItems:'center',gap:'0.6rem',width:'100%',padding:'0.55rem 0.75rem',borderRadius:'8px',background:'transparent',border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:'0.82rem',fontWeight:500,color:'rgba(255,255,255,0.5)'},
  mainArea:{marginLeft:'220px',flex:1,display:'flex',flexDirection:'column',minHeight:'100vh'},
  header:{background:'#fff',borderBottom:'1px solid #e2e4ed',padding:'0 1.5rem',height:'60px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100},
  vendorBadge:{background:'#f0f1f5',border:'1px solid #e2e4ed',borderRadius:'8px',padding:'0.3rem 0.75rem',fontSize:'0.8rem',fontWeight:600},
  toolbar:{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'1rem',flexWrap:'wrap'},
  searchInput:{flex:1,minWidth:'180px',maxWidth:'300px',background:'#fff',border:'1px solid #e2e4ed',borderRadius:'8px',color:'#1a1d2e',fontFamily:'Inter,sans-serif',fontSize:'0.85rem',padding:'0.55rem 1rem',outline:'none'},
  select:{background:'#fff',border:'1px solid #e2e4ed',borderRadius:'8px',color:'#1a1d2e',fontFamily:'Inter,sans-serif',fontSize:'0.85rem',padding:'0.55rem 0.75rem',outline:'none'},
  tableWrap:{background:'#fff',border:'1px solid #e2e4ed',borderRadius:'16px',overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,0.05)'},
  table:{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem'},
  th:{padding:'0.75rem 1rem',textAlign:'left',fontSize:'0.7rem',fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:'#6b7280',whiteSpace:'nowrap'},
  td:{padding:'0.7rem 1rem',verticalAlign:'top',color:'#1a1d2e'},
  vehicleBadge:{background:'rgba(79,70,229,0.08)',border:'1px solid rgba(79,70,229,0.18)',borderRadius:'6px',padding:'0.2rem 0.5rem',fontSize:'0.75rem',fontWeight:600,color:'#4f46e5',whiteSpace:'nowrap'},
  haulChip:{background:'#f0f1f5',border:'1px solid #e2e4ed',borderRadius:'6px',padding:'0.15rem 0.45rem',fontSize:'0.72rem',fontWeight:600,color:'#6b7280',whiteSpace:'nowrap'},
  btnAccept:{background:'rgba(5,150,105,0.08)',border:'1px solid rgba(5,150,105,0.3)',color:'#059669',borderRadius:'8px',padding:'0.35rem 0.75rem',fontFamily:'Inter,sans-serif',fontSize:'0.75rem',fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',display:'block',width:'100%',marginBottom:'6px',textAlign:'center'},
  btnDispute:{background:'rgba(217,119,6,0.08)',border:'1px solid rgba(217,119,6,0.3)',color:'#d97706',borderRadius:'8px',padding:'0.35rem 0.75rem',fontFamily:'Inter,sans-serif',fontSize:'0.75rem',fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',display:'block',width:'100%',textAlign:'center'},
  badgeAccepted:{background:'rgba(5,150,105,0.08)',border:'1px solid rgba(5,150,105,0.3)',color:'#059669',borderRadius:'8px',padding:'0.35rem 0.75rem',fontSize:'0.75rem',fontWeight:600,textAlign:'center'},
  badgeDisputed:{background:'rgba(217,119,6,0.08)',border:'1px solid rgba(217,119,6,0.3)',color:'#d97706',borderRadius:'8px',padding:'0.35rem 0.75rem',fontSize:'0.75rem',fontWeight:600,textAlign:'center'},
  badgeNoDispute:{background:'#f0f1f5',border:'1px solid #e2e4ed',color:'#6b7280',borderRadius:'6px',padding:'0.2rem 0.5rem',fontSize:'0.72rem',fontWeight:600,whiteSpace:'nowrap'},
  modalOverlay:{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'1rem'},
  modal:{background:'#fff',border:'1px solid #e2e4ed',borderRadius:'16px',padding:'2rem',maxWidth:'380px',width:'100%',maxHeight:'90vh',overflowY:'auto'},
  modalCancel:{flex:1,padding:'0.7rem',background:'transparent',border:'1px solid #e2e4ed',borderRadius:'10px',color:'#6b7280',fontFamily:'Inter,sans-serif',fontSize:'0.9rem',cursor:'pointer'},
  modalConfirm:{flex:1,padding:'0.7rem',background:'#059669',border:'none',borderRadius:'10px',color:'#fff',fontFamily:'Inter,sans-serif',fontSize:'0.9rem',fontWeight:700,cursor:'pointer'},
  loadMoreBtn:{background:'transparent',border:'1px solid #e2e4ed',borderRadius:'8px',color:'#6b7280',fontFamily:'Inter,sans-serif',fontSize:'0.85rem',padding:'0.65rem 2rem',cursor:'pointer'},
  missingTripBtn:{background:'#fff',border:'1px solid #d97706',borderRadius:'8px',color:'#d97706',fontFamily:'Inter,sans-serif',fontSize:'0.85rem',fontWeight:600,padding:'0.5rem 1rem',cursor:'pointer'},
  disputeLabel:{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#6b7280',marginBottom:'0.4rem',textTransform:'uppercase',letterSpacing:'0.05em',marginTop:'0.25rem'},
  secondaryBox:{background:'#fffbeb',border:'1px solid #fcd34d',borderRadius:'10px',padding:'0.75rem 1rem',marginBottom:'1rem'},
  secondaryLabel:{display:'block',fontSize:'0.75rem',fontWeight:700,color:'#d97706',marginBottom:'0.5rem',textTransform:'uppercase',letterSpacing:'0.05em'},
  disputeInput:{width:'100%',padding:'0.6rem 0.75rem',border:'1px solid #e2e4ed',borderRadius:'8px',fontFamily:'Inter,sans-serif',fontSize:'0.85rem',color:'#1a1d2e',outline:'none',boxSizing:'border-box'},
}
