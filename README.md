# Painel Digital+ Contabilidade

Sistema de controle de bloqueio de serviços contábeis para clientes inadimplentes.

## Funcionalidades

- Cadastro de clientes (nome + CNPJ com validação)
- Registro de múltiplos bloqueios por cliente com histórico completo
- Observações em cada bloqueio
- Autenticação com login, senha e recuperação por pergunta de segurança
- Níveis de acesso: **Administrador** (tudo) e **Funcionário** (operações)
- Log de auditoria completo
- Gráfico de bloqueios por mês
- Top inadimplentes recorrentes
- Exportação para Excel
- Importação em massa via planilha
- Filtros por período, status e busca textual
- Modo claro/escuro
- Impressão/PDF
- **Acesso público para visualização** (qualquer um vê a lista, só logados editam)

## Passo a passo para implementar

### 1. Criar projeto no Supabase (banco de dados)

1. Acesse [supabase.com](https://supabase.com) e faça login
2. Clique em **New Project**
3. Escolha um nome (ex: `digital-mais-painel`), defina uma senha forte para o banco e selecione a região mais próxima (South America - São Paulo)
4. Aguarde ~2 minutos até o projeto ficar pronto
5. No menu lateral, vá em **SQL Editor** → **New query**
6. Cole todo o conteúdo do arquivo `supabase-setup.sql` deste projeto e clique em **Run**. Isso cria as tabelas e configura as permissões.
7. Vá em **Project Settings** (ícone de engrenagem) → **API**
8. Copie os dois valores que você vai precisar:
   - **Project URL** (algo como `https://xxxxx.supabase.co`)
   - **anon public** key (a chave longa)

### 2. Configurar as chaves no projeto

1. Abra o arquivo `config.js` deste projeto
2. Cole a URL e a chave nos lugares indicados
3. Salve

### 3. Subir no GitHub

```bash
cd pasta-do-projeto
git init
git add .
git commit -m "Painel Digital+ Contabilidade - versão inicial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/digital-mais-painel.git
git push -u origin main
```

Ou pelo site: crie um novo repositório no GitHub, arraste os arquivos pela interface web.

### 4. Deploy no Vercel

1. Acesse [vercel.com](https://vercel.com) logado
2. Clique em **Add New** → **Project**
3. Importe seu repositório do GitHub
4. **Framework Preset**: deixe como **Other** (projeto HTML puro)
5. Clique em **Deploy**
6. Em ~30 segundos seu painel estará no ar em `https://seu-projeto.vercel.app`

### 5. Criar o primeiro usuário (administrador)

1. Abra o painel no navegador
2. Clique em **Entrar** → o sistema vai detectar que não há usuários e mostrar o formulário de cadastro
3. **Este primeiro cadastro será o administrador** do sistema
4. Preencha todos os campos e salve

### 6. Criar contas para sua equipe

**Depois do primeiro cadastro, o cadastro público fica BLOQUEADO.** Apenas você (admin) pode criar novas contas.

Para criar conta da sua equipe:
1. Faça login com sua conta de administrador
2. Clique na aba **Usuários** (só aparece para admins)
3. Clique em **+ Novo usuário**
4. Preencha: nome, e-mail, senha inicial, pergunta de segurança e resposta
5. Escolha o tipo: **Funcionário** (padrão) ou **Administrador**
6. Informe a senha inicial ao colaborador — ele pode mudar depois em "Esqueci minha senha"

Pronto! Agora você pode:
- Compartilhar o link com toda a equipe para **visualização pública** (sem login)
- Criar contas apenas para quem precisa **cadastrar/editar** registros
- Gerenciar usuários pela aba "Usuários": resetar senhas, promover/rebaixar, remover

## Estrutura dos arquivos

```
digital-mais-painel/
├── index.html            → Página principal
├── style.css             → Estilos visuais
├── script.js             → Lógica do sistema
├── config.js             → Chaves do Supabase (EDITAR!)
├── supabase-setup.sql    → Script SQL para criar o banco
├── vercel.json           → Config do Vercel
├── .gitignore            → Arquivos ignorados pelo Git
└── README.md             → Este arquivo
```

## Segurança

- As senhas dos funcionários são armazenadas de forma criptografada (hash SHA-256)
- O Supabase aplica Row Level Security (RLS) para que ninguém consiga modificar dados sem autenticação
- A chave `anon public` do Supabase pode ficar exposta no navegador — isso é normal e seguro
- **NUNCA** compartilhe a chave `service_role` (service key) do Supabase

## Suporte

Qualquer dúvida, abra uma conversa com a Claude novamente passando o link do repositório GitHub e o que você precisa ajustar.

---

**Digital+ Contabilidade**
