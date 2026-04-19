-- ============================================================
-- PAINEL DIGITAL+ CONTABILIDADE - Setup Supabase
-- Execute este script no SQL Editor do Supabase UMA VEZ
-- ============================================================

-- TABELA DE USUÁRIOS (funcionários do escritório)
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  pergunta_seguranca TEXT NOT NULL,
  resposta_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'funcionario' CHECK (role IN ('admin', 'funcionario')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABELA DE CLIENTES
CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cnpj TEXT UNIQUE NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  updated_at TIMESTAMPTZ
);

-- TABELA DE BLOQUEIOS
CREATE TABLE IF NOT EXISTS bloqueios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  data_bloqueio DATE NOT NULL,
  data_desbloqueio DATE,
  observacao TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bloqueios_cliente ON bloqueios(cliente_id);
CREATE INDEX IF NOT EXISTS idx_bloqueios_data ON bloqueios(data_bloqueio DESC);

-- TABELA DE LOG DE AUDITORIA
CREATE TABLE IF NOT EXISTS log_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acao TEXT NOT NULL,
  detalhes TEXT,
  usuario_nome TEXT,
  usuario_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_log_data ON log_auditoria(created_at DESC);

-- ============================================================
-- POLÍTICAS DE SEGURANÇA (RLS)
-- Permite leitura pública e escrita autenticada
-- ============================================================

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloqueios ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_auditoria ENABLE ROW LEVEL SECURITY;

-- USUÁRIOS: Qualquer um pode ler (para fazer login) e inserir (para cadastro público)
DROP POLICY IF EXISTS "usuarios_select" ON usuarios;
CREATE POLICY "usuarios_select" ON usuarios FOR SELECT USING (true);
DROP POLICY IF EXISTS "usuarios_insert" ON usuarios;
CREATE POLICY "usuarios_insert" ON usuarios FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "usuarios_update" ON usuarios;
CREATE POLICY "usuarios_update" ON usuarios FOR UPDATE USING (true);

-- CLIENTES: Leitura pública, escrita livre (a app valida no cliente)
DROP POLICY IF EXISTS "clientes_all" ON clientes;
CREATE POLICY "clientes_all" ON clientes FOR ALL USING (true) WITH CHECK (true);

-- BLOQUEIOS: Leitura pública, escrita livre
DROP POLICY IF EXISTS "bloqueios_all" ON bloqueios;
CREATE POLICY "bloqueios_all" ON bloqueios FOR ALL USING (true) WITH CHECK (true);

-- LOG: Leitura e inserção (sem update/delete)
DROP POLICY IF EXISTS "log_select" ON log_auditoria;
CREATE POLICY "log_select" ON log_auditoria FOR SELECT USING (true);
DROP POLICY IF EXISTS "log_insert" ON log_auditoria;
CREATE POLICY "log_insert" ON log_auditoria FOR INSERT WITH CHECK (true);

-- ============================================================
-- Pronto! Seu banco está configurado.
-- Volte ao painel do Supabase → Project Settings → API
-- Copie a URL e a chave anon public para o arquivo config.js
-- ============================================================
