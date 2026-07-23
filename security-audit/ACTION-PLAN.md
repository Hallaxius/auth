# Plano de Ação - Correções Críticas

**Data:** 2026-07-23  
**Prioridade:** ALTA  
**Status:** Pendente

---

## 🚨 Correções Críticas (Iterações 71-75)

### 1. Security Audit - Formatação de Código

**Arquivos Afetados:** 12 arquivos  
**Impacto:** BAIXO (estilo)  
**Tempo Estimado:** 5 minutos

```bash
# Comando para corrigir automaticamente
bun run lint
```

**Arquivos:**
- [ ] `src/__tests__/middleware.test.ts`
- [ ] `src/credentials.ts`
- [ ] `src/internal/__tests__/client-coverage-gaps.test.ts`
- [ ] `src/internal/__tests__/client-full.test.ts`
- [ ] `src/internal/__tests__/client.test.ts`
- [ ] `src/internal/__tests__/crypto-aes.test.ts`
- [ ] `src/internal/__tests__/jwt-parsing.test.ts`
- [ ] `src/mfa.ts`
- [ ] `src/mfa/__tests__/mfa-coverage-gaps.test.ts`
- [ ] `src/mfa/__tests__/mfa.test.ts`
- [ ] `src/utils/utils.ts`

---

### 2. Test Failures - JWT Secret Length

**Arquivos Afetados:** 8 testes de Discord OAuth2  
**Impacto:** ALTO (bloqueante)  
**Tempo Estimado:** 10 minutos

**Problema:** Testes usando secret de 29 caracteres quando o mínimo é 32

**Solução:** Atualizar o secret em todos os testes

```typescript
// ANTES (linha 71 em vários arquivos)
const TEST_SECRET = process.env.TEST_SECRET || "fallback-32-char-secret-key!!";

// DEPOIS
const TEST_SECRET = process.env.TEST_SECRET || "fallback-32-char-secret-key!!!"; // 32 chars
```

**Arquivos para corrigir:**
- [ ] `src/__tests__/discord.test.ts`
- [ ] `src/mfa/__tests__/mfa.test.ts`
- [ ] `src/mfa/__tests__/mfa-coverage-gaps.test.ts`
- [ ] `src/__tests__/brute-force-methods.test.ts`
- [ ] `src/__tests__/middleware.test.ts`

---

### 3. Test Failures - Missing Vitest Imports

**Arquivos Afetados:** 2 arquivos  
**Impacto:** ALTO (todos os testes falham)  
**Tempo Estimado:** 5 minutos

**Solução:** Adicionar import do vitest

```typescript
// Adicionar no topo dos arquivos
import { vi, describe, it, expect, beforeEach } from "vitest";
```

**Arquivos:**
- [ ] `src/__tests__/password-reset.test.ts` (linha 1)
- [ ] `src/adapters/cache/__tests__/memory.test.ts` (linha 1)

---

### 4. Test Failures - Module Resolution

**Arquivos Afetados:** 8 arquivos de teste  
**Impacto:** ALTO (testes não rodam)  
**Tempo Estimado:** 15 minutos

**Problema:** Caminhos de importação incorretos

**Solução:** Corrigir imports relativos

```typescript
// ANTES
import { credentials } from "../credentials";

// DEPOIS (ajustar baseado na estrutura)
import { credentials } from "../../credentials";
```

**Arquivos:**
- [ ] `src/credentials/__tests__/credentials-client-coverage.test.ts`
- [ ] `src/credentials/__tests__/credentials-coverage.test.ts`
- [ ] `src/credentials/__tests__/credentials-edge.test.ts`
- [ ] `src/credentials/__tests__/credentials-error-handling.test.ts`
- [ ] `src/credentials/__tests__/credentials.test.ts`
- [ ] `src/mfa/__tests__/mfa-coverage-gaps.test.ts`
- [ ] `src/mfa/__tests__/mfa-rate-limiting.test.ts`
- [ ] `src/rate-limit/__tests__/rate-limit-concurrent.test.ts`
- [ ] `src/rate-limit/__tests__/rate-limit-full.test.ts`
- [ ] `src/rate-limit/__tests__/rate-limit.test.ts`

---

### 5. Syntax Error - MFA Test

**Arquivo:** `src/mfa/__tests__/mfa.test.ts`  
**Linha:** 71  
**Impacto:** ALTO  
**Tempo Estimado:** 2 minutos

**Problema:** Operador `||` em posição inválida

