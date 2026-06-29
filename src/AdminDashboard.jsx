import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from './lib/supabase'

const DISPUTE_PAGE_SIZE = 50

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [userEmail, setUserEmail] = useState(null)

  const [activePage, setActivePage] = useState('performance')
  const [performance, setPerformance] = useState([])
  const [allDisputes, setAllDisputes] = useState([])
  const [vendors, setVendors] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(false)

  const [quickFilter, setQuickFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [agentFilter, setAgentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [disputePage, setDisputePage] = useState(0)
  const [disputeTotal, setDisputeTotal] = useState(0)
  const [disputeHasMore, setDisputeHasMore] = useState(false)

  const [tripFile, setTripFile] = useState(null)
  const [tripUploadResult, setTripUploadResult] = useState(null)
  const [tripUploading, setTripUploading] = useState(false)

  const [mappingFile, setMappingFile] = useState(null)
  const [mappingMsg, setMappingMsg] = useState('')
  const [mappingUploading, setMappingUploading] = useState(false)

  const [newVendorEmail, setNewVendorEmail] = useState('')
  const [newVendorName, setNewVendorName] = useState('')
  const [newVendorTid, setNewVendorTid] = useState('')
  const [vendorMsg, setVendorMsg] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate('/admin'); return }
      setUserEmail(session.user.email)
    })
  }, [])

  useEffect(() => {
    if (!userEmail) return
    loadAgents()
  }, [userEmail])

  useEffect(() => {
    if (!userEmail) return
    if (activePage === 'performance') loadPerformance()
    if (activePage === 'disputes') loadDisputes(0)
    if (activePage === 'vendors') loadVendors()
  }, [activePage, userEmail])

  useEffect(() => {
    if (userEmail && activePage === 'performance') loadPerformance()
  }, [dateFrom, dateTo])

  async function loadAgents() {
    const { data } = await supabase
      .from('profiles').select('id, email, name').eq('role', 'agent')
    setAgents(data || [])
  }

  async function loadPerformance() {
    setLoading(true)
    try {
      const { data: agentList } = await supabase
        .from('profiles').select('id, email, name').eq('role', 'agent')

      const perf = await Promise.all((agentList || []).map(async agent => {
        let query = supabase.from('disputes').select('id, status, raised_at').eq('assigned_to', agent.email)
        if (dateFrom) query = query.gte('raised_at', dateFrom + 'T00:00:00Z')
        if (dateTo) query = query.lte('raised_at', dateTo + 'T23:59:59Z')
        const { data: agentDisputes } = await query

        const assigned = (agentDisputes || []).length
        const resolved = (agentDisputes || []).filter(d => d.status === 'resolved').length
        const pending = assigned - resolved
        const now = new Date()
        const slaBreach = (agentDisputes || []).filter(d => d.status === 'open' && d.raised_at && (now - new Date(d.raised_at)) / 3600000 > 24).length

        return { name: agent.name || agent.email, email: agent.email, assigned, resolved, pending, slaBreach }
      }))
      setPerformance(perf)
    } catch {}
    setLoading(false)
  }

  async function loadDisputes(pg) {
    setLoading(true)
    try {
      let query = supabase.from('disputes').select('*', { count: 'exact' })
      if (agentFilter) query = query.eq('assigned_to', agentFilter)
      if (statusFilter) query = query.eq('status', statusFilter)
      query = query.order('raised_at', { ascending: false }).range(pg * DISPUTE_PAGE_SIZE, (pg + 1) * DISPUTE_PAGE_SIZE - 1)

      const { data, count } = await query
      if (pg === 0) setAllDisputes(data || [])
      else setAllDisputes(prev => [...prev, ...(data || [])])
      setDisputeTotal(count || 0)
      setDisputeHasMore((pg + 1) * DISPUTE_PAGE_SIZE < (count || 0))
      setDisputePage(pg)
    } catch {}
    setLoading(false)
  }

  async function loadVendors() {
    setLoading(true)
    const { data } = await supabase.from('vendors').select('email, vendor_name, transporter_id, oracle_id').order('email')
    setVendors(data || [])
    setLoading(false)
  }

  function applyQuickFilter(filter) {
    setQuickFilter(filter)
    const now = new Date()
    if (filter === 'today') {
      const d = now.toISOString().slice(0,10)
      setDateFrom(d); setDateTo(d)
    } else if (filter === '7days') {
      const from = new Date(now - 7*24*60*60*1000).toISOString().slice(0,10)
      setDateFrom(from); setDateTo(now.toISOString().slice(0,10))
    } else if (filter === '30days') {
      const from = new Date(now - 30*24*60*60*1000).toISOString().slice(0,10)
      setDateFrom(from); setDateTo(now.toISOString().slice(0,10))
    } else {
      setDateFrom(''); setDateTo('')
    }
  }

  async function uploadTrips() {
    if (!tripFile) { alert('Please select a file.'); return }
    setTripUploading(true); setTripUploadResult(null)

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])

        let imported = 0, skipped = 0
        const errors = []

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          if (!row.trip_id) { errors.push({ row: i + 2, error: 'Missing trip_id' }); continue }

          const tripRow = {
            trip_id: String(row.trip_id),
            vendor_email: row.vendor_email || row.email || null,
            vendor_name: row.vendor_name || null,
            transporter_id: row.transporter_id ? String(row.transporter_id) : null,
            oracle_id: row.oracle_id ? String(row.oracle_id) : null,
            origin_node: row.origin_node || row.origin || null,
            destination: row.destination || null,
            vehicle: row.vehicle || null,
            driver: row.driver || null,
            start_date: row.start_date || null,
            end_date: row.end_date || null,
            billing_type: row.billing_type || null,
            haul_type: row.haul_type || null,
            amount: parseFloat(row.amount) || 0,
            status: 'pending'
          }

          const { error: upsertErr } = await supabase.from('trips').upsert(tripRow, { onConflict: 'trip_id', ignoreDuplicates: true })
          if (upsertErr) { errors.push({ row: i + 2, error: upsertErr.message }); continue }
          imported++
        }

        setTripUploadResult({ success: true, imported, skipped, total: rows.length, errors })
      } catch (err) {
        setTripUploadResult({ success: false, message: err.message })
      }
      setTripUploading(false)
    }
    reader.readAsArrayBuffer(tripFile)
  }

  async function uploadMapping() {
    if (!mappingFile) { alert('Please select a file.'); return }
    setMappingUploading(true); setMappingMsg('')
    try {
      const text = await mappingFile.text()
      const lines = text.trim().split('\n').slice(1)
      const rows = lines.map(l => {
        const parts = l.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
        return { agent_email: parts[0], transporter_id: parts[1] }
      }).filter(r => r.agent_email && r.transporter_id)

      if (rows.length === 0) { setMappingMsg('No valid rows found.'); setMappingUploading(false); return }

      const agentEmails = [...new Set(rows.map(r => r.agent_email))]
      await supabase.from('agent_transporter_mapping').delete().in('agent_email', agentEmails)
      const { error: insErr } = await supabase.from('agent_transporter_mapping').insert(rows)
      setMappingMsg(insErr ? 'Upload failed: ' + insErr.message : `Uploaded ${rows.length} mappings successfully.`)
    } catch {
      setMappingMsg('Upload failed. Please try again.')
    }
    setMappingUploading(false)
  }

  async function addVendor() {
    if (!newVendorEmail || !newVendorTid) { setVendorMsg('Email and Transporter ID are required.'); return }
    const { error } = await supabase.from('vendors').insert({
      email: newVendorEmail,
      vendor_name: newVendorName || null,
      transporter_id: newVendorTid
    })
    if (!error) {
      setVendorMsg('Vendor added successfully!')
      setNewVendorEmail(''); setNewVendorName(''); setNewVendorTid('')
      loadVendors()
    } else {
      setVendorMsg(error.message.includes('unique') ? 'This email + transporter ID combination already exists.' : error.message)
    }
  }

  async function removeVendor(vEmail, transporterId) {
    if (!window.confirm(`Remove ${vEmail} (${transporterId})?`)) return
    await supabase.from('vendors').delete().eq('email', vEmail).eq('transporter_id', transporterId)
    loadVendors()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/admin')
  }

  const navItems = [
    { key:'performance', label:'Agent Performance' },
    { key:'disputes', label:'All Disputes' },
    { key:'trips', label:'Upload Trips' },
    { key:'mapping', label:'Upload Mapping' },
    { key:'vendors', label:'Manage Vendors' },
  ]

  const email = userEmail || ''

  return (
    <div style={styles.layout}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarBrand}>
          <div style={styles.sidebarLogo}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <div style={{fontSize:'0.9rem',fontWeight:700,color:'#fff'}}>Admin Portal</div>
            <div style={{fontSize:'0.68rem',color:'rgba(255,255,255,0.45)'}}>Valmo Logistics</div>
          </div>
        </div>
        <nav style={{padding:'1rem 0.6rem',flex:1}}>
          {navItems.map(item => (
            <button key={item.key} style={{...styles.navItem,...(activePage===item.key?styles.navActive:{})}} onClick={() => setActivePage(item.key)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div style={styles.sidebarFooter}>
          <div style={{fontSize:'0.72rem',color:'rgba(255,255,255,0.4)',padding:'0 0.75rem',marginBottom:'0.5rem',wordBreak:'break-all'}}>{email}</div>
          <button style={styles.logoutBtn} onClick={handleLogout}>Log Out</button>
        </div>
      </aside>

      <div style={styles.mainArea}>
        <header style={styles.header}>
          <div style={{fontSize:'1.05rem',fontWeight:700}}>{navItems.find(n=>n.key===activePage)?.label}</div>
          <div style={styles.adminBadge}>{email}</div>
        </header>

        <div style={{padding:'1.5rem'}}>

          {/* AGENT PERFORMANCE */}
          {activePage === 'performance' && (
            <>
              <div style={{display:'flex',gap:'0.5rem',marginBottom:'1rem',flexWrap:'wrap',alignItems:'center'}}>
                {[['all','All Time'],['today','Today'],['7days','Last 7 Days'],['30days','Last 30 Days'],['custom','Custom']].map(([key,label]) => (
                  <button key={key} style={{...styles.filterTab,...(quickFilter===key?styles.filterTabActive:{})}} onClick={() => applyQuickFilter(key)}>{label}</button>
                ))}
                {quickFilter === 'custom' && (
                  <>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={styles.dateInput}/>
                    <span style={{color:'#6b7280',fontSize:'0.82rem'}}>to</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={styles.dateInput}/>
                  </>
                )}
                <button style={styles.refreshBtn} onClick={loadPerformance}>↻ Refresh</button>
              </div>

              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr style={{background:'#f0f1f5',borderBottom:'1px solid #e2e4ed'}}>
                      {['Agent','Email','Assigned','Resolved','Pending','SLA Breach (24h+)','Resolution Rate'].map(h => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7} style={{textAlign:'center',padding:'2rem',color:'#6b7280'}}>Loading…</td></tr>
                    ) : performance.length === 0 ? (
                      <tr><td colSpan={7} style={{textAlign:'center',padding:'2rem',color:'#6b7280'}}>No data found.</td></tr>
                    ) : performance.map((p, i) => {
                      const rate = p.assigned > 0 ? Math.round((p.resolved/p.assigned)*100) : 0
                      return (
                        <tr key={i} style={{borderBottom:'1px solid #e2e4ed'}}>
                          <td style={{...styles.td,fontWeight:600}}>{p.name}</td>
                          <td style={{...styles.td,fontSize:'0.78rem',color:'#6b7280'}}>{p.email}</td>
                          <td style={{...styles.td,textAlign:'center',fontWeight:700,color:'#4f46e5'}}>{p.assigned}</td>
                          <td style={{...styles.td,textAlign:'center',fontWeight:700,color:'#059669'}}>{p.resolved}</td>
                          <td style={{...styles.td,textAlign:'center',fontWeight:700,color:'#d97706'}}>{p.pending}</td>
                          <td style={{...styles.td,textAlign:'center'}}>
                            <span style={{background:p.slaBreach>0?'rgba(220,38,38,0.1)':'rgba(5,150,105,0.1)',border:`1px solid ${p.slaBreach>0?'rgba(220,38,38,0.3)':'rgba(5,150,105,0.3)'}`,color:p.slaBreach>0?'#dc2626':'#059669',borderRadius:'6px',padding:'0.2rem 0.5rem',fontSize:'0.78rem',fontWeight:700}}>
                              {p.slaBreach}
                            </span>
                          </td>
                          <td style={{...styles.td,textAlign:'center'}}>
                            <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
                              <div style={{flex:1,background:'#e2e4ed',borderRadius:'4px',height:'6px'}}>
                                <div style={{width:`${rate}%`,background:rate>=80?'#059669':rate>=50?'#d97706':'#dc2626',borderRadius:'4px',height:'6px'}}/>
                              </div>
                              <span style={{fontSize:'0.78rem',fontWeight:700,color:rate>=80?'#059669':rate>=50?'#d97706':'#dc2626'}}>{rate}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ALL DISPUTES */}
          {activePage === 'disputes' && (
            <>
              <div style={{display:'flex',gap:'0.75rem',marginBottom:'1rem',flexWrap:'wrap'}}>
                <select style={styles.select} value={agentFilter} onChange={e => { setAgentFilter(e.target.value); setAllDisputes([]); }}>
                  <option value="">All Agents</option>
                  {agents.map(a => <option key={a.email} value={a.email}>{a.name || a.email}</option>)}
                </select>
                <select style={styles.select} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setAllDisputes([]); }}>
                  <option value="">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                </select>
                <span style={{fontSize:'0.78rem',color:'#6b7280',alignSelf:'center'}}>{disputeTotal} total disputes</span>
                <button style={styles.refreshBtn} onClick={() => loadDisputes(0)}>↻ Refresh</button>
              </div>
              <div style={styles.tableWrap}>
                <div style={{overflowX:'auto'}}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={{background:'#f0f1f5',borderBottom:'1px solid #e2e4ed'}}>
                        {['Trip ID','Vendor','Amount','Category','Raised At','Assigned To','Status','Resolution','Final Amount'].map(h => (
                          <th key={h} style={styles.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={9} style={{textAlign:'center',padding:'2rem',color:'#6b7280'}}>Loading…</td></tr>
                      ) : allDisputes.map((d, i) => (
                        <tr key={i} style={{borderBottom:'1px solid #e2e4ed'}}>
                          <td style={{...styles.td,color:'#4f46e5',fontWeight:600,whiteSpace:'nowrap'}}>{d.trip_id}</td>
                          <td style={{...styles.td,whiteSpace:'nowrap'}}>{d.vendor_name}</td>
                          <td style={{...styles.td,fontWeight:700,color:'#059669',whiteSpace:'nowrap'}}>₹{Number(d.amount).toLocaleString('en-IN')}</td>
                          <td style={{...styles.td,fontSize:'0.78rem',maxWidth:'180px'}}>{d.dispute_reason?.split('—')[0]?.trim()}</td>
                          <td style={{...styles.td,whiteSpace:'nowrap',fontSize:'0.78rem'}}>{d.raised_at?.slice(0,16).replace('T',' ')}</td>
                          <td style={{...styles.td,fontSize:'0.78rem'}}>{d.assigned_to || '—'}</td>
                          <td style={styles.td}>
                            <span style={{background:d.status==='open'?'rgba(245,158,11,0.1)':'rgba(5,150,105,0.1)',border:`1px solid ${d.status==='open'?'rgba(245,158,11,0.3)':'rgba(5,150,105,0.3)'}`,color:d.status==='open'?'#d97706':'#059669',borderRadius:'6px',padding:'0.2rem 0.5rem',fontSize:'0.72rem',fontWeight:600}}>
                              {d.status}
                            </span>
                          </td>
                          <td style={styles.td}>{d.valmo_remarks || '—'}</td>
                          <td style={{...styles.td,fontWeight:700,color:'#059669',whiteSpace:'nowrap'}}>{d.final_amount_approved ? `₹${Number(d.final_amount_approved).toLocaleString('en-IN')}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {disputeHasMore && (
                <div style={{textAlign:'center',marginTop:'1rem'}}>
                  <button style={styles.loadMoreBtn} onClick={() => loadDisputes(disputePage+1)}>Load More →</button>
                </div>
              )}
            </>
          )}

          {/* UPLOAD TRIPS */}
          {activePage === 'trips' && (
            <div style={styles.uploadCard}>
              <h3 style={styles.uploadTitle}>Upload Trip Data</h3>
              <p style={styles.uploadDesc}>Upload an Excel or CSV file to add new trips to the system. Existing trip IDs will be skipped (upsert on conflict).</p>
              <div style={{background:'#fffbeb',border:'1px solid #fcd34d',borderRadius:'8px',padding:'0.75rem 1rem',marginBottom:'1rem',fontSize:'0.78rem',color:'#92400e'}}>
                Required column: <strong>trip_id</strong>. Optional: vendor_email, vendor_name, transporter_id, oracle_id, origin_node, destination, vehicle, driver, start_date, end_date, billing_type, haul_type, amount
              </div>
              <div style={styles.uploadBox}>
                <input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} id="tripFileInput" onChange={e => { setTripFile(e.target.files[0]); setTripUploadResult(null) }}/>
                <label htmlFor="tripFileInput" style={styles.chooseBtn}>📊 {tripFile ? tripFile.name : 'Choose Excel or CSV File'}</label>
                {tripFile && <div style={{fontSize:'0.78rem',color:'#6b7280',marginTop:'0.5rem'}}>{(tripFile.size/1024/1024).toFixed(2)}MB</div>}
              </div>
              <button style={{...styles.uploadBtn,opacity:tripUploading?0.6:1}} onClick={uploadTrips} disabled={tripUploading}>
                {tripUploading ? 'Uploading…' : '↑ Upload Trips'}
              </button>
              {tripUploadResult && (
                <div style={{marginTop:'1rem',padding:'1rem',background:tripUploadResult.success?'#f0fdf4':'#fef2f2',border:`1px solid ${tripUploadResult.success?'#bbf7d0':'#fecaca'}`,borderRadius:'10px'}}>
                  {tripUploadResult.success ? (
                    <>
                      <div style={{fontWeight:700,color:'#166534',marginBottom:'0.5rem'}}>✓ Upload Complete</div>
                      <div style={{fontSize:'0.85rem',color:'#166534'}}>Imported: {tripUploadResult.imported} trips</div>
                      <div style={{fontSize:'0.85rem',color:'#6b7280'}}>Total rows: {tripUploadResult.total}</div>
                      {tripUploadResult.errors?.length > 0 && (
                        <div style={{marginTop:'0.75rem'}}>
                          <div style={{fontSize:'0.78rem',fontWeight:700,color:'#dc2626',marginBottom:'0.4rem'}}>{tripUploadResult.errors.length} errors:</div>
                          {tripUploadResult.errors.slice(0,5).map((e,i) => (
                            <div key={i} style={{fontSize:'0.72rem',color:'#dc2626'}}>Row {e.row}: {e.error}</div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{color:'#dc2626',fontWeight:600}}>{tripUploadResult.message}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* UPLOAD MAPPING */}
          {activePage === 'mapping' && (
            <div style={styles.uploadCard}>
              <h3 style={styles.uploadTitle}>Upload Agent-Transporter Mapping</h3>
              <p style={styles.uploadDesc}>Upload a CSV file with agent_email and transporter_id columns. Existing mappings for those agents will be replaced.</p>
              <div style={{background:'#fffbeb',border:'1px solid #fcd34d',borderRadius:'8px',padding:'0.75rem 1rem',marginBottom:'1rem',fontSize:'0.78rem',color:'#92400e'}}>
                CSV format: <strong>agent_email, transporter_id</strong> (one mapping per row, first row is header)
              </div>
              <div style={styles.uploadBox}>
                <input type="file" accept=".csv" style={{display:'none'}} id="mappingFileInput" onChange={e => { setMappingFile(e.target.files[0]); setMappingMsg('') }}/>
                <label htmlFor="mappingFileInput" style={styles.chooseBtn}>📎 {mappingFile ? mappingFile.name : 'Choose CSV File'}</label>
              </div>
              <button style={{...styles.uploadBtn,opacity:mappingUploading?0.6:1}} onClick={uploadMapping} disabled={mappingUploading}>
                {mappingUploading ? 'Uploading…' : '↑ Upload Mapping'}
              </button>
              {mappingMsg && (
                <div style={{marginTop:'1rem',padding:'0.75rem 1rem',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'8px',color:'#166534',fontWeight:600,fontSize:'0.85rem'}}>
                  ✓ {mappingMsg}
                </div>
              )}
            </div>
          )}

          {/* MANAGE VENDORS */}
          {activePage === 'vendors' && (
            <>
              <div style={{...styles.uploadCard,marginBottom:'1.5rem'}}>
                <h3 style={styles.uploadTitle}>Add New Vendor</h3>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'0.75rem',marginBottom:'0.75rem'}}>
                  <div>
                    <label style={styles.formLabel}>Email <span style={{color:'#dc2626'}}>*</span></label>
                    <input style={styles.formInput} placeholder="vendor@example.com" value={newVendorEmail} onChange={e => setNewVendorEmail(e.target.value)}/>
                  </div>
                  <div>
                    <label style={styles.formLabel}>Vendor Name</label>
                    <input style={styles.formInput} placeholder="Vendor name" value={newVendorName} onChange={e => setNewVendorName(e.target.value)}/>
                  </div>
                  <div>
                    <label style={styles.formLabel}>Transporter ID <span style={{color:'#dc2626'}}>*</span></label>
                    <input style={styles.formInput} placeholder="e.g. 11220397" value={newVendorTid} onChange={e => setNewVendorTid(e.target.value)}/>
                  </div>
                </div>
                <button style={styles.uploadBtn} onClick={addVendor}>+ Add Vendor</button>
                {vendorMsg && <div style={{marginTop:'0.5rem',fontSize:'0.82rem',color:vendorMsg.includes('success')?'#059669':'#dc2626',fontWeight:600}}>{vendorMsg}</div>}
              </div>

              <div style={styles.tableWrap}>
                <div style={{padding:'0.85rem 1rem',borderBottom:'1px solid #e2e4ed',background:'#f0f1f5',fontSize:'0.7rem',fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:'#6b7280'}}>
                  Authorized Vendors ({vendors.length})
                </div>
                <table style={styles.table}>
                  <thead>
                    <tr style={{background:'#f0f1f5',borderBottom:'1px solid #e2e4ed'}}>
                      {['Email','Vendor Name','Transporter ID','Action'].map(h => (<th key={h} style={styles.th}>{h}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={4} style={{textAlign:'center',padding:'2rem',color:'#6b7280'}}>Loading…</td></tr>
                    ) : vendors.length === 0 ? (
                      <tr><td colSpan={4} style={{textAlign:'center',padding:'2rem',color:'#6b7280'}}>No vendors found.</td></tr>
                    ) : vendors.map((v, i) => (
                      <tr key={i} style={{borderBottom:'1px solid #e2e4ed'}}>
                        <td style={{...styles.td,color:'#4f46e5',fontWeight:600}}>{v.email}</td>
                        <td style={styles.td}>{v.vendor_name || '—'}</td>
                        <td style={styles.td}>{v.transporter_id}</td>
                        <td style={styles.td}>
                          <button style={{background:'rgba(220,38,38,0.08)',border:'1px solid rgba(220,38,38,0.3)',color:'#dc2626',borderRadius:'6px',padding:'0.3rem 0.6rem',fontSize:'0.75rem',fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif'}}
                            onClick={() => removeVendor(v.email, v.transporter_id)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}

const styles = {
  layout:{display:'flex',minHeight:'100vh',fontFamily:'Inter,sans-serif',background:'#f5f6fa',color:'#1a1d2e'},
  sidebar:{width:'220px',background:'#7f1d1d',flexShrink:0,display:'flex',flexDirection:'column',position:'fixed',top:0,left:0,bottom:0,zIndex:200},
  sidebarBrand:{padding:'1.25rem 1rem 1rem',borderBottom:'1px solid rgba(255,255,255,0.1)',display:'flex',alignItems:'center',gap:'0.65rem'},
  sidebarLogo:{width:'34px',height:'34px',background:'#dc2626',borderRadius:'9px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0},
  navItem:{display:'flex',alignItems:'center',gap:'0.65rem',padding:'0.6rem 0.75rem',borderRadius:'8px',cursor:'pointer',fontSize:'0.875rem',fontWeight:500,color:'rgba(255,255,255,0.6)',border:'none',background:'transparent',width:'100%',textAlign:'left',marginBottom:'2px'},
  navActive:{background:'#dc2626',color:'#fff',fontWeight:600},
  sidebarFooter:{marginTop:'auto',padding:'0.75rem 0.6rem',borderTop:'1px solid rgba(255,255,255,0.1)'},
  logoutBtn:{display:'flex',alignItems:'center',width:'100%',padding:'0.55rem 0.75rem',borderRadius:'8px',background:'transparent',border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:'0.82rem',color:'rgba(255,255,255,0.5)'},
  mainArea:{marginLeft:'220px',flex:1,display:'flex',flexDirection:'column',minHeight:'100vh'},
  header:{background:'#fff',borderBottom:'1px solid #e2e4ed',padding:'0 1.5rem',height:'60px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100},
  adminBadge:{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'8px',padding:'0.3rem 0.75rem',fontSize:'0.8rem',fontWeight:600,color:'#dc2626',maxWidth:'200px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  filterTab:{padding:'0.4rem 0.75rem',borderRadius:'8px',border:'1px solid #e2e4ed',background:'#fff',color:'#6b7280',fontSize:'0.82rem',cursor:'pointer',fontFamily:'Inter,sans-serif'},
  filterTabActive:{background:'#dc2626',color:'#fff',border:'1px solid #dc2626',fontWeight:600},
  dateInput:{background:'#fff',border:'1px solid #e2e4ed',borderRadius:'8px',color:'#1a1d2e',fontFamily:'Inter,sans-serif',fontSize:'0.82rem',padding:'0.4rem 0.6rem',outline:'none'},
  refreshBtn:{padding:'0.4rem 0.75rem',borderRadius:'8px',border:'1px solid #e2e4ed',background:'#fff',color:'#6b7280',fontSize:'0.82rem',cursor:'pointer',fontFamily:'Inter,sans-serif',marginLeft:'auto'},
  tableWrap:{background:'#fff',border:'1px solid #e2e4ed',borderRadius:'16px',overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,0.05)'},
  table:{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem'},
  th:{padding:'0.75rem 1rem',textAlign:'left',fontSize:'0.7rem',fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:'#6b7280',whiteSpace:'nowrap'},
  td:{padding:'0.7rem 1rem',verticalAlign:'middle',color:'#1a1d2e'},
  select:{background:'#fff',border:'1px solid #e2e4ed',borderRadius:'8px',color:'#1a1d2e',fontFamily:'Inter,sans-serif',fontSize:'0.85rem',padding:'0.55rem 0.75rem',outline:'none'},
  loadMoreBtn:{background:'transparent',border:'1px solid #e2e4ed',borderRadius:'8px',color:'#6b7280',fontFamily:'Inter,sans-serif',fontSize:'0.85rem',padding:'0.65rem 2rem',cursor:'pointer'},
  uploadCard:{background:'#fff',border:'1px solid #e2e4ed',borderRadius:'16px',padding:'2rem',maxWidth:'600px',boxShadow:'0 1px 4px rgba(0,0,0,0.05)'},
  uploadTitle:{fontSize:'1rem',fontWeight:700,color:'#1a1d2e',marginBottom:'0.5rem',marginTop:0},
  uploadDesc:{fontSize:'0.85rem',color:'#6b7280',marginBottom:'1.25rem',lineHeight:1.6},
  uploadBox:{marginBottom:'1rem'},
  chooseBtn:{display:'inline-flex',alignItems:'center',gap:'0.4rem',padding:'0.6rem 1rem',background:'#f8fafc',border:'1px solid #e2e4ed',borderRadius:'8px',cursor:'pointer',fontSize:'0.85rem',color:'#4f46e5',fontWeight:600},
  uploadBtn:{padding:'0.7rem 1.5rem',background:'#dc2626',border:'none',borderRadius:'8px',color:'#fff',fontFamily:'Inter,sans-serif',fontSize:'0.9rem',fontWeight:600,cursor:'pointer'},
  formLabel:{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#6b7280',marginBottom:'0.4rem',textTransform:'uppercase',letterSpacing:'0.05em'},
  formInput:{width:'100%',padding:'0.6rem 0.75rem',border:'1px solid #e2e4ed',borderRadius:'8px',fontFamily:'Inter,sans-serif',fontSize:'0.85rem',color:'#1a1d2e',outline:'none',boxSizing:'border-box'},
}
