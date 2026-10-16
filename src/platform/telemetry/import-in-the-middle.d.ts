// The package ships these types as register-hooks.d.ts, which TypeScript doesn't pair with the
// .mjs path Node loads.
declare module "import-in-the-middle/register-hooks.mjs" {
	export * from "import-in-the-middle/register-hooks";
}
