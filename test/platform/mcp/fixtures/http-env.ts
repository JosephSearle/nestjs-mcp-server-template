// Imported first by the HTTP specs. Config is validated when platform.module.ts is imported, so
// the environment must be set before that. Jest gives each test file its own process.env.
process.env.AUTH_ISSUER = "https://issuer.example.test";
