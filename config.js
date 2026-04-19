// ============================================================
// CONFIGURAÇÃO DO SUPABASE
// ============================================================
// Substitua os valores abaixo pelos do seu projeto Supabase.
// Você encontra em: Project Settings → API
// ============================================================

const SUPABASE_CONFIG = {
  // Cole aqui a URL do seu projeto (ex: https://xxxxx.supabase.co)
  url: 'COLE_AQUI_A_URL_DO_SUPABASE',

  // Cole aqui a chave "anon public" (a chave longa)
  anonKey: 'COLE_AQUI_A_CHAVE_ANON_PUBLIC'
};

// Não precisa mexer em mais nada abaixo desta linha ↓
window.SUPABASE_CONFIG = SUPABASE_CONFIG;
