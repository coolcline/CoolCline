# Webview UI

This is the React-based webview UI for CoolCline.

## Development

```bash
npm install
npm start
```

## Testing

```bash
npm test
```

## Known Issues

### DEP0040 Warnings During Tests

During test execution, you may see warnings about the deprecated `punycode` module:

```
[DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
```

This is a known issue caused by some development dependencies (eslint, jest, workbox-webpack-plugin) that use the deprecated `punycode` module internally. These warnings do not affect the functionality of the application and will be resolved when these dependencies update their implementations.

Affected dependencies:

- eslint -> ajv -> uri-js
- react-scripts -> jest -> jsdom -> tough-cookie/whatwg-url
- workbox-webpack-plugin -> source-map -> whatwg-url
