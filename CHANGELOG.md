# Changelog

All notable changes to @hallaxius/auth are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.3.0] - 2026-07-23

### Added

- **Modular Architecture**: Reorganized codebase into modular directories (credentials/, mfa/, rate-limit/)
- **Environment Validation**: Enhanced Zod schema for environment variables with strict validation
- **Audit Logging**: New audit logger for security events and compliance tracking
- **PBKDF2 Utils**: Dedicated PBKDF2 module for password hashing with RFC 8587 compliance
- **Security Headers**: Built-in security headers middleware for production deployments
- **Enhanced IP Validation**: Complete IPv4/IPv6 validation with spoofing detection
- **JWT Utilities**: Improved JWT parsing and validation utilities
- **Cookie Validation**: Enhanced cookie handling with strict validation
- **Crypto Utils**: AES encryption utilities for session token encryption

### Changed

- **Code Organization**: Major refactoring for better maintainability and modularity
- **Test Coverage**: Improved test organization with focused test files
- **Type Safety**: Enhanced TypeScript types across all modules
- **Error Handling**: Consistent error handling patterns throughout the codebase
- **Documentation**: Updated production deployment and security guides

### Improved

- **Performance**: Optimized crypto operations and JWT handling
- **Security**: Enhanced input validation and sanitization
- **Developer Experience**: Better error messages and debugging tools
- **Code Quality**: Removed dead code, improved naming, and reduced complexity

### Fixed

- Edge cases in IP validation and rate limiting
- Cookie parsing and validation issues
- JWT token parsing edge cases
- Test coverage gaps in critical modules

## [5.2.0] - 2026-07-23

### [Security] Fixed

- **JWT Expiry Hardening**: Reduced default access token expiry to 15 minutes
- **IP Spoofing Prevention**: Added X-Forwarded-For validation with trusted proxy support
- **Session Token Encryption**: Upgraded to AES-256-GCM for session encryption
- **State Parameter Validation**: Enhanced OAuth2 state parameter with configurable salt
- **Rate Limiting**: Fixed race condition in sliding window algorithm

### Changed

- Default JWT expiry reduced from 1 hour to 15 minutes for access tokens
- PBKDF2 iterations increased to 100,000 for password hashing
- Session cookies now default to `sameSite: 'lax'`
- Improved error messages to prevent information leakage

### Added

- `trustProxy` configuration option for reverse proxy deployments
- `trustedProxies` array for IP whitelist configuration
- `AUTH_STATE_SALT` environment variable for OAuth2 state parameter
- Redis support for distributed rate limiting and session revocation
- Health check endpoint example in documentation

## [5.1.0] - 2026-07-20

### Added

- Multi-factor authentication (MFA) with TOTP support
- Password reset flow with email tokens
- Enhanced rate limiting with sliding window algorithm
- Token refresh endpoint with rotation
- Session revocation (logout) endpoint

### Changed

- Improved TypeScript types for better DX
- Updated Zod schemas for stricter validation
- Enhanced error handling with consistent response format

## [5.0.0] - 2026-07-15

### [Breaking] Changed

- **Test Framework**: Migrated from Jest to Vitest
- **Package Manager**: Now optimized for Bun (also works with npm/yarn)
- **Module System**: Full ESM support

### Added

- Comprehensive input validation with Zod
- Discord OAuth2 adapter with PKCE support
- JWT session adapter with encryption
- In-memory rate limiting adapter
- Brute force protection adapter

### Removed

- Legacy CommonJS support
- Deprecated callback-based APIs

## [4.0.0] - 2026-07-10

### [Breaking] Changed

- Complete rewrite with strategy pattern
- New adapter-based architecture
- Simplified API surface

### Added

- Multiple authentication strategies (JWT, Session, OAuth2)
- Pluggable storage adapters (Memory, Redis, Database)
- Configurable rate limiting
- MFA support (TOTP)

## [3.0.1] - 2026-07-05

### Fixed

- Dead code removal
- Unused variable cleanup
- Deprecated export removal

## [3.0.0] - 2026-07-01

### [Breaking] Changed

- Complete architecture rewrite
- Separate factory pattern for each adapter
- AuthStrategy enum for type safety

### Added

- Redis StateStore adapter
- Redis BruteForce adapter
- Enhanced security headers

## [2.0.0] - 2026-06-25

### [Breaking] Changed

- Merged authentication strategies into unified interface
- Simplified configuration API

### Added

- Password reset with email tokens
- Enhanced session management
- Improved error handling

## [1.0.0] - 2026-06-20

### Added

- Initial release
- JWT authentication strategy
- Session authentication strategy
- OAuth2 authentication strategy
- Basic rate limiting
- In-memory storage

---

## Migration Guides

### v5.2.x to v5.3.0

