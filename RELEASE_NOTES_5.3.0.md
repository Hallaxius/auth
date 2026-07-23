# Release Notes - v5.3.0

**Release Date**: July 23, 2026

**Version**: 5.3.0

**Semver**: Minor release (backward compatible)

---

## Overview

This release focuses on **code organization**, **modularity**, and **developer experience** improvements. The entire codebase has been refactored into logical modules while maintaining 100% backward compatibility.

## Key Features

### 🏗️ Modular Architecture

The codebase has been reorganized into focused modules:

- `credentials/` - Credentials authentication logic
- `mfa/` - Multi-factor authentication (TOTP)
- `rate-limit/` - Rate limiting implementations
- `utils/` - Utility functions (PBKDF2, crypto, IP validation)
- `internal/` - Core internal utilities

### 🔒 Enhanced Security

- **Audit Logging**: Track security events for compliance
- **Security Headers**: Built-in middleware for production hardening
- **Environment Validation**: Stricter Zod schema for env vars
- **IP Validation**: Complete IPv4/IPv6 support with spoofing detection

### 🧪 Improved Testing

- Better test organization
- Focused test files for each module
- Improved coverage of edge cases
- Enhanced test utilities

### 📝 Documentation

- Updated production deployment guide
- Enhanced security documentation
- New migration guide for v5.3.0
- Improved JSDoc comments

## Installation

```bash
# Using Bun
bun add @hallaxius/auth@5.3.0

# Using npm
npm install @hallaxius/auth@5.3.0

# Using yarn
yarn add @hallaxius/auth@5.3.0
```

## Breaking Changes

**None** - This release is fully backward compatible with v5.2.x.

## Migration Guide

See the [Migration Guide](CHANGELOG.md#v52x-to-v530) in CHANGELOG.md for detailed migration steps.

## Security Advisories

No new security advisories in this release. All security improvements are backward compatible.

## Contributors

- @hallaxius (maintainer)

## Full Changelog

See [CHANGELOG.md](CHANGELOG.md) for the complete list of changes.

## Support

- **Documentation**: https://github.com/Hallaxius/auth#readme
- **Issues**: https://github.com/Hallaxius/auth/issues
- **Security**: security@hallaxius.dev

---

**Previous Release**: [v5.2.0](https://github.com/Hallaxius/auth/releases/tag/v5.2.0)
**Next Release**: TBD
