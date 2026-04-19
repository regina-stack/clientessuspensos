// ============================================================
// PAINEL DIGITAL+ CONTABILIDADE
// Lógica principal da aplicação com Supabase
// ============================================================

(function() {
  'use strict';

  // ---------- VALIDAÇÃO DE CONFIG ----------
  if (!window.SUPABASE_CONFIG ||
      window.SUPABASE_CONFIG.url === 'COLE_AQUI_A_URL_DO_SUPABASE' ||
      window.SUPABASE_CONFIG.anonKey === 'COLE_AQUI_A_CHAVE_ANON_PUBLIC') {
    alert('⚠️ Configuração do Supabase ausente!\n\nAbra o arquivo config.js e cole a URL e a chave do seu projeto Supabase.');
    return;
  }

  const { createClient } = window.supabase;
  const db = createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);

  // ---------- ESTADO GLOBAL ----------
  const KEY_SESSION = 'dm:session';
  const KEY_THEME = 'dm:theme';

  let currentUser = null;
  let currentTab = 'atual';
  let editingClientId = null;
  let editingBloqueioId = null;
  let sortField = 'nome';
  let sortDir = 'asc';
  let importBuffer = [];
  let detailFilter = '';
  let deleteTargetId = null;
  let deleteTargetName = '';

  // Cache em memória (recarregado após mutações)
  let cache = { clientes: [], bloqueios: [], log: [] };

  window.currentDetailId = null;

  // ---------- UTILS ----------
  function fmtDate(s) {
    if (!s) return '—';
    const [y,m,d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR');
  }
  function escapeHTML(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function today() {
    return new Date().toISOString().slice(0,10);
  }
  function daysBetween(d1, d2) {
    if (!d1) return 0;
    const a = new Date(d1 + 'T00:00:00');
    const b = d2 ? new Date(d2 + 'T00:00:00') : new Date();
    return Math.floor((b - a) / (1000*60*60*24));
  }
  function diasText(n) {
    if (n === 0) return 'hoje';
    if (n === 1) return '1 dia';
    return `${n} dias`;
  }

  // Hash SHA-256 para senhas
  async function hashSenha(senha) {
    const encoder = new TextEncoder();
    const data = encoder.encode(senha);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function showLoading(show) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
  }

  function hideErrors() {
    ['login-error','reg-error','rec-error','cli-error','blq-error','delete-error','import-error'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
  }
  function showError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.style.display = 'block';
  }

  // ---------- VALIDAÇÃO DE CNPJ ----------
  window.formatCNPJ = function(input) {
    let v = input.value.replace(/\D/g, '').slice(0, 14);
    if (v.length > 12) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d+)$/, '$1.$2.$3/$4-$5');
    else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d+)$/, '$1.$2.$3/$4');
    else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d+)$/, '$1.$2.$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d+)$/, '$1.$2');
    input.value = v;
  };

  function validaCNPJ(cnpj) {
    const c = cnpj.replace(/\D/g, '');
    if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    let t = c.length - 2, d = c.substring(0, t), dv = c.substring(t), s = 0, p = t - 7;
    for (let i = t; i >= 1; i--) { s += d.charAt(t - i) * p--; if (p < 2) p = 9; }
    let r = s % 11 < 2 ? 0 : 11 - s % 11;
    if (r != dv.charAt(0)) return false;
    t += 1; d = c.substring(0, t); s = 0; p = t - 7;
    for (let i = t; i >= 1; i--) { s += d.charAt(t - i) * p--; if (p < 2) p = 9; }
    r = s % 11 < 2 ? 0 : 11 - s % 11;
    return r == dv.charAt(1);
  }

  // ---------- SESSÃO ----------
  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(KEY_SESSION) || 'null'); }
    catch { return null; }
  }
  function setSession(u) {
    if (u) sessionStorage.setItem(KEY_SESSION, JSON.stringify(u));
    else sessionStorage.removeItem(KEY_SESSION);
  }

  // ---------- LOG DE AUDITORIA ----------
  async function logAction(acao, detalhes) {
    if (!currentUser) return;
    try {
      await db.from('log_auditoria').insert({
        acao, detalhes,
        usuario_nome: currentUser.nome,
        usuario_email: currentUser.email
      });
    } catch(e) { console.error('Erro ao registrar log:', e); }
  }

  // ---------- TEMA ----------
  window.toggleTheme = function() {
    const root = document.getElementById('dm-root');
    const isDark = root.classList.contains('dark');
    root.classList.remove(isDark ? 'dark' : 'light');
    root.classList.add(isDark ? 'light' : 'dark');
    try { localStorage.setItem(KEY_THEME, isDark ? 'light' : 'dark'); } catch {}
  };

  (function initTheme() {
    try {
      const saved = localStorage.getItem(KEY_THEME);
      if (saved === 'light') {
        document.getElementById('dm-root').classList.remove('dark');
        document.getElementById('dm-root').classList.add('light');
      }
    } catch {}
  })();

  // ---------- AUTENTICAÇÃO ----------
  window.openLoginModal = async function() {
    document.getElementById('login-modal').style.display = 'flex';
    const { data: users, error } = await db.from('usuarios').select('id').limit(1);
    const isFirstUser = !error && (!users || users.length === 0);
    if (isFirstUser) {
      showRegisterForm();
      document.getElementById('first-user-hint').style.display = 'block';
      document.getElementById('link-criar-conta').style.display = 'inline';
    } else {
      showLoginForm();
      document.getElementById('first-user-hint').style.display = 'none';
      document.getElementById('link-criar-conta').style.display = 'none';
    }
  };

  window.closeLoginModal = function() {
    document.getElementById('login-modal').style.display = 'none';
    ['login-email','login-senha','reg-nome','reg-email','reg-senha','reg-pergunta','reg-resposta','rec-email','rec-resposta','rec-nova-senha'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    hideErrors();
  };

  window.showLoginForm = function() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('recover-form').style.display = 'none';
    document.getElementById('login-title').textContent = 'Acesso de funcionário';
    document.getElementById('login-subtitle').textContent = 'Entre com suas credenciais';
  };

  window.showRegisterForm = function() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('recover-form').style.display = 'none';
    document.getElementById('login-title').textContent = 'Criar conta';
    document.getElementById('login-subtitle').textContent = 'Cadastre-se como funcionário';
  };

  window.showRecoverForm = function() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('recover-form').style.display = 'block';
    document.getElementById('rec-question-box').style.display = 'none';
    document.getElementById('login-title').textContent = 'Recuperar senha';
    document.getElementById('login-subtitle').textContent = 'Responda à pergunta de segurança';
  };

  window.doLogin = async function() {
    hideErrors();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const senha = document.getElementById('login-senha').value;
    if (!email || !senha) return showError('login-error', 'Preencha e-mail e senha.');
    showLoading(true);
    try {
      const senhaHash = await hashSenha(senha);
      const { data: users, error } = await db.from('usuarios').select('*').eq('email', email).eq('senha_hash', senhaHash);
      if (error) throw error;
      if (!users || users.length === 0) return showError('login-error', 'E-mail ou senha incorretos.');
      currentUser = {
        id: users[0].id,
        nome: users[0].nome,
        email: users[0].email,
        role: users[0].role
      };
      setSession(currentUser);
      await logAction('LOGIN', 'Entrou no sistema');
      closeLoginModal();
      updateAuthUI();
      await loadAllData();
      render();
    } catch(e) {
      showError('login-error', 'Erro: ' + (e.message || 'Falha ao entrar'));
    } finally { showLoading(false); }
  };

  window.doRegister = async function() {
    hideErrors();
    const nome = document.getElementById('reg-nome').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const senha = document.getElementById('reg-senha').value;
    const pergunta = document.getElementById('reg-pergunta').value.trim();
    const resposta = document.getElementById('reg-resposta').value.trim().toLowerCase();
    if (!nome || !email || !senha || !pergunta || !resposta) return showError('reg-error', 'Preencha todos os campos.');
    if (senha.length < 6) return showError('reg-error', 'Senha deve ter no mínimo 6 caracteres.');
    showLoading(true);
    try {
      // Bloqueio de segurança: cadastro público só permitido se NÃO houver usuários ainda
      const { data: allUsers } = await db.from('usuarios').select('id').limit(1);
      if (allUsers && allUsers.length > 0) {
        showLoading(false);
        return showError('reg-error', 'Cadastro público bloqueado. Solicite ao administrador que crie sua conta.');
      }
      const { data: existing } = await db.from('usuarios').select('id').eq('email', email);
      if (existing && existing.length > 0) return showError('reg-error', 'E-mail já cadastrado.');
      const senhaHash = await hashSenha(senha);
      const respostaHash = await hashSenha(resposta);
      const { data, error } = await db.from('usuarios').insert({
        nome, email, senha_hash: senhaHash,
        pergunta_seguranca: pergunta, resposta_hash: respostaHash, role: 'admin'
      }).select();
      if (error) throw error;
      currentUser = { id: data[0].id, nome, email, role: 'admin' };
      setSession(currentUser);
      await logAction('CADASTRO_USUARIO', `Administrador inicial: ${nome}`);
      closeLoginModal();
      updateAuthUI();
      await loadAllData();
      render();
    } catch(e) {
      showError('reg-error', 'Erro: ' + (e.message || 'Falha ao cadastrar'));
    } finally { showLoading(false); }
  };

  window.loadQuestion = async function() {
    const email = document.getElementById('rec-email').value.trim().toLowerCase();
    if (!email) { document.getElementById('rec-question-box').style.display = 'none'; return; }
    try {
      const { data } = await db.from('usuarios').select('pergunta_seguranca').eq('email', email);
      if (data && data.length > 0) {
        document.getElementById('rec-question').textContent = 'Pergunta: ' + data[0].pergunta_seguranca;
        document.getElementById('rec-question-box').style.display = 'block';
      } else {
        document.getElementById('rec-question-box').style.display = 'none';
      }
    } catch(e) { console.error(e); }
  };

  window.doRecover = async function() {
    hideErrors();
    const email = document.getElementById('rec-email').value.trim().toLowerCase();
    const resposta = document.getElementById('rec-resposta').value.trim().toLowerCase();
    const nova = document.getElementById('rec-nova-senha').value;
    if (!email || !resposta || !nova) return showError('rec-error', 'Preencha todos os campos.');
    if (nova.length < 6) return showError('rec-error', 'Nova senha deve ter no mínimo 6 caracteres.');
    showLoading(true);
    try {
      const respostaHash = await hashSenha(resposta);
      const { data: users } = await db.from('usuarios').select('*').eq('email', email);
      if (!users || users.length === 0) return showError('rec-error', 'E-mail não encontrado.');
      if (users[0].resposta_hash !== respostaHash) return showError('rec-error', 'Resposta incorreta.');
      const novaHash = await hashSenha(nova);
      const { error } = await db.from('usuarios').update({ senha_hash: novaHash }).eq('id', users[0].id);
      if (error) throw error;
      const errEl = document.getElementById('rec-error');
      errEl.textContent = 'Senha redefinida com sucesso. Faça login.';
      errEl.style.display = 'block';
      errEl.style.background = 'rgba(124, 220, 140, 0.15)';
      errEl.style.color = '#2d8a52';
      setTimeout(() => {
        errEl.style.background = 'rgba(239, 83, 80, 0.12)';
        errEl.style.color = '#d34745';
        showLoginForm();
      }, 1500);
    } catch(e) {
      showError('rec-error', 'Erro: ' + e.message);
    } finally { showLoading(false); }
  };

  window.doLogout = async function() {
    if (currentUser) await logAction('LOGOUT', 'Saiu do sistema');
    currentUser = null;
    setSession(null);
    updateAuthUI();
    render();
  };

  function updateAuthUI() {
    const btns = document.getElementById('auth-buttons');
    const info = document.getElementById('user-info');
    const btnNovo = document.getElementById('btn-novo-cliente');
    const btnImport = document.getElementById('btn-import');
    const tabLog = document.getElementById('tab-log');
    const thA = document.getElementById('th-acoes-atual');
    const btnExcluir = document.getElementById('btn-excluir-cliente');

    const themeBtn = `<button class="icon-btn" onclick="toggleTheme()" title="Alternar tema"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></button>`;

    if (currentUser) {
      const isAdmin = currentUser.role === 'admin';
      const badge = isAdmin ? '<span class="badge-admin">Admin</span>' : '';
      btns.innerHTML = themeBtn + `<span style="font-size:13px;display:inline-flex;gap:6px;align-items:center;" class="muted">${escapeHTML(currentUser.nome)} ${badge}</span><button onclick="doLogout()">Sair</button>`;
      info.textContent = 'Logado · ' + currentUser.email + (isAdmin ? ' · Administrador' : ' · Funcionário');
      btnNovo.style.display = 'inline-flex';
      btnImport.style.display = isAdmin ? 'inline-flex' : 'none';
      tabLog.style.display = isAdmin ? 'inline-flex' : 'none';
      const tabUsuarios = document.getElementById('tab-usuarios');
      if (tabUsuarios) tabUsuarios.style.display = isAdmin ? 'inline-flex' : 'none';
      if (btnExcluir) btnExcluir.style.display = isAdmin ? 'inline-flex' : 'none';
      thA.textContent = 'Ações';
    } else {
      btns.innerHTML = themeBtn + '<button onclick="openLoginModal()">Entrar</button>';
      info.textContent = 'Acesso público — visualização';
      btnNovo.style.display = 'none';
      btnImport.style.display = 'none';
      tabLog.style.display = 'none';
      const tabUsuarios = document.getElementById('tab-usuarios');
      if (tabUsuarios) tabUsuarios.style.display = 'none';
      thA.textContent = '';
      if (currentTab === 'log' || currentTab === 'usuarios') switchTab('atual');
    }
  }

  // ---------- CARREGAMENTO DE DADOS ----------
  async function loadAllData() {
    try {
      const [cli, blq, log] = await Promise.all([
        db.from('clientes').select('*').order('nome'),
        db.from('bloqueios').select('*').order('data_bloqueio', { ascending: false }),
        currentUser && currentUser.role === 'admin'
          ? db.from('log_auditoria').select('*').order('created_at', { ascending: false }).limit(200)
          : Promise.resolve({ data: [] })
      ]);
      cache.clientes = cli.data || [];
      cache.bloqueios = blq.data || [];
      cache.log = log.data || [];
    } catch(e) {
      console.error('Erro ao carregar dados:', e);
      alert('Erro ao carregar dados: ' + e.message);
    }
  }

  // ---------- ABAS ----------
  window.switchTab = function(tab) {
    currentTab = tab;
    ['atual','historico','log','usuarios'].forEach(t => {
      const btn = document.getElementById('tab-'+t);
      const view = document.getElementById('view-'+t);
      if (btn) btn.classList.toggle('active', tab === t);
      if (view) view.style.display = tab === t ? 'block' : 'none';
    });
    render();
  };

  // ---------- ORDENAÇÃO ----------
  window.sortBy = function(field) {
    if (sortField === field) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortField = field; sortDir = 'asc'; }
    render();
  };

  function updateSortIndicators() {
    ['nome','dias','total','ultimo'].forEach(f => {
      const el = document.getElementById('sort-' + f);
      if (el) el.textContent = sortField === f ? (sortDir === 'asc' ? '↑' : '↓') : '';
    });
  }

  window.clearFilters = function() {
    document.getElementById('filter-input').value = '';
    document.getElementById('filter-status').value = 'todos';
    document.getElementById('filter-de').value = '';
    document.getElementById('filter-ate').value = '';
    render();
  };

  // ---------- CLIENTES ----------
  window.openClientModal = function(id) {
    if (!currentUser) return;
    editingClientId = id || null;
    document.getElementById('client-modal-title').textContent = id ? 'Editar cliente' : 'Novo cliente';
    if (id) {
      const c = cache.clientes.find(x => x.id === id);
      if (c) {
        document.getElementById('cli-nome').value = c.nome;
        document.getElementById('cli-cnpj').value = c.cnpj;
      }
    } else {
      document.getElementById('cli-nome').value = '';
      document.getElementById('cli-cnpj').value = '';
    }
    hideErrors();
    document.getElementById('client-modal').style.display = 'flex';
  };

  window.closeClientModal = function() {
    document.getElementById('client-modal').style.display = 'none';
    editingClientId = null;
  };

  window.saveClient = async function() {
    hideErrors();
    if (!currentUser) return;
    const nome = document.getElementById('cli-nome').value.trim();
    const cnpj = document.getElementById('cli-cnpj').value.trim();
    if (!nome || !cnpj) return showError('cli-error', 'Preencha nome e CNPJ.');
    if (!validaCNPJ(cnpj)) return showError('cli-error', 'CNPJ inválido. Verifique os dígitos.');
    showLoading(true);
    try {
      if (editingClientId) {
        const old = cache.clientes.find(x => x.id === editingClientId);
        const { error } = await db.from('clientes').update({
          nome, cnpj, updated_by: currentUser.nome, updated_at: new Date().toISOString()
        }).eq('id', editingClientId);
        if (error) throw error;
        await logAction('EDITAR_CLIENTE', `${old ? old.nome : '?'} → ${nome}`);
      } else {
        const cnpjLimpo = cnpj.replace(/\D/g,'');
        const dup = cache.clientes.find(x => x.cnpj.replace(/\D/g,'') === cnpjLimpo);
        if (dup) return showError('cli-error', 'Já existe um cliente com esse CNPJ.');
        const { error } = await db.from('clientes').insert({
          nome, cnpj, created_by: currentUser.nome
        });
        if (error) throw error;
        await logAction('CADASTRAR_CLIENTE', nome + ' · ' + cnpj);
      }
      await loadAllData();
      closeClientModal();
      render();
      if (currentDetailId) openDetailModal(currentDetailId);
    } catch(e) {
      showError('cli-error', 'Erro: ' + e.message);
    } finally { showLoading(false); }
  };

  window.openDeleteConfirm = function() {
    if (!currentUser || currentUser.role !== 'admin' || !currentDetailId) return;
    const c = cache.clientes.find(x => x.id === currentDetailId);
    if (!c) return;
    deleteTargetId = c.id;
    deleteTargetName = c.nome;
    document.getElementById('delete-target-name').textContent = c.nome;
    document.getElementById('delete-confirm-input').value = '';
    hideErrors();
    document.getElementById('delete-modal').style.display = 'flex';
  };

  window.closeDeleteConfirm = function() {
    document.getElementById('delete-modal').style.display = 'none';
    deleteTargetId = null;
  };

  window.confirmDelete = async function() {
    hideErrors();
    const typed = document.getElementById('delete-confirm-input').value.trim();
    if (typed !== deleteTargetName) return showError('delete-error', 'Nome não confere. Digite exatamente como mostrado.');
    showLoading(true);
    try {
      const { error } = await db.from('clientes').delete().eq('id', deleteTargetId);
      if (error) throw error;
      await logAction('EXCLUIR_CLIENTE', deleteTargetName);
      await loadAllData();
      closeDeleteConfirm();
      closeDetailModal();
      render();
    } catch(e) {
      showError('delete-error', 'Erro: ' + e.message);
    } finally { showLoading(false); }
  };

  // ---------- BLOQUEIOS ----------
  window.openBloqueioModal = function(bloqueioId) {
    if (!currentUser || !currentDetailId) return;
    editingBloqueioId = bloqueioId || null;
    document.getElementById('bloqueio-modal-title').textContent = bloqueioId ? 'Editar bloqueio' : 'Novo bloqueio';
    const c = cache.clientes.find(x => x.id === currentDetailId);
    if (c) document.getElementById('bloqueio-modal-cliente').textContent = c.nome + ' · ' + c.cnpj;
    if (bloqueioId) {
      const b = cache.bloqueios.find(x => x.id === bloqueioId);
      if (b) {
        document.getElementById('blq-bloqueio').value = b.data_bloqueio || '';
        document.getElementById('blq-desbloqueio').value = b.data_desbloqueio || '';
        document.getElementById('blq-obs').value = b.observacao || '';
      }
    } else {
      document.getElementById('blq-bloqueio').value = today();
      document.getElementById('blq-desbloqueio').value = '';
      document.getElementById('blq-obs').value = '';
    }
    hideErrors();
    document.getElementById('bloqueio-modal').style.display = 'flex';
  };

  window.closeBloqueioModal = function() {
    document.getElementById('bloqueio-modal').style.display = 'none';
    editingBloqueioId = null;
  };

  window.saveBloqueio = async function() {
    hideErrors();
    if (!currentUser || !currentDetailId) return;
    const dataBloqueio = document.getElementById('blq-bloqueio').value;
    const dataDesbloqueio = document.getElementById('blq-desbloqueio').value || null;
    const observacao = document.getElementById('blq-obs').value.trim() || null;
    if (!dataBloqueio) return showError('blq-error', 'Informe a data de bloqueio.');
    if (dataDesbloqueio && dataDesbloqueio < dataBloqueio) return showError('blq-error', 'Data de desbloqueio não pode ser anterior ao bloqueio.');

    const cli = cache.clientes.find(c => c.id === currentDetailId);
    const nomeCli = cli ? cli.nome : '?';

    if (!editingBloqueioId) {
      const aberto = cache.bloqueios.find(b => b.cliente_id === currentDetailId && !b.data_desbloqueio);
      if (aberto && !dataDesbloqueio) return showError('blq-error', 'Este cliente já tem um bloqueio em aberto. Desbloqueie-o antes de criar outro.');
    }

    showLoading(true);
    try {
      if (editingBloqueioId) {
        const { error } = await db.from('bloqueios').update({
          data_bloqueio: dataBloqueio,
          data_desbloqueio: dataDesbloqueio,
          observacao,
          updated_by: currentUser.nome,
          updated_at: new Date().toISOString()
        }).eq('id', editingBloqueioId);
        if (error) throw error;
        await logAction('EDITAR_BLOQUEIO', `${nomeCli} · ${fmtDate(dataBloqueio)}`);
      } else {
        const { error } = await db.from('bloqueios').insert({
          cliente_id: currentDetailId,
          data_bloqueio: dataBloqueio,
          data_desbloqueio: dataDesbloqueio,
          observacao,
          created_by: currentUser.nome
        });
        if (error) throw error;
        await logAction('NOVO_BLOQUEIO', `${nomeCli} · Bloqueado em ${fmtDate(dataBloqueio)}`);
      }
      await loadAllData();
      closeBloqueioModal();
      render();
      openDetailModal(currentDetailId);
    } catch(e) {
      showError('blq-error', 'Erro: ' + e.message);
    } finally { showLoading(false); }
  };

  window.desbloquearAgora = async function(bloqueioId) {
    if (!currentUser) return;
    showLoading(true);
    try {
      const b = cache.bloqueios.find(x => x.id === bloqueioId);
      const cli = b ? cache.clientes.find(c => c.id === b.cliente_id) : null;
      const { error } = await db.from('bloqueios').update({
        data_desbloqueio: today(),
        updated_by: currentUser.nome,
        updated_at: new Date().toISOString()
      }).eq('id', bloqueioId);
      if (error) throw error;
      await logAction('DESBLOQUEIO', (cli ? cli.nome : '?') + ' · Desbloqueado em ' + fmtDate(today()));
      await loadAllData();
      render();
      if (currentDetailId) openDetailModal(currentDetailId);
    } catch(e) {
      alert('Erro ao desbloquear: ' + e.message);
    } finally { showLoading(false); }
  };

  window.deleteBloqueio = async function(bloqueioId) {
    if (!currentUser) return;
    if (currentUser.role !== 'admin') return alert('Apenas administradores podem excluir registros.');
    if (!confirm('Excluir este registro de bloqueio do histórico?')) return;
    showLoading(true);
    try {
      const b = cache.bloqueios.find(x => x.id === bloqueioId);
      const cli = b ? cache.clientes.find(c => c.id === b.cliente_id) : null;
      const { error } = await db.from('bloqueios').delete().eq('id', bloqueioId);
      if (error) throw error;
      await logAction('EXCLUIR_BLOQUEIO', (cli ? cli.nome : '?') + ' · ' + fmtDate(b ? b.data_bloqueio : ''));
      await loadAllData();
      render();
      if (currentDetailId) openDetailModal(currentDetailId);
    } catch(e) {
      alert('Erro: ' + e.message);
    } finally { showLoading(false); }
  };

  // ---------- DETALHES ----------
  window.filterDetailHistory = function() {
    detailFilter = document.getElementById('detail-filter').value.trim();
    if (currentDetailId) openDetailModal(currentDetailId, true);
  };

  window.openDetailModal = function(clienteId, keepFilter) {
    if (!keepFilter) {
      detailFilter = '';
      const el = document.getElementById('detail-filter');
      if (el) el.value = '';
    }
    currentDetailId = clienteId;
    const c = cache.clientes.find(x => x.id === clienteId);
    if (!c) return;
    document.getElementById('detail-nome').textContent = c.nome;
    document.getElementById('detail-cnpj').textContent = 'CNPJ: ' + c.cnpj;

    const todosDoCliente = cache.bloqueios.filter(b => b.cliente_id === clienteId)
      .sort((a,b) => (b.data_bloqueio || '').localeCompare(a.data_bloqueio || ''));
    let dosCliente = todosDoCliente;
    if (detailFilter) dosCliente = dosCliente.filter(b => (b.data_bloqueio || '').includes(detailFilter) || (b.data_desbloqueio || '').includes(detailFilter));
    const aberto = todosDoCliente.find(b => !b.data_desbloqueio);

    const statusArea = document.getElementById('detail-status-area');
    if (aberto) {
      const dias = daysBetween(aberto.data_bloqueio);
      const crit = dias >= 60 ? 'pill-critico' : dias >= 30 ? 'pill-alerta' : 'pill-bloq';
      statusArea.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-size:12px;" class="muted">Status atual</div>
            <div style="font-size:16px;font-weight:500;color:#d34745;">Bloqueado há ${diasText(dias)}</div>
            <div style="font-size:12px;margin-top:2px;" class="muted">Desde ${fmtDate(aberto.data_bloqueio)} · <span class="${crit}">${dias >= 60 ? 'Crítico' : dias >= 30 ? 'Alerta' : 'Recente'}</span></div>
          </div>
          ${currentUser ? `<button class="primary" onclick="desbloquearAgora('${aberto.id}')">Desbloquear hoje</button>` : ''}
        </div>`;
    } else {
      statusArea.innerHTML = `<div style="font-size:12px;" class="muted">Status atual</div><div style="font-size:16px;font-weight:500;color:#2d8a52;">Ativo (sem bloqueio em aberto)</div>`;
    }

    const histContainer = document.getElementById('detail-historico');
    if (dosCliente.length === 0) {
      histContainer.innerHTML = '<div class="muted" style="font-size:13px;padding:12px;">' + (detailFilter ? 'Nenhum bloqueio encontrado.' : 'Nenhum bloqueio registrado ainda.') + '</div>';
    } else {
      histContainer.innerHTML = dosCliente.map(b => {
        const total = todosDoCliente.length;
        const origIdx = todosDoCliente.findIndex(x => x.id === b.id);
        const num = total - origIdx;
        const cor = b.data_desbloqueio ? '#4BC67A' : '#d34745';
        const duracao = b.data_desbloqueio ? daysBetween(b.data_bloqueio, b.data_desbloqueio) : daysBetween(b.data_bloqueio);
        const isAdmin = currentUser && currentUser.role === 'admin';
        const acoes = currentUser ? `
          ${!b.data_desbloqueio ? `<button class="mini-btn" onclick="desbloquearAgora('${b.id}')">Desbloquear</button>` : ''}
          <button class="mini-btn" onclick="openBloqueioModal('${b.id}')">Editar</button>
          ${isAdmin ? `<button class="mini-btn" style="color:#d34745;" onclick="deleteBloqueio('${b.id}')">Excluir</button>` : ''}
        ` : '';
        const obs = b.observacao ? `<div class="obs-text">${escapeHTML(b.observacao)}</div>` : '';
        const registrador = b.created_by ? `<div class="muted" style="font-size:11px;margin-top:2px;">Registrado por ${escapeHTML(b.created_by)}</div>` : '';
        return `<div class="history-item">
          <div class="history-dot" style="background:${cor};"></div>
          <div>
            <div style="font-weight:500;">#${num} · Bloqueio em ${fmtDate(b.data_bloqueio)}</div>
            <div class="muted" style="font-size:12px;">${b.data_desbloqueio ? `Desbloqueado em ${fmtDate(b.data_desbloqueio)} · ${diasText(duracao)} bloqueado` : `Em aberto há ${diasText(duracao)}`}</div>
            ${obs}${registrador}
          </div>
          <div style="white-space:nowrap;">${acoes}</div>
        </div>`;
      }).join('');
    }

    document.getElementById('detail-actions').style.display = currentUser ? 'block' : 'none';
    if (currentUser) {
      document.getElementById('btn-novo-bloqueio').style.display = aberto ? 'none' : 'inline-flex';
      const btnExcl = document.getElementById('btn-excluir-cliente');
      if (btnExcl) btnExcl.style.display = currentUser.role === 'admin' ? 'inline-flex' : 'none';
    }
    document.getElementById('detail-modal').style.display = 'flex';
  };

  window.closeDetailModal = function() {
    document.getElementById('detail-modal').style.display = 'none';
    currentDetailId = null;
    detailFilter = '';
  };

  window.openDetailModalAndCreate = async function(cid) {
    await openDetailModal(cid);
    openBloqueioModal();
  };

  // ---------- GRÁFICO ----------
  function renderChart(bloqueios) {
    const area = document.getElementById('chart-area');
    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
        label: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][d.getMonth()] + '/' + String(d.getFullYear()).slice(2),
        bloq: 0, desb: 0
      });
    }
    const idxMap = {};
    months.forEach((m,i) => { idxMap[m.key] = i; });
    bloqueios.forEach(b => {
      if (b.data_bloqueio) { const k = b.data_bloqueio.slice(0,7); if (idxMap[k] !== undefined) months[idxMap[k]].bloq++; }
      if (b.data_desbloqueio) { const k = b.data_desbloqueio.slice(0,7); if (idxMap[k] !== undefined) months[idxMap[k]].desb++; }
    });
    const maxVal = Math.max(1, ...months.map(m => Math.max(m.bloq, m.desb)));
    const w = area.clientWidth || 600, h = 200, padL = 32, padR = 8, padT = 10, padB = 24;
    const chartW = w - padL - padR, chartH = h - padT - padB;
    const groupW = chartW / months.length, barW = Math.max(4, groupW * 0.35);
    let gridLines = '', yLabels = '';
    for (let i = 0; i <= 4; i++) {
      const y = padT + (chartH * i / 4), val = Math.round(maxVal * (1 - i/4));
      gridLines += `<line x1="${padL}" y1="${y}" x2="${w-padR}" y2="${y}" stroke="rgba(124,220,140,0.1)" stroke-width="1"/>`;
      yLabels += `<text x="${padL-6}" y="${y+4}" text-anchor="end" font-size="10" fill="var(--dm-muted)">${val}</text>`;
    }
    let bars = '', xLabels = '';
    months.forEach((m, i) => {
      const xCenter = padL + groupW * i + groupW / 2;
      const xBloq = xCenter - barW - 1, xDesb = xCenter + 1;
      const hBloq = (m.bloq / maxVal) * chartH, hDesb = (m.desb / maxVal) * chartH;
      if (m.bloq > 0) bars += `<rect x="${xBloq}" y="${padT + chartH - hBloq}" width="${barW}" height="${hBloq}" fill="#d34745" rx="2"><title>${m.label}: ${m.bloq}</title></rect>`;
      if (m.desb > 0) bars += `<rect x="${xDesb}" y="${padT + chartH - hDesb}" width="${barW}" height="${hDesb}" fill="#4BC67A" rx="2"><title>${m.label}: ${m.desb}</title></rect>`;
      xLabels += `<text x="${xCenter}" y="${h - padB + 14}" text-anchor="middle" font-size="10" fill="var(--dm-muted)">${m.label}</text>`;
    });
    area.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">${gridLines}${bars}${yLabels}${xLabels}</svg>`;
  }

  // ---------- TOP INADIMPLENTES ----------
  function renderTop(clients, porCliente) {
    const topCard = document.getElementById('top-card');
    const sorted = clients.map(c => ({ c, total: porCliente[c.id].total, aberto: porCliente[c.id].aberto }))
      .filter(x => x.total > 0).sort((a,b) => b.total - a.total).slice(0, 5);
    if (sorted.length < 2) { topCard.style.display = 'none'; return; }
    topCard.style.display = 'block';
    document.getElementById('top-list').innerHTML = sorted.map((x, i) => {
      const pill = x.aberto ? '<span class="pill-bloq">Bloqueado</span>' : '<span class="pill-desb">Ativo</span>';
      return `<div class="ranking-row" onclick="openDetailModal('${x.c.id}')">
        <div class="ranking-num">${i+1}</div>
        <div><div style="font-weight:500;">${escapeHTML(x.c.nome)}</div><div class="muted" style="font-size:12px;">${escapeHTML(x.c.cnpj)}</div></div>
        <div style="text-align:right;"><div style="font-weight:500;">${x.total} bloqueio${x.total>1?'s':''}</div><div style="margin-top:2px;">${pill}</div></div>
      </div>`;
    }).join('');
  }

  // ---------- LOG ----------
  function renderLog() {
    const listEl = document.getElementById('log-list');
    const emptyEl = document.getElementById('log-empty');
    if (cache.log.length === 0) { listEl.innerHTML = ''; emptyEl.style.display = 'block'; return; }
    emptyEl.style.display = 'none';
    const acaoMap = { 'LOGIN':'🔓','LOGOUT':'🔒','CADASTRO_USUARIO':'👤','CADASTRAR_CLIENTE':'➕','EDITAR_CLIENTE':'✏️','EXCLUIR_CLIENTE':'🗑️','NOVO_BLOQUEIO':'🔴','DESBLOQUEIO':'🟢','EDITAR_BLOQUEIO':'✏️','EXCLUIR_BLOQUEIO':'🗑️','IMPORTAR':'📥','RESET_SENHA':'🔑','PROMOVER_USUARIO':'⬆️','REBAIXAR_USUARIO':'⬇️','REMOVER_USUARIO':'🚫' };
    const acaoLabel = { 'LOGIN':'Entrou','LOGOUT':'Saiu','CADASTRO_USUARIO':'Cadastrou usuário','CADASTRAR_CLIENTE':'Cadastrou cliente','EDITAR_CLIENTE':'Editou cliente','EXCLUIR_CLIENTE':'Excluiu cliente','NOVO_BLOQUEIO':'Novo bloqueio','DESBLOQUEIO':'Desbloqueou','EDITAR_BLOQUEIO':'Editou bloqueio','EXCLUIR_BLOQUEIO':'Excluiu bloqueio','IMPORTAR':'Importou planilha','RESET_SENHA':'Resetou senha','PROMOVER_USUARIO':'Promoveu usuário','REBAIXAR_USUARIO':'Rebaixou usuário','REMOVER_USUARIO':'Removeu usuário' };
    listEl.innerHTML = cache.log.map(l => `<div class="log-item">
      <div style="font-size:18px;">${acaoMap[l.acao] || '•'}</div>
      <div>
        <div style="font-weight:500;">${acaoLabel[l.acao] || l.acao}</div>
        <div class="muted" style="font-size:11px;margin-top:2px;">${escapeHTML(l.detalhes || '')}</div>
        <div class="muted" style="font-size:11px;margin-top:2px;">Por ${escapeHTML(l.usuario_nome)} · ${fmtDateTime(l.created_at)}</div>
      </div>
      <div></div>
    </div>`).join('');
  }

  // ---------- RENDER PRINCIPAL ----------
  window.render = function() {
    const clients = cache.clientes;
    const bloqueios = cache.bloqueios;
    const q = document.getElementById('filter-input').value.trim().toLowerCase();
    const statusF = document.getElementById('filter-status').value;
    const dateDe = document.getElementById('filter-de').value;
    const dateAte = document.getElementById('filter-ate').value;

    const porCliente = {};
    clients.forEach(c => { porCliente[c.id] = { total: 0, aberto: null, ultimo: null, diasBloq: 0 }; });
    bloqueios.forEach(b => {
      if (!porCliente[b.cliente_id]) return;
      porCliente[b.cliente_id].total++;
      if (!b.data_desbloqueio) porCliente[b.cliente_id].aberto = b;
      if (!porCliente[b.cliente_id].ultimo || (b.data_bloqueio > porCliente[b.cliente_id].ultimo.data_bloqueio)) porCliente[b.cliente_id].ultimo = b;
    });
    Object.keys(porCliente).forEach(cid => {
      if (porCliente[cid].aberto) porCliente[cid].diasBloq = daysBetween(porCliente[cid].aberto.data_bloqueio);
    });

    const bloqCount = clients.filter(c => porCliente[c.id].aberto).length;
    const criticosCount = clients.filter(c => porCliente[c.id].aberto && porCliente[c.id].diasBloq >= 60).length;
    document.getElementById('metric-total').textContent = clients.length;
    document.getElementById('metric-bloqueados').textContent = bloqCount;
    document.getElementById('metric-desbloqueados').textContent = clients.length - bloqCount;
    document.getElementById('metric-eventos').textContent = bloqueios.length;
    document.getElementById('metric-criticos').textContent = criticosCount;
    document.getElementById('footer-date').textContent = new Date().toLocaleDateString('pt-BR');

    renderChart(bloqueios);
    renderTop(clients, porCliente);
    updateSortIndicators();

    if (currentTab === 'atual') renderAtual(clients, porCliente, q, statusF, dateDe, dateAte);
    else if (currentTab === 'historico') renderHistorico(clients, bloqueios, q, statusF, dateDe, dateAte);
    else if (currentTab === 'log') renderLog();
    else if (currentTab === 'usuarios') renderUsuarios();
  };

  function renderAtual(clients, porCliente, q, statusF, dateDe, dateAte) {
    let filtered = clients.filter(c => {
      const info = porCliente[c.id];
      const isBloq = !!info.aberto;
      const isCrit = isBloq && info.diasBloq >= 60;
      if (statusF === 'bloqueado' && !isBloq) return false;
      if (statusF === 'desbloqueado' && isBloq) return false;
      if (statusF === 'critico' && !isCrit) return false;
      if (q && !c.nome.toLowerCase().includes(q) && !c.cnpj.toLowerCase().includes(q)) return false;
      if (dateDe || dateAte) {
        const ref = info.ultimo ? info.ultimo.data_bloqueio : null;
        if (!ref) return false;
        if (dateDe && ref < dateDe) return false;
        if (dateAte && ref > dateAte) return false;
      }
      return true;
    });

    filtered.sort((a,b) => {
      const ia = porCliente[a.id], ib = porCliente[b.id];
      let va, vb;
      if (sortField === 'nome') { va = a.nome.toLowerCase(); vb = b.nome.toLowerCase(); }
      else if (sortField === 'dias') { va = ia.diasBloq; vb = ib.diasBloq; }
      else if (sortField === 'total') { va = ia.total; vb = ib.total; }
      else if (sortField === 'ultimo') { va = ia.ultimo ? ia.ultimo.data_bloqueio : ''; vb = ib.ultimo ? ib.ultimo.data_bloqueio : ''; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    const tbody = document.getElementById('atual-tbody');
    const empty = document.getElementById('atual-empty');
    if (filtered.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      empty.textContent = clients.length === 0 ? 'Nenhum cliente cadastrado ainda.' : 'Nenhum cliente corresponde ao filtro.';
      return;
    }
    empty.style.display = 'none';
    tbody.innerHTML = filtered.map(c => {
      const info = porCliente[c.id];
      const isBloq = !!info.aberto;
      let pill;
      if (!isBloq) pill = '<span class="pill-desb">Ativo</span>';
      else if (info.diasBloq >= 60) pill = '<span class="pill-critico">Crítico</span>';
      else if (info.diasBloq >= 30) pill = '<span class="pill-alerta">Alerta</span>';
      else pill = '<span class="pill-bloq">Bloqueado</span>';
      const tempo = isBloq ? `<span style="color:${info.diasBloq >= 60 ? '#d34745' : info.diasBloq >= 30 ? '#e88c3a' : 'inherit'};font-weight:500;">há ${diasText(info.diasBloq)}</span>` : '<span class="muted">—</span>';
      const ultimo = info.ultimo ? fmtDate(info.ultimo.data_bloqueio) : '—';
      const acoes = currentUser ? `<button class="mini-btn" onclick="event.stopPropagation();openDetailModal('${c.id}')">Ver</button>${isBloq ? `<button class="mini-btn" onclick="event.stopPropagation();desbloquearAgora('${info.aberto.id}')">Desbloquear</button>` : `<button class="mini-btn" onclick="event.stopPropagation();openDetailModalAndCreate('${c.id}')">Bloquear</button>`}` : `<button class="mini-btn" onclick="event.stopPropagation();openDetailModal('${c.id}')">Ver</button>`;
      return `<tr onclick="openDetailModal('${c.id}')">
        <td style="font-weight:500;">${escapeHTML(c.nome)}</td>
        <td class="muted">${escapeHTML(c.cnpj)}</td>
        <td>${pill}</td>
        <td style="font-size:13px;">${tempo}</td>
        <td style="text-align:center;font-weight:500;">${info.total}</td>
        <td style="font-size:13px;">${ultimo}</td>
        <td style="text-align:right;white-space:nowrap;">${acoes}</td>
      </tr>`;
    }).join('');
  }

  function renderHistorico(clients, bloqueios, q, statusF, dateDe, dateAte) {
    const mapCli = {}; clients.forEach(c => { mapCli[c.id] = c; });
    let filtered = bloqueios.filter(b => {
      const c = mapCli[b.cliente_id]; if (!c) return false;
      const isAberto = !b.data_desbloqueio;
      if (statusF === 'bloqueado' && !isAberto) return false;
      if (statusF === 'desbloqueado' && isAberto) return false;
      if (q && !c.nome.toLowerCase().includes(q) && !c.cnpj.toLowerCase().includes(q)) return false;
      if (dateDe && b.data_bloqueio < dateDe) return false;
      if (dateAte && b.data_bloqueio > dateAte) return false;
      return true;
    });
    filtered.sort((a,b) => (b.data_bloqueio || '').localeCompare(a.data_bloqueio || ''));
    const tbody = document.getElementById('hist-tbody');
    const empty = document.getElementById('hist-empty');
    if (filtered.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      empty.textContent = bloqueios.length === 0 ? 'Nenhum bloqueio registrado.' : 'Nenhum registro corresponde ao filtro.';
      return;
    }
    empty.style.display = 'none';
    tbody.innerHTML = filtered.map(b => {
      const c = mapCli[b.cliente_id];
      const isAberto = !b.data_desbloqueio;
      const pill = isAberto ? '<span class="pill-bloq">Em aberto</span>' : '<span class="pill-desb">Finalizado</span>';
      const dur = isAberto ? daysBetween(b.data_bloqueio) : daysBetween(b.data_bloqueio, b.data_desbloqueio);
      const obsShort = b.observacao ? (b.observacao.length > 40 ? escapeHTML(b.observacao.slice(0,40)) + '…' : escapeHTML(b.observacao)) : '<span class="muted">—</span>';
      return `<tr onclick="openDetailModal('${c.id}')">
        <td style="font-weight:500;">${escapeHTML(c.nome)}</td>
        <td class="muted">${escapeHTML(c.cnpj)}</td>
        <td style="font-size:13px;">${fmtDate(b.data_bloqueio)}</td>
        <td style="font-size:13px;">${fmtDate(b.data_desbloqueio)}</td>
        <td style="font-size:13px;">${diasText(dur)}</td>
        <td>${pill}</td>
        <td style="font-size:12px;max-width:200px;" title="${escapeHTML(b.observacao||'')}">${obsShort}</td>
      </tr>`;
    }).join('');
  }

  // ---------- GERENCIAMENTO DE USUÁRIOS (ADMIN) ----------
  async function renderUsuarios() {
    const listEl = document.getElementById('users-tbody');
    const emptyEl = document.getElementById('users-empty');
    if (!currentUser || currentUser.role !== 'admin') {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      emptyEl.textContent = 'Apenas administradores podem ver esta seção.';
      return;
    }
    try {
      const { data: users } = await db.from('usuarios').select('id, nome, email, role, created_at').order('created_at');
      if (!users || users.length === 0) {
        listEl.innerHTML = '';
        emptyEl.style.display = 'block';
        emptyEl.textContent = 'Nenhum usuário cadastrado.';
        return;
      }
      emptyEl.style.display = 'none';
      listEl.innerHTML = users.map(u => {
        const badge = u.role === 'admin' ? '<span class="badge-admin">Admin</span>' : '<span class="pill-desb">Funcionário</span>';
        const isSelf = u.id === currentUser.id;
        const acoes = `
          <button class="mini-btn" onclick="openResetUserModal('${u.id}','${escapeHTML(u.nome).replace(/'/g,"\\'")}')">Resetar senha</button>
          ${!isSelf ? `
            ${u.role !== 'admin' ? `<button class="mini-btn" onclick="promoteUser('${u.id}','${escapeHTML(u.nome).replace(/'/g,"\\'")}')">Promover a admin</button>` : `<button class="mini-btn" onclick="demoteUser('${u.id}','${escapeHTML(u.nome).replace(/'/g,"\\'")}')">Tornar funcionário</button>`}
            <button class="mini-btn" style="color:#d34745;" onclick="deleteUser('${u.id}','${escapeHTML(u.nome).replace(/'/g,"\\'")}')">Remover</button>
          ` : '<span class="muted" style="font-size:11px;margin-left:8px;">(você)</span>'}
        `;
        return `<tr>
          <td style="font-weight:500;">${escapeHTML(u.nome)}</td>
          <td class="muted">${escapeHTML(u.email)}</td>
          <td>${badge}</td>
          <td style="font-size:13px;">${fmtDateTime(u.created_at)}</td>
          <td style="text-align:right;white-space:nowrap;">${acoes}</td>
        </tr>`;
      }).join('');
    } catch(e) {
      console.error(e);
      emptyEl.style.display = 'block';
      emptyEl.textContent = 'Erro ao carregar usuários.';
    }
  }

  window.openCreateUserModal = function() {
    if (!currentUser || currentUser.role !== 'admin') return;
    ['cu-nome','cu-email','cu-senha','cu-pergunta','cu-resposta'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('cu-role').value = 'funcionario';
    hideErrors();
    document.getElementById('create-user-modal').style.display = 'flex';
  };
  window.closeCreateUserModal = function() {
    document.getElementById('create-user-modal').style.display = 'none';
  };

  window.createUser = async function() {
    hideErrors();
    if (!currentUser || currentUser.role !== 'admin') return;
    const nome = document.getElementById('cu-nome').value.trim();
    const email = document.getElementById('cu-email').value.trim().toLowerCase();
    const senha = document.getElementById('cu-senha').value;
    const pergunta = document.getElementById('cu-pergunta').value.trim();
    const resposta = document.getElementById('cu-resposta').value.trim().toLowerCase();
    const role = document.getElementById('cu-role').value;
    if (!nome || !email || !senha || !pergunta || !resposta) return showError('cu-error', 'Preencha todos os campos.');
    if (senha.length < 6) return showError('cu-error', 'Senha deve ter no mínimo 6 caracteres.');
    showLoading(true);
    try {
      const { data: existing } = await db.from('usuarios').select('id').eq('email', email);
      if (existing && existing.length > 0) return showError('cu-error', 'E-mail já cadastrado.');
      const senhaHash = await hashSenha(senha);
      const respostaHash = await hashSenha(resposta);
      const { error } = await db.from('usuarios').insert({
        nome, email, senha_hash: senhaHash,
        pergunta_seguranca: pergunta, resposta_hash: respostaHash, role
      });
      if (error) throw error;
      await logAction('CADASTRO_USUARIO', `Criou ${role}: ${nome} (${email})`);
      closeCreateUserModal();
      alert(`Usuário criado com sucesso!\n\nNome: ${nome}\nE-mail: ${email}\nSenha inicial: ${senha}\n\nInforme esses dados ao usuário.`);
      render();
    } catch(e) {
      showError('cu-error', 'Erro: ' + e.message);
    } finally { showLoading(false); }
  };

  let resetUserId = null, resetUserName = '';
  window.openResetUserModal = function(userId, userName) {
    if (!currentUser || currentUser.role !== 'admin') return;
    resetUserId = userId;
    resetUserName = userName;
    document.getElementById('ru-target').textContent = 'Usuário: ' + userName;
    document.getElementById('ru-senha').value = '';
    hideErrors();
    document.getElementById('reset-user-modal').style.display = 'flex';
  };
  window.closeResetUserModal = function() {
    document.getElementById('reset-user-modal').style.display = 'none';
    resetUserId = null;
  };
  window.resetUserPassword = async function() {
    hideErrors();
    if (!currentUser || currentUser.role !== 'admin' || !resetUserId) return;
    const novaSenha = document.getElementById('ru-senha').value;
    if (!novaSenha || novaSenha.length < 6) return showError('ru-error', 'Senha deve ter no mínimo 6 caracteres.');
    showLoading(true);
    try {
      const senhaHash = await hashSenha(novaSenha);
      const { error } = await db.from('usuarios').update({ senha_hash: senhaHash }).eq('id', resetUserId);
      if (error) throw error;
      await logAction('RESET_SENHA', `Resetou senha de: ${resetUserName}`);
      closeResetUserModal();
      alert(`Senha resetada com sucesso!\n\nNova senha: ${novaSenha}\n\nInforme ao usuário.`);
      render();
    } catch(e) {
      showError('ru-error', 'Erro: ' + e.message);
    } finally { showLoading(false); }
  };

  window.promoteUser = async function(userId, userName) {
    if (!currentUser || currentUser.role !== 'admin') return;
    if (!confirm(`Promover ${userName} a administrador?\n\nEle terá acesso total, incluindo criar/remover usuários e excluir registros.`)) return;
    showLoading(true);
    try {
      const { error } = await db.from('usuarios').update({ role: 'admin' }).eq('id', userId);
      if (error) throw error;
      await logAction('PROMOVER_USUARIO', `Promoveu a admin: ${userName}`);
      render();
    } catch(e) {
      alert('Erro: ' + e.message);
    } finally { showLoading(false); }
  };

  window.demoteUser = async function(userId, userName) {
    if (!currentUser || currentUser.role !== 'admin') return;
    if (!confirm(`Tornar ${userName} funcionário comum?\n\nEle perderá acesso para gerenciar usuários e excluir registros.`)) return;
    showLoading(true);
    try {
      // Não permitir rebaixar o último admin
      const { data: admins } = await db.from('usuarios').select('id').eq('role', 'admin');
      if (admins && admins.length <= 1) {
        showLoading(false);
        return alert('Não é possível. Precisa existir ao menos um administrador no sistema.');
      }
      const { error } = await db.from('usuarios').update({ role: 'funcionario' }).eq('id', userId);
      if (error) throw error;
      await logAction('REBAIXAR_USUARIO', `Rebaixou a funcionário: ${userName}`);
      render();
    } catch(e) {
      alert('Erro: ' + e.message);
    } finally { showLoading(false); }
  };

  window.deleteUser = async function(userId, userName) {
    if (!currentUser || currentUser.role !== 'admin') return;
    if (!confirm(`Remover o usuário "${userName}"?\n\nEsta ação é irreversível. O histórico de ações dele permanecerá no log de auditoria.`)) return;
    showLoading(true);
    try {
      // Não permitir remover o último admin
      const { data: userToDel } = await db.from('usuarios').select('role').eq('id', userId);
      if (userToDel && userToDel[0] && userToDel[0].role === 'admin') {
        const { data: admins } = await db.from('usuarios').select('id').eq('role', 'admin');
        if (admins && admins.length <= 1) {
          showLoading(false);
          return alert('Não é possível remover. Precisa existir ao menos um administrador no sistema.');
        }
      }
      const { error } = await db.from('usuarios').delete().eq('id', userId);
      if (error) throw error;
      await logAction('REMOVER_USUARIO', `Removeu: ${userName}`);
      render();
    } catch(e) {
      alert('Erro: ' + e.message);
    } finally { showLoading(false); }
  };

  // ---------- EXPORT EXCEL ----------
  window.exportExcel = function() {
    if (typeof XLSX === 'undefined') return alert('Aguarde o carregamento da biblioteca Excel.');
    const clients = cache.clientes;
    const bloqueios = cache.bloqueios;
    const mapCli = {}; clients.forEach(c => { mapCli[c.id] = c; });
    const porCliente = {};
    clients.forEach(c => { porCliente[c.id] = { total: 0, aberto: null, ultimo: null }; });
    bloqueios.forEach(b => {
      if (!porCliente[b.cliente_id]) return;
      porCliente[b.cliente_id].total++;
      if (!b.data_desbloqueio) porCliente[b.cliente_id].aberto = b;
      if (!porCliente[b.cliente_id].ultimo || (b.data_bloqueio > porCliente[b.cliente_id].ultimo.data_bloqueio)) porCliente[b.cliente_id].ultimo = b;
    });

    const sheetAtual = clients.map(c => {
      const info = porCliente[c.id];
      const dias = info.aberto ? daysBetween(info.aberto.data_bloqueio) : 0;
      return {
        'Cliente': c.nome,
        'CNPJ': c.cnpj,
        'Status atual': info.aberto ? 'Bloqueado' : 'Ativo',
        'Dias bloqueado': dias,
        'Total de bloqueios': info.total,
        'Último bloqueio': info.ultimo ? fmtDate(info.ultimo.data_bloqueio) : '',
        'Último desbloqueio': info.ultimo && info.ultimo.data_desbloqueio ? fmtDate(info.ultimo.data_desbloqueio) : ''
      };
    });

    const sheetHist = bloqueios.sort((a,b) => (b.data_bloqueio || '').localeCompare(a.data_bloqueio || '')).map(b => {
      const c = mapCli[b.cliente_id] || { nome: '(removido)', cnpj: '' };
      const dur = b.data_desbloqueio ? daysBetween(b.data_bloqueio, b.data_desbloqueio) : daysBetween(b.data_bloqueio);
      return {
        'Cliente': c.nome,
        'CNPJ': c.cnpj,
        'Data de bloqueio': fmtDate(b.data_bloqueio),
        'Data de desbloqueio': fmtDate(b.data_desbloqueio),
        'Duração (dias)': dur,
        'Situação': b.data_desbloqueio ? 'Finalizado' : 'Em aberto',
        'Observação': b.observacao || '',
        'Registrado por': b.created_by || '',
        'Data do registro': fmtDateTime(b.created_at)
      };
    });

    const now = new Date(), monthMap = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      monthMap[k] = { mes: k, bloqueios: 0, desbloqueios: 0 };
    }
    bloqueios.forEach(b => {
      if (b.data_bloqueio) { const k = b.data_bloqueio.slice(0,7); if (monthMap[k]) monthMap[k].bloqueios++; }
      if (b.data_desbloqueio) { const k = b.data_desbloqueio.slice(0,7); if (monthMap[k]) monthMap[k].desbloqueios++; }
    });
    const sheetResumo = Object.values(monthMap).map(m => ({ 'Mês (AAAA-MM)': m.mes, 'Bloqueios': m.bloqueios, 'Desbloqueios': m.desbloqueios }));
    const sheetLog = cache.log.map(l => ({
      'Data/Hora': fmtDateTime(l.created_at),
      'Usuário': l.usuario_nome,
      'E-mail': l.usuario_email,
      'Ação': l.acao,
      'Detalhes': l.detalhes
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sheetAtual.length ? sheetAtual : [{'Cliente':'(sem dados)'}]);
    ws1['!cols'] = [{wch:30},{wch:22},{wch:14},{wch:14},{wch:18},{wch:16},{wch:18}];
    XLSX.utils.book_append_sheet(wb, ws1, 'Situação atual');
    const ws2 = XLSX.utils.json_to_sheet(sheetHist.length ? sheetHist : [{'Cliente':'(sem dados)'}]);
    ws2['!cols'] = [{wch:30},{wch:22},{wch:14},{wch:14},{wch:12},{wch:12},{wch:40},{wch:20},{wch:20}];
    XLSX.utils.book_append_sheet(wb, ws2, 'Histórico completo');
    const ws3 = XLSX.utils.json_to_sheet(sheetResumo);
    ws3['!cols'] = [{wch:16},{wch:12},{wch:14}];
    XLSX.utils.book_append_sheet(wb, ws3, 'Resumo mensal');
    if (sheetLog.length) {
      const ws4 = XLSX.utils.json_to_sheet(sheetLog);
      ws4['!cols'] = [{wch:20},{wch:25},{wch:30},{wch:20},{wch:50}];
      XLSX.utils.book_append_sheet(wb, ws4, 'Log de auditoria');
    }
    XLSX.writeFile(wb, `digital-mais-bloqueios_${today()}.xlsx`);
  };

  // ---------- IMPORTAÇÃO ----------
  window.openImportModal = function() {
    if (!currentUser || currentUser.role !== 'admin') return;
    document.getElementById('import-modal').style.display = 'flex';
    document.getElementById('import-file').value = '';
    document.getElementById('import-preview').style.display = 'none';
    document.getElementById('btn-do-import').disabled = true;
    importBuffer = [];
    hideErrors();
  };
  window.closeImportModal = function() {
    document.getElementById('import-modal').style.display = 'none';
  };

  document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('import-file');
    if (fileInput) {
      fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
          try {
            const data = new Uint8Array(ev.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws);
            const parsed = rows.map(r => {
              const nome = r['Nome'] || r['nome'] || r['Cliente'] || r['cliente'] || '';
              const cnpj = (r['CNPJ'] || r['cnpj'] || '').toString();
              return { nome: String(nome).trim(), cnpj: String(cnpj).trim() };
            }).filter(x => x.nome && x.cnpj);
            if (parsed.length === 0) return showError('import-error', 'Nenhuma linha válida. A planilha precisa ter colunas "Nome" e "CNPJ".');
            importBuffer = parsed;
            const preview = document.getElementById('import-preview');
            preview.innerHTML = '<b>' + parsed.length + ' cliente(s) encontrado(s):</b><br>' + parsed.slice(0, 10).map(p => escapeHTML(p.nome) + ' · ' + escapeHTML(p.cnpj)).join('<br>') + (parsed.length > 10 ? '<br>...' : '');
            preview.style.display = 'block';
            document.getElementById('btn-do-import').disabled = false;
          } catch(err) {
            showError('import-error', 'Erro ao ler arquivo: ' + err.message);
          }
        };
        reader.readAsArrayBuffer(file);
      });
    }
  });

  window.doImport = async function() {
    if (importBuffer.length === 0) return;
    showLoading(true);
    try {
      let added = 0, skipped = 0;
      for (const p of importBuffer) {
        const cnpjClean = p.cnpj.replace(/\D/g,'');
        if (!validaCNPJ(p.cnpj)) { skipped++; continue; }
        const dup = cache.clientes.find(x => x.cnpj.replace(/\D/g,'') === cnpjClean);
        if (dup) { skipped++; continue; }
        const { error } = await db.from('clientes').insert({
          nome: p.nome, cnpj: p.cnpj, created_by: currentUser.nome
        });
        if (error) { skipped++; } else { added++; cache.clientes.push({ nome: p.nome, cnpj: p.cnpj, id: 'tmp' }); }
      }
      await logAction('IMPORTAR', `${added} novo(s), ${skipped} ignorado(s)`);
      await loadAllData();
      closeImportModal();
      render();
      alert(`Importação concluída: ${added} novos, ${skipped} ignorados (CNPJ duplicado ou inválido).`);
    } catch(e) {
      alert('Erro: ' + e.message);
    } finally { showLoading(false); }
  };

  // ---------- INICIALIZAÇÃO ----------
  (async function init() {
    showLoading(true);
    const sess = getSession();
    if (sess && sess.id) {
      try {
        const { data } = await db.from('usuarios').select('*').eq('id', sess.id);
        if (data && data.length > 0) {
          currentUser = { id: data[0].id, nome: data[0].nome, email: data[0].email, role: data[0].role };
        } else {
          setSession(null);
        }
      } catch(e) { console.error(e); }
    }
    updateAuthUI();
    await loadAllData();
    render();
    showLoading(false);
  })();

})();