**Non-Breaking Changes:**

This release focuses on code organization and internal improvements. No breaking changes are introduced.

1. **Modular Structure**: Code has been reorganized into logical modules for better maintainability
   ```typescript
   // Imports remain the same - no changes required
   import { createAuth, authMiddleware } from '@hallaxius/auth';
   ```

2. **New Utilities**: Additional utility modules are now available
   ```typescript
   // New: Audit logging for compliance
   import { auditLogger } from '@hallaxius/auth/utils';
   
   // New: Enhanced security headers
   import { securityHeaders } from '@hallaxius/auth/middleware';
   
   // New: PBKDF2 utilities
   import { hashPassword, verifyPassword } from '@hallaxius/auth/utils/pbkdf2';
   ```

3. **Environment Validation**: Stricter environment variable validation
   ```bash
   # Ensure all required env vars are set
   JWT_SECRET=your-secure-secret
   AUTH_STATE_SALT=your-secure-salt
   NODE_ENV=production
   ```

4. **Enhanced Types**: Better TypeScript support
   ```typescript
   // More precise types for better DX
   const auth = createAuth({
     // TypeScript now provides better autocomplete and error messages
   });
   ```

**Recommendations:**

- Update to benefit from improved error messages and debugging tools
- Review new audit logging features for compliance requirements
- Consider enabling security headers middleware for production

### v4.x to v5.0.0

**Breaking Changes:**

1. **Test Framework Migration**: Tests now use Vitest instead of Jest
   ```bash
   # Update test scripts
   bun test # instead of npm test
   ```

2. **ESM Only**: Package now only supports ESM
   ```javascript
   // Old (CJS)
   const { createAuth } = require('@hallaxius/auth');
   
   // New (ESM)
   import { createAuth } from '@hallaxius/auth';
   ```

3. **Bun Optimized**: While still compatible with Node.js, the package is optimized for Bun runtime

### v3.x to v4.0.0

**Breaking Changes:**

1. **Architecture Rewrite**: Strategy pattern replaced with adapter pattern
   ```typescript
   // Old (v3)
   const auth = createAuth({
     strategy: 'jwt',
     // ...
   });
   
   // New (v4)
   const auth = createAuth({
     session: {
       adapter: 'jwt',
       // ...
     },
   });
   ```

2. **Separate Factories**: Each adapter now has its own factory function
   ```typescript
   import {
     createJwtSessionAdapter,
     createRedisStateStore,
   } from '@hallaxius/auth';
   ```

3. **AuthStrategy Enum**: Use enum for type safety
   ```typescript
   import { AuthStrategy } from '@hallaxius/auth';
   
   const strategy = AuthStrategy.JWT;
   ```

### v2.x to v3.0.0

**Breaking Changes:**

1. **Unified Interface**: Multiple strategies merged into one
   ```typescript
   // Old (v2)
   const jwtAuth = createJwtAuth({ /* ... */ });
   const sessionAuth = createSessionAuth({ /* ... */ });
   
   // New (v3)
   const auth = createAuth({
     strategy: 'jwt', // or 'session'
     // ...
   });
   ```

---

## Security Advisories

### [2026-07-23] JWT Expiry Hardening

**Affected Versions**: < 5.2.0

**Issue**: Default JWT expiry of 1 hour was too long for sensitive operations.

**Recommendation**: Update to v5.2.0+ or manually configure shorter expiry:
```typescript
const auth = createAuth({
  session: {
    jwt: {
      expiresIn: '15m', // 15 minutes
    },
  },
});
```

### [2026-07-23] IP Spoofing Prevention

**Affected Versions**: < 5.2.0

**Issue**: X-Forwarded-For header was not validated, allowing IP spoofing.

**Recommendation**: Update to v5.2.0+ and configure trusted proxies:
```bash
TRUSTED_PROXIES=127.0.0.1,10.0.0.0/8,172.16.0.0/12
```

```typescript
const auth = createAuth({
  trustProxy: true,
  trustedProxies: ['127.0.0.1', '10.0.0.0/8'],
});
```

---

## Version Support

| Version | Supported | Security Updates Until |
|---------|-----------|------------------------|
| 5.x     | ✅ Yes    | Latest                 |
| 4.x     | ⚠️ Limited | 2026-12-31            |
| 3.x     | ❌ No     | -                      |
| 2.x     | ❌ No     | -                      |
| 1.x     | ❌ No     | -                      |

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Release Process

1. Create a branch: `gh branch create release/vX.Y.Z`
2. Update CHANGELOG.md with changes
3. Update version in package.json
4. Create PR and get approval
5. Tag release: `gh release create vX.Y.Z`
6. Publish to npm: `bun publish`

---

**Full Changelog**: [GitHub Releases](https://github.com/Hallaxius/auth/releases)