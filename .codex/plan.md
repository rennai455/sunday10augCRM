# Phase 2 Stabilization Plan

## Critical Security Fixes (Immediate)
1. **Remove tracked .env file** - This is a security emergency
   - Remove .env from git tracking
   - Ensure .gitignore properly excludes environment files
   - Verify no secrets remain in git history (document if found)

## Tooling Baseline (High Priority)
2. **Create .npmrc** - Pin registry to https://registry.npmjs.org/
3. **Fix ESLint configuration** - Resolve module type mismatch
   - Add "type": "module" to package.json OR
   - Convert eslint.config.js to CommonJS format
4. **Fix Jest setup** - Resolve missing jest executable
   - Verify jest is properly installed
   - Fix test scripts or add missing dependencies

## Dependencies (Medium Priority)  
5. **Apply safe updates** - Patch/minor versions only
   - concurrently: 9.2.0 → 9.2.1
   - cssnano: 7.1.0 → 7.1.1  
   - redis: 5.8.0 → 5.8.2
   - tailwindcss: 4.1.11 → 4.1.12

## Code Quality (Medium Priority)
6. **Fix critical lint errors** - Focus on server.js and core files
   - Remove unused variables
   - Fix escape character issues
   - Address module/environment mismatches
7. **Improve ESLint configuration** - Add environment-specific configs
   - Browser environment for client scripts
   - Node environment for server scripts
   - Service worker environment for SW

## CI/Build (Low Priority)
8. **Update CI workflow** - Handle installation issues
   - Add fallback for chromedriver failures
   - Consider skipping problematic optional dependencies
9. **Add smoke tests** - Basic health endpoint tests
   - Test /health and /readiness endpoints
   - Verify no .env file exposure

## Documentation
10. **Create audit artifacts** - Record all changes and remaining issues

## Non-Goals for This PR
- Major version upgrades (document separately)
- Full formatting of untouched files
- Comprehensive test suite additions
- Performance optimizations
- New features

## Success Criteria
- [ ] No tracked secrets in repository
- [ ] CI passes with Node 20
- [ ] Core lint errors resolved
- [ ] Safe dependency updates applied
- [ ] Registry properly pinned
- [ ] Basic smoke tests pass