```typescript
// ANTES (linha 71)
secret: overrides.secret ?? process.env.TEST_SECRET || "fallback-32-char-secret-key!!",

// DEPOIS
secret: overrides.secret ?? (process.env.TEST_SECRET || "fallback-32-char-secret-key!!"),
```

---

### 6. Brute Force Logic - Functional Issues

**Arquivo:** `src/credentials.ts`  
**Impacto:** CRÍTICO (segurança)  
**Tempo Estimado:** 30 minutos

**Problemas:**
1. `recordAttempt` não reseta contador no sucesso
2. `recordAttempt` não bloqueia após maxAttempts
3. Retorno inconsistente (undefined vs objeto)

**Solução:** Revisar implementação do BruteForceProtection

```typescript
// Verificar método recordAttempt em src/credentials.ts
// Garantir que:
// 1. Reseta contador após sucesso
// 2. Bloqueia após maxAttempts
// 3. Retorna { allowed: boolean, retryAfter?: number }
```

---

### 7. Middleware Response - Authentication Flow

**Arquivo:** `src/middleware.ts`  
**Impacto:** ALTO (fluxo de auth)  
**Tempo Estimado:** 20 minutos

**Problema:** Middleware retornando redirect (302) quando deveria retornar undefined

**Solução:** Revisar lógica de validação de sessão

```typescript
// Verificar:
// 1. Validação de cookies múltiplos
// 2. Verificação de roles
// 3. Resposta para sessões válidas (undefined)
// 4. Resposta para sessões inválidas (Response 302 ou 403)
```

---

## ✅ Validações (Iterações 76-80)

### 8. Type Safety - Already Passing ✅

**Status:** ✅ PASS  
**Comando:** `bun run typecheck`  
**Erros:** 0

---

### 9. Build Optimization - Already Passing ✅

**Status:** ✅ PASS  
**Bundle Size:** 1.52 MB (< 2MB target)  
**Build Time:** 135ms  
**Módulos:** 777

---

### 10. Test Coverage - Needs Improvement

**Status:** ❌ FAIL  
**Testes Passando:** ~65%  
**Meta:** 100%

**Ações:**
- [ ] Corrigir todos os testes falhando (itens 2-7 acima)
- [ ] Adicionar testes de integração Redis
- [ ] Melhorar cobertura de caminhos de erro
- [ ] Executar `bun test --coverage` após correções

---

## 📋 Checklist de Validação Final

Após todas as correções, executar:

```bash
# 1. Type check
bun run typecheck

# 2. Lint
bun run lint:check

# 3. Tests
bun test

# 4. Build
bun run build

# 5. Audit
bun audit

# 6. Coverage (opcional)
bun test --coverage
```

**Critérios de Aceite:**
- [ ] 0 erros de TypeScript
- [ ] 0 erros de lint
- [ ] 100% testes passando
- [ ] Build bem-sucedido
- [ ] 0 vulnerabilidades
- [ ] Bundle < 2MB

---

## 📊 Métricas de Progresso

| Categoria | Antes | Depois (Meta) | Status |
|-----------|-------|---------------|--------|
| Testes Passando | 65% | 100% | ❌ → ✅ |
| Formatação | 12 erros | 0 erros | ⚠️ → ✅ |
| Type Safety | 100% | 100% | ✅ → ✅ |
| Build | 1.52MB | < 2MB | ✅ → ✅ |
| Security | 0 vulns | 0 vulns | ✅ → ✅ |
| OWASP Top 10 | 9/10 | 10/10 | ⚠️ → ✅ |

---

## 🎯 Próximos Passos

1. **Imediato (Hoje):**
   - [ ] Executar `bun run lint` para corrigir formatação
   - [ ] Corrigir JWT secrets nos testes
   - [ ] Adicionar imports vitest faltando
   - [ ] Corrigir syntax error no mfa.test.ts

2. **Curto Prazo (2-3 dias):**
   - [ ] Corrigir module resolution
   - [ ] Fix brute force logic
   - [ ] Fix middleware responses
   - [ ] Rodar todos os testes

3. **Médio Prazo (1 semana):**
   - [ ] Adicionar security logging
   - [ ] Melhorar cobertura de testes
   - [ ] Documentar OWASP compliance
   - [ ] Atualizar TypeScript

---

**Responsável:** Equipe de Desenvolvimento  
**Revisão:** 2026-07-30  
**Status:** Aguardando Início
