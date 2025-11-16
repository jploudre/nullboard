# ESLint Setup Design

**Date:** 2025-11-16
**Status:** Approved

## Overview

Set up ESLint with Airbnb style guide for strict code quality enforcement across the Nullboard JavaScript codebase.

## Goals

- Implement industry-standard JavaScript linting
- Enforce Airbnb style guide (strict mode)
- Auto-fix existing code to meet standards
- Integrate with existing tooling (matches Stylelint workflow)

## Configuration

### Packages

- `eslint` - Core linter
- `eslint-config-airbnb-base` - Airbnb style guide (base, no React)
- `eslint-plugin-import` - Required peer dependency

### ESLint Config (`.eslintrc.json`)

```json
{
  "extends": "airbnb-base",
  "env": {
    "browser": true,
    "es6": true
  }
}
```

Pure Airbnb standards with browser environment enabled.

### Ignore File (`.eslintignore`)

```
cash.min.js
node_modules/
```

Exclude third-party minified code.

## Expected Transformations

### Code Changes

1. **Indentation:** Tabs → 2 spaces
2. **Functions:** Traditional callbacks → Arrow functions
3. **Quotes:** Inconsistent → Single quotes
4. **Spacing:** Normalize per Airbnb standards
5. **Modern syntax:** Apply ES6+ patterns where applicable

### Files Affected

- `board.js`
- `functions.js`
- `drag.js`
- `sync-gist.js`
- `sync-ui.js`

## Implementation Phases

### Phase 1: Setup
1. Install npm packages
2. Create configuration files
3. Add npm scripts

### Phase 2: Auto-Fix
4. Run ESLint auto-fix on all files
5. Review changes
6. Fix remaining manual errors

### Phase 3: Integration
7. Document in README (if needed)
8. Commit configuration and fixed code

## Integration with Workflow

### NPM Scripts (to add)

```json
{
  "lint:js": "eslint *.js",
  "lint:js:fix": "eslint *.js --fix"
}
```

Matches existing Stylelint pattern.

## Trade-offs

### Chosen: Pure Airbnb (Full Modernization)

**Pros:**
- Industry-standard code style
- Modern, maintainable patterns
- Catches more potential bugs
- Better tooling support

**Cons:**
- Large initial diff
- Learning curve for Airbnb conventions
- May change code behavior if not careful (reviewed during fix)

### Rejected: Hybrid/Customized Config

Would preserve existing patterns (tabs, function syntax) but compromise on strictness.

## Success Criteria

- All JavaScript files pass `eslint` with zero errors
- Code follows Airbnb style guide
- NPM scripts work consistently
- No behavioral regressions introduced
