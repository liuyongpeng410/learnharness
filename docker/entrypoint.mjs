/**
 * Prepare the named volume, then start the standalone server.
 *
 * Docker injects HOSTNAME with the container hostname. Next's standalone
 * server binds that value, so this process passes HOSTNAME=0.0.0.0 only to
 * the server. The host publish stays 127.0.0.1 in compose.yaml.
 *
 * Credentials stay empty until someone saves them in the running app.
 * An existing auth file is never rewritten.
 */
import { spawn, execFileSync } from "node:child_process";
import { closeSync, lchownSync, lstatSync, mkdirSync, openSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const APP_DIR = "/app";
const VOLUME_DIR = "/var/lib/learnharness";
const DATA_DIR = process.env.LH_DATA_DIR ?? join(VOLUME_DIR, "data");
const AUTH_FILE = process.env.LH_AUTH_FILE ?? join(VOLUME_DIR, "auth.json");

function account(name) {
	const uid = Number(execFileSync("id", ["-u", name], { encoding: "utf8" }).trim());
	const gid = Number(execFileSync("id", ["-g", name], { encoding: "utf8" }).trim());
	if (!Number.isInteger(uid) || !Number.isInteger(gid)) throw new Error(`Could not resolve user ${name}`);
	return { uid, gid };
}

function chownTree(path, uid, gid) {
	const stat = lstatSync(path);
	lchownSync(path, uid, gid);
	if (!stat.isDirectory() || stat.isSymbolicLink()) return;
	for (const name of readdirSync(path)) chownTree(join(path, name), uid, gid);
}

function ensureEmptyAuth(path) {
	mkdirSync(dirname(path), { recursive: true });
	try {
		const fd = openSync(path, "wx", 0o600);
		try {
			writeFileSync(fd, "{}\n");
		} finally {
			closeSync(fd);
		}
	} catch (error) {
		if (error?.code !== "EEXIST") throw error;
	}
}

const nodeUser = account("node");
mkdirSync(DATA_DIR, { recursive: true });
ensureEmptyAuth(AUTH_FILE);
if (typeof process.getuid === "function" && process.getuid() === 0) {
	chownTree(VOLUME_DIR, nodeUser.uid, nodeUser.gid);
	process.initgroups?.("node", nodeUser.gid);
	process.setgid(nodeUser.gid);
	process.setuid(nodeUser.uid);
}

const child = spawn(process.execPath, ["server.js"], {
	cwd: APP_DIR,
	stdio: "inherit",
	env: {
		...process.env,
		HOME: "/home/node",
		USER: "node",
		LOGNAME: "node",
		NODE_ENV: "production",
		PORT: process.env.PORT || "3000",
		// Bind inside the container. compose.yaml publishes only 127.0.0.1:3000.
		HOSTNAME: "0.0.0.0",
		LH_DATA_DIR: DATA_DIR,
		LH_AUTH_FILE: AUTH_FILE,
		NEXT_TELEMETRY_DISABLED: "1",
	},
});

function stop(signal) {
	if (!child.killed) child.kill(signal);
}

for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => stop(signal));
child.on("exit", (code, signal) => {
	if (signal) {
		process.exit(1);
		return;
	}
	process.exit(code ?? 1);
});
