// ESLint v9+ flat config
import js from "@eslint/js"
import tseslint from "@typescript-eslint/eslint-plugin"
import tsparser from "@typescript-eslint/parser"
import prettier from "eslint-config-prettier"
import globals from "globals"

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
	js.configs.recommended,
	{
		files: [
			"source/**/*.ts",
			"source/**/*.tsx",
			"source/**/*.js",
			"source/**/*.mjs",
			"source/**/*.cjs",
			"integration/**/*.ts",
			"integration/**/*.js",
			"test/**/*.ts",
			"test/**/*.js",
		],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				ecmaVersion: 2021,
				sourceType: "module",
			},
			globals: Object.fromEntries(
				Object.entries({ ...globals.node, ...globals.browser }).filter(([k]) => k.trim() === k),
			),
		},
		plugins: {
			"@typescript-eslint": tseslint,
		},
		rules: {
			...tseslint.configs.recommended.rules,
			semi: ["error", "never"],
			// Optionally relax some strict rules for tests
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/ban-ts-comment": "off",
			"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
			"no-undef": "off", // handled by TS
		},
	},
	prettier,
	{
		ignores: ["node_modules", "dist", "build", "*.js", "soljson-*.js"],
	},
]
