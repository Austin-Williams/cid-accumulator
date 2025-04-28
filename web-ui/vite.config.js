import { defineConfig } from "vite";
import { resolve } from "path";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
	base: "./",
	root: __dirname,
	plugins: [viteSingleFile()],
	build: {
		outDir: resolve(__dirname, "dist"),
		emptyOutDir: true,
		rollupOptions: {
			input: resolve(__dirname, "index.html"),
		},
	},
	server: {
		port: 5174,
		open: true,
	},
});
