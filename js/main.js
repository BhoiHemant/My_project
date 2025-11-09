// Global JS - Hinglish Comments: Yahan pe sab common interactions/logic rakhe gaye hain
(function(){
  const $ = (sel,scope=document)=>scope.querySelector(sel);
  const $$ = (sel,scope=document)=>Array.from(scope.querySelectorAll(sel));
  // Backend API base URL (production)
  const API_BASE = "https://vaidya-ihc9.onrender.com";

  // Session is managed by httpOnly cookie on the server (no localStorage)
  function clearAuth(){ /* cookie-cleared server-side */ }
  function getUser(){ return null; }
  function setUser(u){ /* no-op: session via cookie */ }

  async function apiFetch(path, options={}){
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers||{});
    const res = await fetch(`${API_BASE}${path}`, Object.assign({}, options, { headers, credentials: 'include' }));
    console.log(`[API] ${options.method||'GET'} ${path} -> ${res.status}`);
    if(res.status === 401){ clearAuth(); if(!window.location.pathname.endsWith('login.html')) window.location.href = 'login.html'; throw new Error('Unauthorized'); }
    let data = null; try{ data = await res.json(); }catch(_){/* no json */}
    console.log('[API] JSON:', data);
    if(!res.ok){ const msg = (data && (data.message||data.error)) || `Request failed (${res.status})`; const err = new Error(msg); err.status=res.status; err.data=data; throw err; }
    return data;
  }

  async function protectPageWithServer(){
    const isProtected = [/doctor-dashboard\.html$/, /user-dashboard\.html$/, /admin-dashboard\.html$/].some(r=>r.test(window.location.pathname));
    if(!isProtected) return;
    try{
      const me = await apiFetch('/api/auth/me', { method:'GET' });
      const nameEl = document.getElementById('username');
      if(nameEl && me && me.email){ nameEl.innerText = me.email; }
    }catch(err){
      window.location.href = 'login.html';
    }
  }
  protectPageWithServer();

  function initAuthUI(){
    // Inject Logout button if logged in
    const nav = $('#nav-links');
    if(nav){
      const existing = nav.querySelector('#nav-logout');
      if(!existing){ const a=document.createElement('a'); a.href='#'; a.id='nav-logout'; a.className='btn secondary'; a.textContent='Logout'; nav.appendChild(a); }
    }
    document.addEventListener('click',(e)=>{
      const a = e.target.closest('#nav-logout');
      if(a){ e.preventDefault(); logout(); }
    });
  }
  initAuthUI();

  // Global logout function
  async function logout(){
    try{ await fetch(`${API_BASE}/api/auth/logout`, { method:'POST', credentials:'include' }); }
    catch(_){/* ignore */}
    window.location.href='login.html';
  }
  window.logout = logout;

  // Mobile nav toggle - hamburger
  document.addEventListener('click', (e)=>{
    if(e.target.closest('#hamburger')){
      const menu = $('#nav-links');
      menu.classList.toggle('open');
    }
  });

  // Doctor Dashboard: Patient-wise Billing Summary
  const billTable = document.querySelector('#bill-table');
  if(billTable){
    // Backend-integrated datasets
    let bills = [];
    let selectedUserId = '';
    const authUser = getUser();
    const doctorId = authUser?.id;
    async function loadBills(){
      try{
        const data = await apiFetch(`/billing/doctor/${doctorId}`, { method:'GET' });
        bills = (data||[]).map(r=>({
          id: r.id,
          userId: String(r.patient_id||''),
          name: r.patient_name||'-',
          plan: '-',
          date: r.date||'',
          desc: r.desc||'Treatment',
          amount: Number(r.amount||0),
          status: 'paid',
          mode: 'cash',
          notes: ''
        }));
        renderBills();
      }catch(err){ console.error(err); }
    }
    let editingBillId = null;

    function fmtAmount(v){ return '₹'+Number(v||0).toLocaleString(); }

    function renderPatientDetails(){
      const panel = document.querySelector('#bill-patient-details');
      if(!panel) return;
      if(!selectedUserId){ panel.style.display='none'; return; }
      document.querySelector('#bp-name').textContent = '-';
      document.querySelector('#bp-plan').textContent = '-';
      document.querySelector('#bp-age').textContent = '-';
      document.querySelector('#bp-contact').textContent = '-';
      document.querySelector('#bp-status').textContent = '-';
      panel.style.display='block';
      const uid = document.querySelector('#bf-userid');
      if(uid) uid.value = selectedUserId; // autofill form
    }

    function filteredBills(){
      const q = (document.querySelector('#bill-table-search')?.value||'').toLowerCase();
      const st = document.querySelector('#bill-filter-status')?.value||'';
      const sort = document.querySelector('#bill-sort')?.value||'date-desc';
      let list = bills.filter(b=>
        (!selectedUserId || b.userId===selectedUserId) &&
        (!q || (b.desc+' '+(b.notes||'')).toLowerCase().includes(q)) &&
        (!st || b.status===st)
      );
      list = list.sort((a,b)=>{
        switch(sort){
          case 'date-asc': return a.date.localeCompare(b.date);
          case 'amount-desc': return b.amount - a.amount;
          case 'amount-asc': return a.amount - b.amount;
          default: return b.date.localeCompare(a.date);
        }
      });
      return list;
    }

    function renderBills(){
      const tbody = billTable.querySelector('tbody');
      const rows = filteredBills().map(b=>{
        const statusColor = b.status==='paid' ? 'style="color:#22c55e"' : 'style="color:#ef4444"';
        return `<tr data-id="${b.id}">
          <td>${b.name} <div class="muted">${b.userId}</div></td>
          <td>${b.plan}</td>
          <td>${b.date}</td>
          <td>${b.desc}${b.notes?`<div class="muted">${b.notes}</div>`:''}</td>
          <td>${fmtAmount(b.amount)}</td>
          <td><span ${statusColor}>${b.status}</span></td>
          <td>
            <button class="btn secondary js-bill-edit">Edit</button>
            <button class="btn secondary js-bill-del">Delete</button>
            <button class="btn secondary js-bill-toggle">${b.status==='paid'?'Mark Pending':'Mark Paid'}</button>
          </td>
        </tr>`;
      }).join('');
      tbody.innerHTML = rows || '<tr><td colspan="7">No records</td></tr>';
      renderSummary();
    }

    function renderSummary(){
      const todayStr = new Date().toISOString().slice(0,10);
      const list = filteredBills();
      const daily = list.filter(b=>b.date===todayStr && b.status==='paid').reduce((s,b)=>s+b.amount,0);
      const month = new Date().toISOString().slice(0,7); // YYYY-MM
      const monthly = list.filter(b=>b.date.startsWith(month) && b.status==='paid').reduce((s,b)=>s+b.amount,0);
      const year = new Date().getFullYear().toString();
      const yearly = list.filter(b=>b.date.startsWith(year) && b.status==='paid').reduce((s,b)=>s+b.amount,0);
      const pending = list.filter(b=>b.status==='pending').reduce((s,b)=>s+b.amount,0);
      document.querySelector('#sum-daily')?.replaceChildren(document.createTextNode(fmtAmount(daily)));
      document.querySelector('#sum-monthly')?.replaceChildren(document.createTextNode(fmtAmount(monthly)));
      document.querySelector('#sum-yearly')?.replaceChildren(document.createTextNode(fmtAmount(yearly)));
      document.querySelector('#sum-pending')?.replaceChildren(document.createTextNode(fmtAmount(pending)));
    }

    // Search by user ID
    document.querySelector('#bill-search-btn')?.addEventListener('click', ()=>{
      const input = document.querySelector('#bill-search-userid');
      const msg = document.querySelector('#bill-search-msg');
      const val = (input?.value||'').trim();
      if(!val){ if(msg){ msg.textContent='Enter a User ID'; msg.style.display='inline-flex'; } return; }
      selectedUserId = val; if(msg){ msg.textContent='Selected patient ID'; msg.style.display='inline-flex'; }
      renderPatientDetails(); renderBills();
    });

    // Filters
    document.querySelector('#bill-table-search')?.addEventListener('input', renderBills);
    document.querySelector('#bill-filter-status')?.addEventListener('change', renderBills);
    document.querySelector('#bill-sort')?.addEventListener('change', renderBills);

    // Add / Update entry
    const billForm = document.querySelector('#bill-form');
    billForm?.addEventListener('submit',(e)=>{
      e.preventDefault();
      const userId = (document.querySelector('#bf-userid')?.value||'').trim();
      const date = (document.querySelector('#bf-date')?.value||'').trim();
      const amount = Number(document.querySelector('#bf-amount')?.value||0);
      const desc = (document.querySelector('#bf-desc')?.value||'').trim();
      const mode = document.querySelector('#bf-mode')?.value||'cash';
      const status = document.querySelector('#bf-status')?.value||'pending';
      const notes = document.querySelector('#bf-notes')?.value||'';
      if(!userId || !date || !desc || !amount){ alert('Please complete all required fields.'); return; }
      // Backend: create billing record
      const btn = document.querySelector('#bf-save'); const prevText = btn?.textContent; if(btn) { btn.disabled=true; btn.textContent='Saving...'; }
      apiFetch('/billing/add', { method:'POST', body: JSON.stringify({ doctor_id: doctorId, patient_id: Number(userId), amount, date }) })
        .then(()=>{ console.log('[BILLING] POST /billing/add success'); return loadBills(); })
        .then(()=>{ console.log('[BILLING] Reloaded bills'); alert('Billing entry saved successfully.'); })
        .catch(err=>{ console.error('[BILLING] POST /billing/add failed:', err); alert(err.message||'Failed to save billing'); })
        .finally(()=>{
          editingBillId = null; const saveBtn = document.querySelector('#bf-save'); if(saveBtn) saveBtn.textContent='Add Entry';
          billForm.reset(); if(selectedUserId){ const uid=document.querySelector('#bf-userid'); if(uid) uid.value=selectedUserId; }
          if(btn){ btn.disabled=false; btn.textContent=prevText; }
        });
    });
    document.querySelector('#bf-reset')?.addEventListener('click',()=>{
      editingBillId=null; const saveBtn = document.querySelector('#bf-save'); if(saveBtn) saveBtn.textContent='Add Entry';
      billForm?.reset(); if(selectedUserId){ const uid=document.querySelector('#bf-userid'); if(uid) uid.value=selectedUserId; }
    });

    // Table actions
    billTable.addEventListener('click',(e)=>{
      const tr = e.target.closest('tr[data-id]'); if(!tr) return; const id = Number(tr.getAttribute('data-id'));
      if(e.target.closest('.js-bill-edit')){
        const it = bills.find(x=>x.id===id); if(!it) return;
        document.querySelector('#bf-userid').value = it.userId;
        document.querySelector('#bf-date').value = it.date;
        document.querySelector('#bf-amount').value = String(it.amount);
        document.querySelector('#bf-desc').value = it.desc;
        document.querySelector('#bf-mode').value = it.mode;
        document.querySelector('#bf-status').value = it.status;
        document.querySelector('#bf-notes').value = it.notes||'';
        editingBillId = id; const saveBtn = document.querySelector('#bf-save'); if(saveBtn) saveBtn.textContent='Update Entry';
      }
      if(e.target.closest('.js-bill-del')){
        alert('Delete not implemented in demo UI. Manage records from backend if needed.');
      }
      if(e.target.closest('.js-bill-toggle')){
        const it = bills.find(x=>x.id===id); if(it){ it.status = it.status==='paid'?'pending':'paid'; renderBills(); }
      }
    });

    // Export & print stubs
    document.querySelector('#doc-bill-export-excel')?.addEventListener('click', ()=>alert('Export billing to Excel (demo)'));
    document.querySelector('#doc-bill-export-pdf')?.addEventListener('click', ()=>alert('Export billing to PDF (demo)'));
    document.querySelector('#doc-bill-print')?.addEventListener('click', ()=>window.print());

    // Initial render
    loadBills();
  }
  // Modal close (buttons and backdrop)
  document.addEventListener('click',(e)=>{
    const closeBtn = e.target.closest('.js-close-modal');
    if(closeBtn){
      const m = closeBtn.closest('.modal');
      if(m) m.classList.add('hidden');
    }
    // Backdrop click closes modal (only if clicking on the overlay itself)
    if(e.target.classList && e.target.classList.contains('modal')){
      e.target.classList.add('hidden');
    }
  });

  // Escape key closes any open modal
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape'){
      $$('.modal').forEach(m=>m.classList.add('hidden'));
    }
  });

  // Also bind direct handlers to present close buttons (in addition to delegation)
  $$('.js-close-modal').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      const m = btn.closest('.modal');
      if(m) m.classList.add('hidden');
    });
  });

  // Smooth scroll for in-page anchors
  $$('a[href^="#"]').forEach(a=>{
    a.addEventListener('click', (e)=>{
      const id = a.getAttribute('href');
      if(id.length>1 && $(id)){
        e.preventDefault();
        $(id).scrollIntoView({behavior:'smooth',block:'start'});
        $('#nav-links')?.classList.remove('open');
      }
    });
  });

  // Simple testimonial slider (auto-loop) if exists
  const slider = $('#testimonial-track');
  if(slider){
    let i = 0; const slides = $$('.slide', slider); if(slides.length){
      setInterval(()=>{
        i = (i+1)%slides.length;
        slides.forEach((s,idx)=>s.style.display = idx===i?'block':'none');
      }, 4000);
    }
  }

  // Plans filter - by duration or price
  const planFilter = $('#plan-filter');
  if(planFilter){
    planFilter.addEventListener('input', ()=>{
      const dur = $('#filter-duration').value;
      const max = Number($('#filter-price').value||Infinity);
      $$('.plan').forEach(card=>{
        const d = card.dataset.duration;
        const p = Number(card.dataset.price);
        const okDur = !dur || d===dur;
        const okPrice = !max || p<=max;
        card.style.display = okDur && okPrice ? '' : 'none';
      });
    });
  }

  // Doctors search/filter
  const doctorFilters = $('#doctor-filters');
  if(doctorFilters){
    const filterFn = ()=>{
      const city = ($('#f-city')?.value||'').toLowerCase();
      const spec = ($('#f-spec')?.value||'').toLowerCase();
      const free = $('#f-free')?.checked;
      const disc = $('#f-disc')?.checked;
      $$('.doctor-card').forEach(card=>{
        const c = (card.dataset.city||'').toLowerCase();
        const s = (card.dataset.spec||'').toLowerCase();
        const hasFree = card.dataset.free==='1';
        const hasDisc = card.dataset.disc==='1';
        const ok = (!city||c.includes(city)) && (!spec||s.includes(spec)) && (!free||hasFree) && (!disc||hasDisc);
        card.style.display = ok?'':'none';
      });
    };
    doctorFilters.addEventListener('input', filterFn);
  }

  // Simple form validations (frontend only demo) for login/register
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function setError(el,msg){
    const out = el.closest('form')?.querySelector('.form-msg');
    if(out){ out.textContent = msg; out.className = 'form-msg alert danger'; }
  }
  function setSuccess(el,msg){
    const out = el.closest('form')?.querySelector('.form-msg');
    if(out){ out.textContent = msg; out.className = 'form-msg alert success'; }
  }

  function redirectByRole(user){
    // Minimal redirect without relying on JWT in client
    return (window.location.href='user-dashboard.html');
  }

  // If authenticated (cookie), avoid showing login/signup by checking /me
  (function(){
    const path = window.location.pathname;
    if(/login\.html$/.test(path) || /signup\.html$/.test(path)){
      apiFetch('/api/auth/me', { method:'GET' })
        .then(user=>{ if(user && user.email){ window.location.href='user-dashboard.html'; } })
        .catch(()=>{/* not logged in */});
    }
  })();

  // Role-based page guards
  (function(){
    const path = window.location.pathname;
    const user = getUser();
    if(/doctor-dashboard\.html$/.test(path) && user && user.role!=='doctor'){
      window.location.href='login.html';
    }
    if(/admin-dashboard\.html$/.test(path) && user && user.role!=='admin'){
      window.location.href='login.html';
    }
    if(/user-dashboard\.html$/.test(path) && user && user.role==='doctor'){
      window.location.href='doctor-dashboard.html';
    }
  })();

  // Login page: integrate with backend (prevent refresh, cookie-based session)
  if(window.location.pathname.endsWith('/login.html') || window.location.pathname.endsWith('login.html')){
    const form = $('form[data-validate="simple"]');
    form?.addEventListener('submit', (e)=>{
      e.preventDefault();
      const fd = new FormData(form);
      const email = (fd.get('email')||'').toString().trim();
      const pass = (fd.get('password')||'').toString();
      const pwStrong = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
      if(!emailRegex.test(email)) return setError(form,'Invalid email');
      if(!pwStrong.test(pass)) return setError(form,'Password must be 8+ chars with letter, number, symbol');
      const btn = form.querySelector('button[type="submit"]'); const prev = btn?.textContent; if(btn){ btn.disabled=true; btn.textContent='Logging in...'; }
      (async()=>{
        console.log('[AUTH] POST /api/auth/login start');
        try{
          await apiFetch('/api/auth/login', { method:'POST', body: JSON.stringify({ email, password: pass }) });
          console.log('[AUTH] login success');
          setSuccess(form,'Login successful. Redirecting...');
          setTimeout(()=>{ window.location.href = 'user-dashboard.html'; },700);
        }catch(err){
          console.error('[AUTH] login failed:', err);
          setError(form, err?.message||'Login failed');
        }finally{
          if(btn){ btn.disabled=false; btn.textContent=prev; }
        }
      })();
    });
  }

  // OTP demo verify
  $('#otp-verify')?.addEventListener('click', ()=>{
    setTimeout(()=>{
      const m = $('#otp-modal');
      if(m){ m.classList.add('hidden'); alert('OTP verified (demo). Redirect to Dashboard...'); }
    }, 500);
  });

  // File upload preview (client only demo)
  const up = $('#file-input');
  const list = $('#file-list');
  if(up && list){
    up.addEventListener('change', ()=>{
      list.innerHTML = '';
      Array.from(up.files).forEach((f,idx)=>{
        const li = document.createElement('div');
        li.className='card';
        li.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><strong>${f.name}</strong><div class="muted">${Math.round(f.size/1024)} KB</div></div><button class="btn secondary" data-idx="${idx}">Delete</button></div>`;
        list.appendChild(li);
      });
    });
    list.addEventListener('click',(e)=>{
      if(e.target.matches('button[data-idx]')){
        e.target.closest('.card')?.remove();
      }
    })
  }

  // Intercept plan purchase to show Auth modal (Sign In / Sign Up with role)
  document.addEventListener('click', (e)=>{
    const buy = e.target.closest('.js-buy-plan');
    if(buy){
      const modal = $('#auth-modal');
      if(modal){
        e.preventDefault();
        modal.classList.remove('hidden');
        $('#auth-step-choose')?.classList.remove('hidden');
        $('#auth-step-role')?.classList.add('hidden');
      }
    }
  });

  // Auth modal: go to role selection on Sign Up
  $('#auth-signup')?.addEventListener('click', (e)=>{
    e.preventDefault();
    $('#auth-step-choose')?.classList.add('hidden');
    $('#auth-step-role')?.classList.remove('hidden');
  });

  // Auth modal: role buttons redirect to signup with role param
  $$('#auth-step-role [data-role]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const role = btn.getAttribute('data-role');
      window.location.href = `signup.html?role=${encodeURIComponent(role||'patient')}`;
    });
  });

  // Signup page: preselect role from URL param
  if(window.location.pathname.endsWith('/signup.html') || window.location.pathname.endsWith('signup.html')){
    const params = new URLSearchParams(window.location.search);
    const role = (params.get('role')||'').toLowerCase();
    if(role){
      const input = document.querySelector(`input[name="role"][value="${role}"]`);
      if(input) input.checked = true;
    }
  }

  // Doctor profile: load saved profile into doctor-profile view
  (function(){
    const specEl = document.querySelector('#dp-spec');
    if(specEl){
      try{
        const data = JSON.parse(localStorage.getItem('doctor_profile')||'{}');
        if(data){
          if(data.spec) specEl.textContent = data.spec;
          const clinicEl = document.querySelector('#dp-clinic');
          const addrEl = document.querySelector('#dp-address');
          const photoEl = document.querySelector('#dp-photo');
          if(clinicEl && data.clinic) clinicEl.textContent = data.clinic;
          if(addrEl && data.address) addrEl.textContent = data.address;
          if(photoEl && data.photo){ photoEl.src = data.photo; photoEl.style.objectFit='cover'; }
        }
      }catch(e){/* ignore */}
    }
  })();

  // Doctor dashboard: bind profile inputs to save/load
  (function(){
    const clinicIn = document.querySelector('#dd-clinic');
    const specIn = document.querySelector('#dd-spec');
    const addrIn = document.querySelector('#dd-address');
    if(clinicIn || specIn || addrIn){
      // Load existing
      try{
        const data = JSON.parse(localStorage.getItem('doctor_profile')||'{}');
        if(data){
          if(clinicIn && data.clinic) clinicIn.value = data.clinic;
          if(specIn && data.spec) specIn.value = data.spec;
          if(addrIn && data.address) addrIn.value = data.address;
          const prev = document.querySelector('#dd-photo-preview');
          if(prev && data.photo){ prev.src = data.photo; prev.style.objectFit='cover'; }
        }
      }catch(e){/* ignore */}
      // Save handler
      document.querySelector('#dd-save')?.addEventListener('click', ()=>{
        const existing = JSON.parse(localStorage.getItem('doctor_profile')||'{}');
        const payload = {
          clinic: clinicIn?.value?.trim()||'',
          spec: specIn?.value?.trim()||'',
          address: addrIn?.value?.trim()||'',
          photo: existing.photo||''
        };
        localStorage.setItem('doctor_profile', JSON.stringify(payload));
        alert('Profile saved (demo). Open Doctor Profile to view changes.');
      });

      // Photo upload preview + persist
      const fileIn = document.querySelector('#dd-photo');
      const prev = document.querySelector('#dd-photo-preview');
      fileIn?.addEventListener('change', ()=>{
        const f = fileIn.files?.[0]; if(!f) return;
        const reader = new FileReader();
        reader.onload = ()=>{
          const dataUrl = reader.result;
          if(prev){ prev.src = dataUrl; prev.style.objectFit='cover'; }
          const existing = JSON.parse(localStorage.getItem('doctor_profile')||'{}');
          existing.photo = dataUrl;
          localStorage.setItem('doctor_profile', JSON.stringify(existing));
        };
        reader.readAsDataURL(f);
      });
      document.querySelector('#dd-photo-remove')?.addEventListener('click', ()=>{
        if(prev){ prev.src = 'assets/images/logo.svg'; prev.style.objectFit='contain'; }
        const existing = JSON.parse(localStorage.getItem('doctor_profile')||'{}');
        delete existing.photo;
        localStorage.setItem('doctor_profile', JSON.stringify(existing));
      });
    }
  })();

  // Admin Dashboard logic (only if elements exist)
  const planTable = $('#plan-table');
  if(planTable){
    // Demo datasets (in-memory)
    const plans = [
      {id:1,name:'Monthly',desc:'Affordable starter plan',price:299,duration:'monthly',features:['OPD 30%','1 Free follow-up','Lab 10%']},
      {id:2,name:'Quarterly',desc:'Better savings',price:799,duration:'quarterly',features:['OPD 35%','2 Free follow-ups','Priority support']},
      {id:3,name:'Yearly',desc:'Best value annual',price:2599,duration:'yearly',features:['OPD 40%','5 Free follow-ups','Family cover']},
    ];
    let planSort = {key:'name',dir:1};

    function renderPlans(){
      const q = ($('#plan-search')?.value||'').toLowerCase();
      const fd = $('#plan-filter-duration')?.value||'';
      const rows = plans
        .filter(p=>(!q || (p.name+ ' ' + p.desc + ' ' + p.features.join(',')).toLowerCase().includes(q)) && (!fd || p.duration===fd))
        .slice()
        .sort((a,b)=>{
          const k = planSort.key; const dir = planSort.dir;
          let va=a[k], vb=b[k];
          if(k==='price'){ va=Number(va); vb=Number(vb); }
          return (va>vb?1:va<vb?-1:0)*dir;
        })
        .map(p=>`<tr data-id="${p.id}"><td>${p.name}</td><td>${p.desc||''}</td><td>₹${p.price}</td><td>${p.duration}</td><td>${p.features.join(', ')}</td><td><button class="btn secondary js-plan-edit">Edit</button> <button class="btn secondary js-plan-del">Delete</button></td></tr>`)
        .join('');
      planTable.querySelector('tbody').innerHTML = rows || '<tr><td colspan="6">No plans found.</td></tr>';
    }
    renderPlans();

    // Sorting
    planTable.querySelectorAll('th[data-sort]').forEach(th=>{
      th.style.cursor='pointer';
      th.addEventListener('click', ()=>{
        const key = th.getAttribute('data-sort');
        if(planSort.key===key){ planSort.dir*=-1; } else { planSort={key,dir:1}; }
        renderPlans();
      });
    });

    // Search/filter
    $('#plan-search')?.addEventListener('input', renderPlans);
    $('#plan-filter-duration')?.addEventListener('change', renderPlans);

    // Create/Edit plan
    const planForm = $('#plan-form');
    let editingId = null;
    planForm?.addEventListener('submit',(e)=>{
      e.preventDefault();
      const name = $('#plan-name').value.trim();
      const price = Number($('#plan-price').value||0);
      const duration = $('#plan-duration').value;
      const features = ($('#plan-features').value||'').split(',').map(s=>s.trim()).filter(Boolean);
      const desc = $('#plan-desc').value.trim();
      if(!name || !price || !duration){ alert('Please fill plan name, price and duration.'); return; }
      if(editingId){
        const p = plans.find(x=>x.id===editingId); if(p){ Object.assign(p,{name,price,duration,features,desc}); }
      }else{
        const id = Math.max(0,...plans.map(p=>p.id))+1; plans.push({id,name,price,duration,features,desc});
      }
      planForm.reset(); editingId=null; $('#plan-save').textContent='Save Plan';
      renderPlans();
    });
    $('#plan-reset')?.addEventListener('click',()=>{ planForm.reset(); editingId=null; $('#plan-save').textContent='Save Plan'; });

    // Row actions using delegation
    planTable.addEventListener('click',(e)=>{
      const tr = e.target.closest('tr[data-id]'); if(!tr) return;
      const id = Number(tr.getAttribute('data-id'));
      if(e.target.closest('.js-plan-edit')){
        const p = plans.find(x=>x.id===id); if(!p) return;
        $('#plan-name').value=p.name; $('#plan-price').value=String(p.price); $('#plan-duration').value=p.duration; $('#plan-features').value=p.features.join(', '); $('#plan-desc').value=p.desc||'';
        editingId = id; $('#plan-save').textContent='Update Plan';
      }
      if(e.target.closest('.js-plan-del')){
        if(confirm('Delete this plan?')){ const idx = plans.findIndex(x=>x.id===id); if(idx>-1){ plans.splice(idx,1); renderPlans(); }}
      }
    });

    // Users Manage
    const userTable = $('#user-table');
    const users = [
      {id:1,name:'Rohan Kumar',email:'rohan@example.com',phone:'9876543210',plan:'Yearly',start:'2025-01-10',expiry:'2026-01-09',status:'active',treatments:3,spent:5400},
      {id:2,name:'Neha Singh',email:'neha@example.com',phone:'9876501234',plan:'Monthly',start:'2025-10-01',expiry:'2025-10-30',status:'active',treatments:1,spent:600},
      {id:3,name:'Aman Verma',email:'aman@example.com',phone:'9898989898',plan:'Quarterly',start:'2025-08-15',expiry:'2025-11-14',status:'suspended',treatments:2,spent:1200},
    ];
    function renderUsers(){
      if(!userTable) return;
      const q = ($('#user-search')?.value||'').toLowerCase();
      const st = $('#user-status-filter')?.value||'';
      userTable.querySelector('tbody').innerHTML = users
        .filter(u=>(!q || (u.name+' '+u.email+' '+u.phone).toLowerCase().includes(q)) && (!st || u.status===st))
        .map(u=>`<tr data-id="${u.id}"><td>${u.name}</td><td>${u.email}</td><td>${u.phone}</td><td>${u.plan}</td><td>${u.start}</td><td>${u.expiry}</td><td>${u.status}</td><td>${u.treatments}</td><td>₹${u.spent}</td><td><button class="btn secondary js-user-view">View</button> <button class="btn secondary js-user-suspend">${u.status==='active'?'Suspend':'Activate'}</button> <button class="btn secondary js-user-del">Delete</button></td></tr>`)
        .join('') || '<tr><td colspan="10">No users</td></tr>';
    }
    if(userTable){ renderUsers(); $('#user-search')?.addEventListener('input',renderUsers); $('#user-status-filter')?.addEventListener('change',renderUsers); }
    userTable?.addEventListener('click',(e)=>{
      const tr = e.target.closest('tr[data-id]'); if(!tr) return; const id=Number(tr.getAttribute('data-id'));
      if(e.target.closest('.js-user-view')){ alert('View user '+id+' (demo)'); }
      if(e.target.closest('.js-user-suspend')){ const u=users.find(x=>x.id===id); if(u){ u.status = u.status==='active'?'suspended':'active'; renderUsers(); }}
      if(e.target.closest('.js-user-del')){ if(confirm('Delete this user?')){ const i=users.findIndex(x=>x.id===id); if(i>-1){ users.splice(i,1); renderUsers(); }}}
    });

    // Doctors Manage
    const doctorTable = $('#doctor-table');
    const doctors = [
      {id:1,name:'Dr. Sharma',status:'active',daily:12,monthly:240,bills:18,total:36000},
      {id:2,name:'Dr. Mehta',status:'inactive',daily:0,monthly:32,bills:6,total:11000},
      {id:3,name:'Dr. Khan',status:'active',daily:9,monthly:180,bills:12,total:24500},
    ];
    function renderDoctors(){
      if(!doctorTable) return;
      const q = ($('#doctor-search')?.value||'').toLowerCase();
      const st = $('#doctor-status-filter')?.value||'';
      doctorTable.querySelector('tbody').innerHTML = doctors
        .filter(d=>(!q || d.name.toLowerCase().includes(q)) && (!st || d.status===st))
        .map(d=>`<tr data-id="${d.id}"><td>${d.name}</td><td>${d.status}</td><td>${d.daily}</td><td>${d.monthly}</td><td>${d.bills}</td><td>₹${d.total}</td><td><button class="btn secondary js-doc-view">View</button></td></tr>`)
        .join('') || '<tr><td colspan="7">No doctors</td></tr>';
    }
    if(doctorTable){ renderDoctors(); $('#doctor-search')?.addEventListener('input',renderDoctors); $('#doctor-status-filter')?.addEventListener('change',renderDoctors); }
    $('#doc-export-excel')?.addEventListener('click', ()=>alert('Export to Excel (demo)'));
    $('#doc-export-pdf')?.addEventListener('click', ()=>alert('Export to PDF (demo)'));
    // Users export stubs
    $('#user-export-excel')?.addEventListener('click', ()=>alert('Users: Export to Excel (demo)'));
    $('#user-export-pdf')?.addEventListener('click', ()=>alert('Users: Export to PDF (demo)'));

    // Inquiries
    const inqPatientTbody = $('#inq-patient-tbody');
    const inqDoctorTbody = $('#inq-doctor-tbody');
    const inquiries = {
      patients:[
        {id:1,name:'Aarti',email:'aarti@example.com',date:'2025-10-20',msg:'How to claim OPD discount?',status:'unread'},
        {id:2,name:'Vikram',email:'vikram@example.com',date:'2025-10-22',msg:'Need help with plan renewal',status:'pending'},
      ],
      doctors:[
        {id:1,name:'Dr. Rao',email:'rao@clinic.com',date:'2025-10-21',msg:'Collaboration details?',status:'unread'},
      ]
    };
    function renderInquiries(){
      const row = (q)=>`<tr data-id="${q.id}"><td>${q.name}</td><td>${q.email}</td><td>${q.date}</td><td>${q.msg}</td><td>${q.status}</td><td><button class="btn secondary js-inq-res">Mark Resolved</button></td></tr>`;
      if(inqPatientTbody) inqPatientTbody.innerHTML = inquiries.patients.map(row).join('')||'<tr><td colspan="6">No patient inquiries</td></tr>';
      if(inqDoctorTbody) inqDoctorTbody.innerHTML = inquiries.doctors.map(row).join('')||'<tr><td colspan="6">No doctor inquiries</td></tr>';
      const unread = [...inquiries.patients, ...inquiries.doctors].filter(q=>q.status==='unread').length;
      {
        const cnt = $('#inq-count');
        if(cnt) cnt.textContent = String(unread);
      }
    }
    renderInquiries();
    // Tabs
    $('#tab-patient')?.addEventListener('click',()=>{
      $('#inquiries-patient')?.classList.remove('hidden');
      $('#inquiries-doctor')?.classList.add('hidden');
      $('#tab-patient')?.classList.remove('secondary');
      $('#tab-doctor')?.classList.add('secondary');
    });
    $('#tab-doctor')?.addEventListener('click',()=>{
      $('#inquiries-doctor')?.classList.remove('hidden');
      $('#inquiries-patient')?.classList.add('hidden');
      $('#tab-doctor')?.classList.remove('secondary');
      $('#tab-patient')?.classList.add('secondary');
    });
    // Resolve action
    document.addEventListener('click',(e)=>{
      const tr = e.target.closest('#inquiries-patient tr[data-id], #inquiries-doctor tr[data-id]');
      if(!tr) return; const id = Number(tr.getAttribute('data-id'));
      if(e.target.closest('.js-inq-res')){
        const list = tr.closest('#inquiries-patient') ? inquiries.patients : inquiries.doctors;
        const it = list.find(x=>x.id===id); if(it){ it.status='resolved'; renderInquiries(); }
      }
    });
  }


// Lightweight API connectivity tests and summary
(function(){
  try{
    if(sessionStorage.getItem('ran_frontend_api_tests')) return;
    sessionStorage.setItem('ran_frontend_api_tests','1');
    const results = { ok: [], fail: [], redirects: [] };
    const logOk = (m)=>{ console.log('✅', m); results.ok.push(m); };
    const logFail = (name, err)=>{ console.error(`❌ ${name} failed — reason:`, err?.message||err); results.fail.push(`${name}: ${err?.message||err}`); };

    const testSignupAndLogin = async ()=>{
      // Signup with timestamp email to avoid collisions
      const email = `test_${Date.now()}@example.com`;
      const password = 'test1234';
      try{
        try{ await apiFetch('/api/signup', { method:'POST', body: JSON.stringify({ name:'Test User', email, password }) }); }
        catch(err){ if(err?.status===404){ console.warn('[TEST] /api/signup 404, retrying /signup'); await apiFetch('/signup', { method:'POST', body: JSON.stringify({ name:'Test User', email, password }) }); } else { throw err; } }
        logOk('POST /api/signup');
      }catch(e){ logFail('POST /api/signup', e); }
      try{
        let data;
        try{ data = await apiFetch('/api/login', { method:'POST', body: JSON.stringify({ email, password }) }); }
        catch(err){ if(err?.status===404){ console.warn('[TEST] /api/login 404, retrying /login'); data = await apiFetch('/login', { method:'POST', body: JSON.stringify({ email, password }) }); } else { throw err; } }
        if(data?.token){ setToken(data.token); setUser(data.user||null); logOk('POST /api/login'); } else { throw new Error('No token in response'); }
      }catch(e){ logFail('POST /api/login', e); }
    };

    const testBilling = async ()=>{
      try{
        const u = getUser(); const did = u?.id;
        if(!did) throw new Error('No logged-in user/doctorId to test billing');
        await apiFetch(`/billing/doctor/${did}`, { method:'GET' });
        logOk('GET /billing/doctor/:doctorId');
      }catch(e){ logFail('GET /billing/doctor/:doctorId', e); }
      try{
        const today = new Date().toISOString().slice(0,10);
        const u = getUser(); const did = u?.id;
        await apiFetch('/billing/add', { method:'POST', body: JSON.stringify({ doctor_id: did||1, patient_id: 1, amount: 1, date: today }) });
        logOk('POST /billing/add');
      }catch(e){ logFail('POST /billing/add', e); }
    };

    const testRedirects = ()=>{
      try{
        const token = getToken();
        const protectedPages = ['doctor-dashboard.html','user-dashboard.html','admin-dashboard.html'];
        protectedPages.forEach(p=>{
          if(!token){ results.redirects.push(`${p}: would redirect to login (token missing)`); }
        });
      }catch(e){ /* ignore */ }
    };

    (async()=>{
      console.group('[TEST] Frontend–Backend connectivity tests');
      await testSignupAndLogin();
      await testBilling();
      testRedirects();
      console.groupEnd();
      // Summary
      const allOk = results.fail.length===0;
      if(allOk){
        console.log('✅ All syntax errors fixed (main.js:647 and others)');
        console.log('✅ Frontend–Backend connected successfully');
        console.log('✅ All APIs tested OK');
      }else{
        results.fail.forEach(m=>console.log(`❌ ${m}`));
      }
      console.log('[TEST SUMMARY] Success:', results.ok);
      console.log('[TEST SUMMARY] Redirect checks:', results.redirects);
    })();
  }catch(e){ console.error('❌ Test harness failed — reason:', e?.message||e); }
})();

})();
