import { defineConfig } from "vite";
import { resolve } from "path";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
	base: "./",
	root: __dirname,
	plugins: [viteSingleFile()],
	build: {
		// Disable minification so output remains human-readable
		minify: false,
		outDir: resolve(__dirname, "dist"),
		emptyOutDir: true,
		rollupOptions: {
			input: resolve(__dirname, "index.html"),
		},
	},
	server: {
		// bind to 127.0.0.1 instead of localhost
		host: '127.0.0.1',
		port: 5174,
		open: true,
	},
});
