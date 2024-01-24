# Radius Dashboard testing, linting, and formatting

## Testing

**Run tests:**

```
yarn run test:all
```

**Run E2E tests:**

```
yarn run test:e2e
```

## Linting

This project is configured to use `eslint` for linting, along with recommended rules for React and TypeScript. This is checked as part of the pull-request process.

**Run the linter manually:**

```
yarn run lint:all
```

## Formatting

This project is configured to use `prettier` for code formatting. This is checked as part of the pull-request process.

**Run the formatter to find violations:**

```
yarn run format:check
```

**Run the formatter to automatically fix violations:**

```
yarn run format:write
```
