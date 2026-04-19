// ============================================================
// CONFIGURAÇÃO DO SUPABASE
// ============================================================
// Substitua os valores abaixo pelos do seu projeto Supabase.
// Você encontra em: Project Settings → API
// ============================================================

const SUPABASE_CONFIG = {
  // Cole aqui a URL do seu projeto (ex: https://xxxxx.supabase.co)
  url: 'https://kzecnmbywkckjthnbwgm.supabase.co',

  // Cole aqui a chave "anon public" (a chave longa)
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6ZWNubWJ5d2tja2p0aG5id2dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MjM5ODEsImV4cCI6MjA5MjE5OTk4MX0.uHdxmLwzHum2bS5o8tcc3rhSLNf995zxcB6Dnw-Mus0'
};

// Não precisa mexer em mais nada abaixo desta linha ↓
window.SUPABASE_CONFIG = SUPABASE_CONFIG;
