import { promptYesNo } from "../shared/userPrompt.ts"
import path from "path"
import os from "os"
import fs from "fs"
import { spawn, execSync, ChildProcess } from "child_process"

export interface IpfsNodeController {
	apiAddr: string
	stop: () => Promise<void>
	repoPath: string
	isTemporary: boolean
}

export async function startIpfsNode(): Promise<IpfsNodeController> {
	// 1. Decide temporary vs persistent
	let isTemporary: boolean | undefined = process.env.PINNER_IPFS_TEMPORARY
		? process.env.PINNER_IPFS_TEMPORARY === "true"
		: undefined
	if (isTemporary === undefined) {
		isTemporary = await promptYesNo("Should the IPFS node be temporary/disposable?")
	}

	// 2. Decide repo path
	const repoPath = isTemporary
		? path.join(os.tmpdir(), `ipfs-pinner-${Date.now()}`)
		: path.resolve(process.env.PINNER_IPFS_REPO || "./.pinner/ipfs/")

	// 3. Init repo if needed
	if (!fs.existsSync(repoPath)) {
		console.log(`[ipfs] Initializing IPFS repo at ${repoPath}...`)
		// For go-ipfs 0.34.1, '--repo' is not supported. Use IPFS_PATH env variable instead.
		execSync(`npx ipfs init --profile=server`, { env: { ...process.env, IPFS_PATH: repoPath } })
	}

	// 4. Start daemon
	// For go-ipfs 0.34.1, '--repo' is not supported. Use IPFS_PATH env variable instead.
	console.log(`[ipfs] Starting go-ipfs daemon...`)
	const daemon: ChildProcess = spawn(
		"ipfs",
		["daemon", "--enable-pubsub-experiment"],
		{ stdio: "inherit", env: { ...process.env, IPFS_PATH: repoPath } },
	)

	// 5. Wait for API to be ready (poll the API file)
	const apiFile = path.join(repoPath, "api")
	let apiAddr: string | undefined = undefined
	for (let i = 0; i < 30; i++) {
		if (fs.existsSync(apiFile)) {
			apiAddr = fs.readFileSync(apiFile, "utf8").trim()
			break
		}
		await new Promise((r) => setTimeout(r, 500))
	}
	if (!apiAddr) {
		daemon.kill()
		throw new Error("[ipfs] Failed to start IPFS daemon: API file not found")
	}

	// 6. Stop function
	async function stop() {
		daemon.kill()
		if (isTemporary && fs.existsSync(repoPath)) {
			fs.rmSync(repoPath, { recursive: true, force: true })
			console.log(`[ipfs] Deleted temporary repo at ${repoPath}`)
		}
	}

	return { apiAddr, stop, repoPath, isTemporary }
}
