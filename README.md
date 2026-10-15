<h1 align="center">NestJS MCP Server Template</h1>

> A GitHub template for production MCP servers built on NestJS and `@rekog/mcp-nest`.

**Status:** pre-release (`0.x`). The template is under construction and doesn't serve MCP yet. Don't build production servers on it before `1.0.0`. [CHANGELOG.md](CHANGELOG.md) lists what has landed.

When finished, a server created from this template serves the [Model Context Protocol](https://modelcontextprotocol.io) over Streamable HTTP. It validates every bearer token itself, emits OpenTelemetry signals and deploys to Azure Container Apps. You write tools, resources and prompts in `src/app/`. Template releases update everything else.

Built with:

- [NestJS](https://nestjs.com) 12
- [`@rekog/mcp-nest`](https://www.npmjs.com/package/@rekog/mcp-nest) 2.0.8
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) v2
- [Biome](https://biomejs.dev) for linting and formatting
- [Jest](https://jestjs.io) for unit tests

## Table of contents

- [Install](#install)
  - [Dependencies](#dependencies)
- [Usage](#usage)
  - [Scripts](#scripts)
- [Project layout](#project-layout)
- [Contributing](#contributing)
- [License](#license)

## Install

1. Select **Use this template** on GitHub and create your repository.
2. Clone your new repository and install dependencies from its root:

   ```bash
   npm install
   ```

### Dependencies

- Node.js 22.19 or newer. `.nvmrc` pins 22.19.0, so `nvm use` selects it. `npm install` fails on older versions.
- npm, which ships with Node.js.

## Usage

Build and start the server:

```bash
npm run build
npm start
```

```text
[Nest] 19992  - 15/10/2026, 11:29:11     LOG [NestFactory] Starting Nest application...
[Nest] 19992  - 15/10/2026, 11:29:11     LOG [InstanceLoader] AppModule dependencies initialized +5ms
[Nest] 19992  - 15/10/2026, 11:29:11     LOG [InstanceLoader] PlatformModule dependencies initialized +0ms
[Nest] 19992  - 15/10/2026, 11:29:11     LOG [NestApplication] Nest application successfully started +71ms
```

The server listens on port 3000, or on `PORT` if set. It has no routes yet, so every request returns 404:

```bash
curl http://localhost:3000/
```

```json
{"message":"Cannot GET /","error":"Not Found","statusCode":404}
```

### Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Run the HTTP server with watch |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run `dist/main.js` |
| `npm run lint` | Lint and check formatting with Biome |
| `npm run format` | Format with Biome |
| `npm run typecheck` | Type-check with `tsc` |
| `npm test` | Run the Jest unit tests |

## Project layout

- `src/platform/` is template-owned. Template releases update it.
- `src/app/` is yours. Template releases never touch it after you create your server.
- `src/app/app.module.ts` is the one seam between the two.

Keep your changes in `src/app/` and template upgrades merge cleanly. [ADR-0001](docs/adr/0001-platform-app-split.md) explains the split. Other decisions live in [docs/adr/](docs/adr/).

## Contributing

Contributions are welcome.

1. Open an issue first. Pick the matching form under [Issues](https://github.com/JosephSearle/nestjs-mcp-server-template/issues/new/choose).
2. Branch from `main`, one branch per issue.
3. Run the checks before opening a pull request:

   ```bash
   npm run lint && npm run typecheck && npm test && npm run build
   ```

4. Open a pull request that links the issue, and fill in the template.

## License

[Apache-2.0](LICENSE) © 2026 Joseph Searle
