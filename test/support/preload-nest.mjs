// Nest 12 is ESM-only and @rekog/mcp-nest is CommonJS. Under Jest's VM modules, a CommonJS
// require() of an ESM package that is still loading fails as a cycle. Loading Nest first, before
// any test file, avoids it.
await import("@nestjs/common");
await import("@nestjs/core");
await import("@nestjs/microservices");
