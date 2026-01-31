// Environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const RIVET_CLOUD_TOKEN = process.env.RIVET_CLOUD_TOKEN!;
const RIVET_CLOUD_ENDPOINT = "https://cloud-api.rivet.dev";
const RIVET_ENGINE_ENDPOINT = process.env.RIVET_ENGINE_ENDPOINT || "https://api.rivet.dev";
const PLATFORM = process.env.PLATFORM;

if (!PLATFORM) {
	console.error("platform input is required");
	process.exit(1);
}
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const PR_NUMBER = process.env.PR_NUMBER; // Optional - not set for push to main
const BRANCH_NAME = process.env.BRANCH_NAME || "main";
const REPO_FULL_NAME = process.env.REPO_FULL_NAME!;
const RUN_ID = process.env.RUN_ID!;
const MAIN_BRANCH = process.env.MAIN_BRANCH || "main";

// Runner config overrides (any JSON object, passed directly to API)
const RUNNER_CONFIG: Record<string, any> = (() => {
	try {
		return JSON.parse(process.env.RUNNER_CONFIG || "{}");
	} catch (e) {
		console.error("Failed to parse RUNNER_CONFIG:", e);
		return {};
	}
})();

// Validate platform
const SUPPORTED_PLATFORMS = ["vercel"];
if (!SUPPORTED_PLATFORMS.includes(PLATFORM)) {
	console.error(`Unsupported platform: "${PLATFORM}". Currently supported platforms: ${SUPPORTED_PLATFORMS.join(", ")}`);
	process.exit(1);
}

// Validate platform-specific requirements
if (PLATFORM === "vercel" && !VERCEL_TOKEN) {
	console.error("vercel-token is required when platform is 'vercel'");
	process.exit(1);
}

// Determine if this is a PR or main branch
const IS_PR = !!PR_NUMBER;
const IS_MAIN = BRANCH_NAME === MAIN_BRANCH;
const NAMESPACE_NAME = IS_PR ? `pr-${PR_NUMBER}` : "production";

const COMMENT_MARKER = "<!-- rivet-preview-status -->";

// Platform-specific project info
let PROJECT_ID: string;
let PROJECT_NAME: string;

// Vercel-specific info
let VERCEL_PROJECT_ID: string;
let VERCEL_TEAM_ID: string | undefined;
let VERCEL_PROJECT_NAME: string;
let VERCEL_TEAM_SLUG: string;

async function getVercelProjectInfo(): Promise<void> {
	// First, list all projects to find the one linked to this repo
	console.log(`Searching for Vercel project linked to: ${REPO_FULL_NAME}`);

	// Try searching with repo filter first
	let searchUrl = `https://api.vercel.com/v9/projects?repo=${encodeURIComponent(REPO_FULL_NAME)}`;

	let searchResponse = await fetch(searchUrl, {
		headers: {
			Authorization: `Bearer ${VERCEL_TOKEN}`,
		},
	});

	let searchResult = await searchResponse.json();

	// If no results, try listing all projects and filtering manually
	if (!searchResult.projects || searchResult.projects.length === 0) {
		console.log("No results with repo filter, listing all projects...");

		const listUrl = `https://api.vercel.com/v9/projects?limit=100`;
		const listResponse = await fetch(listUrl, {
			headers: {
				Authorization: `Bearer ${VERCEL_TOKEN}`,
			},
		});

		const listResult = await listResponse.json();

		// Find project with matching repo or name
		const matchingProject = listResult.projects?.find((p: any) => {
			const repoUrl = p.link?.repo;
			return repoUrl === REPO_FULL_NAME ||
				   repoUrl === `https://github.com/${REPO_FULL_NAME}` ||
				   p.name === REPO_FULL_NAME.split('/')[1];
		});

		if (matchingProject) {
			searchResult = { projects: [matchingProject] };
		}
	}

	if (!searchResult.projects || searchResult.projects.length === 0) {
		throw new Error(`No Vercel project found linked to GitHub repo: ${REPO_FULL_NAME}. Make sure the project is linked to this repo in Vercel.`);
	}

	const project = searchResult.projects[0];
	VERCEL_PROJECT_ID = project.id;
	VERCEL_PROJECT_NAME = project.name;
	VERCEL_TEAM_ID = project.accountId;

	// Set generic project info
	PROJECT_ID = VERCEL_PROJECT_ID;
	PROJECT_NAME = VERCEL_PROJECT_NAME;

	console.log(`Found Vercel project: ${VERCEL_PROJECT_NAME} (${VERCEL_PROJECT_ID})`);

	// Get team/user slug for URL generation
	if (VERCEL_TEAM_ID) {
		// Try to get team info
		const teamResponse = await fetch(
			`https://api.vercel.com/v2/teams/${VERCEL_TEAM_ID}`,
			{
				headers: {
					Authorization: `Bearer ${VERCEL_TOKEN}`,
				},
			}
		);

		if (teamResponse.ok) {
			const team = await teamResponse.json();
			VERCEL_TEAM_SLUG = team.slug;
			console.log(`Found Vercel team: ${VERCEL_TEAM_SLUG}`);
		} else {
			// Not a team, get user info
			const userResponse = await fetch(
				`https://api.vercel.com/v2/user`,
				{
					headers: {
						Authorization: `Bearer ${VERCEL_TOKEN}`,
					},
				}
			);

			if (!userResponse.ok) {
				throw new Error(`Failed to get Vercel user info: ${userResponse.status}`);
			}

			const user = await userResponse.json();
			VERCEL_TEAM_SLUG = user.user?.username || user.username;
			console.log(`Found Vercel user: ${VERCEL_TEAM_SLUG}`);
		}
	} else {
		// No team, get user info
		const userResponse = await fetch(
			`https://api.vercel.com/v2/user`,
			{
				headers: {
					Authorization: `Bearer ${VERCEL_TOKEN}`,
				},
			}
		);

		if (!userResponse.ok) {
			throw new Error(`Failed to get Vercel user info: ${userResponse.status}`);
		}

		const user = await userResponse.json();
		VERCEL_TEAM_SLUG = user.user?.username || user.username;
		console.log(`Found Vercel user: ${VERCEL_TEAM_SLUG}`);
	}

	console.log(`Detected Vercel project: ${VERCEL_PROJECT_NAME}, team/user: ${VERCEL_TEAM_SLUG}`);
}

// Platform-specific project info getter
async function getPlatformProjectInfo(): Promise<void> {
	switch (PLATFORM) {
		case "vercel":
			await getVercelProjectInfo();
			break;
		default:
			throw new Error(`Unsupported platform: ${PLATFORM}`);
	}
}

// Rivet Cloud API helpers
async function rivetCloudFetch(path: string, options: RequestInit = {}): Promise<any> {
	const url = `${RIVET_CLOUD_ENDPOINT}${path}`;

	const response = await fetch(url, {
		...options,
		headers: {
			Authorization: `Bearer ${RIVET_CLOUD_TOKEN}`,
			"Content-Type": "application/json",
			...options.headers,
		},
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Rivet Cloud API error: ${response.status} ${text}`);
	}

	return response.json();
}

// Rivet Engine API helpers
async function rivetEngineFetch(path: string, accessToken: string, options: RequestInit = {}): Promise<any> {
	const url = `${RIVET_ENGINE_ENDPOINT}${path}`;

	const response = await fetch(url, {
		...options,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
			...options.headers,
		},
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Rivet Engine API error: ${response.status} ${text}`);
	}

	return response.json();
}

// GitHub API helpers
async function getDisplayName(): Promise<string> {
	if (!IS_PR) {
		return "Production";
	}
	const response = await fetch(
		`https://api.github.com/repos/${REPO_FULL_NAME}/pulls/${PR_NUMBER}`,
		{
			headers: {
				Authorization: `token ${GITHUB_TOKEN}`,
				Accept: "application/vnd.github.v3+json",
			},
		}
	);
	const pr = await response.json();
	return pr.title || `PR #${PR_NUMBER}`;
}

async function findExistingComment(): Promise<number | null> {
	if (!IS_PR) return null;

	const response = await fetch(
		`https://api.github.com/repos/${REPO_FULL_NAME}/issues/${PR_NUMBER}/comments`,
		{
			headers: {
				Authorization: `token ${GITHUB_TOKEN}`,
				Accept: "application/vnd.github.v3+json",
			},
		}
	);
	const comments = await response.json();
	if (!Array.isArray(comments)) {
		console.log("Comments response:", comments);
		return null;
	}
	const existing = comments.find((c: any) => c.body?.includes(COMMENT_MARKER));
	return existing?.id ?? null;
}

async function updateComment(commentId: number | null, body: string): Promise<number | null> {
	if (!IS_PR) {
		console.log(body.replace(/\n/g, ' ').substring(0, 100));
		return null;
	}

	const fullBody = `${COMMENT_MARKER}\n${body}`;

	if (commentId) {
		await fetch(
			`https://api.github.com/repos/${REPO_FULL_NAME}/issues/comments/${commentId}`,
			{
				method: "PATCH",
				headers: {
					Authorization: `token ${GITHUB_TOKEN}`,
					Accept: "application/vnd.github.v3+json",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ body: fullBody }),
			}
		);
		return commentId;
	} else {
		const response = await fetch(
			`https://api.github.com/repos/${REPO_FULL_NAME}/issues/${PR_NUMBER}/comments`,
			{
				method: "POST",
				headers: {
					Authorization: `token ${GITHUB_TOKEN}`,
					Accept: "application/vnd.github.v3+json",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ body: fullBody }),
			}
		);
		const data = await response.json();
		return data.id;
	}
}

// Get Vercel deployment URL for a branch (prefers stable branch alias over unique deployment URL)
async function getVercelDeploymentUrl(branch: string, maxWaitMs: number = 120000): Promise<string> {
	const teamQuery = VERCEL_TEAM_ID ? `teamId=${VERCEL_TEAM_ID}` : "";
	const startTime = Date.now();

	while (Date.now() - startTime < maxWaitMs) {
		const response = await fetch(
			`https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&${teamQuery}&limit=10`,
			{
				headers: {
					Authorization: `Bearer ${VERCEL_TOKEN}`,
				},
			}
		);

		const { deployments } = await response.json();

		// Find any deployment for this branch
		const branchDeployment = deployments?.find((d: any) =>
			d.meta?.githubCommitRef === branch
		);

		if (branchDeployment) {
			// Get deployment details to find the stable branch alias
			const detailResponse = await fetch(
				`https://api.vercel.com/v13/deployments/${branchDeployment.uid}?${teamQuery}`,
				{
					headers: {
						Authorization: `Bearer ${VERCEL_TOKEN}`,
					},
				}
			);

			const detail = await detailResponse.json();
			console.log(`Deployment aliases: ${JSON.stringify(detail.alias)}`);

			// Prefer the branch-specific alias (contains -git-) which stays stable across deploys
			const branchAlias = detail.alias?.find((a: string) =>
				a.includes("-git-") && a.includes(VERCEL_PROJECT_NAME)
			);

			if (branchAlias) {
				return branchAlias;
			}

			// Fall back to the unique deployment URL if no alias yet
			if (detail.url) {
				console.log("No branch alias found, using deployment URL");
				return detail.url;
			}
		}

		// Wait before polling again
		console.log("Waiting for Vercel deployment...");
		await new Promise(resolve => setTimeout(resolve, 5000));
	}

	throw new Error(`Timed out waiting for Vercel deployment for branch: ${branch}`);
}

// Platform-specific deployment URL getter
async function getPlatformDeploymentUrl(branch: string): Promise<string> {
	switch (PLATFORM) {
		case "vercel":
			return await getVercelDeploymentUrl(branch);
		default:
			throw new Error(`Unsupported platform: ${PLATFORM}`);
	}
}

// Vercel API helpers
async function setVercelEnvVar(
	key: string,
	value: string,
	branch: string
): Promise<void> {
	const teamQuery = VERCEL_TEAM_ID ? `teamId=${VERCEL_TEAM_ID}` : "";
	const isProduction = IS_MAIN;
	const target = isProduction ? ["production"] : ["preview"];

	console.log(`Setting env var: ${key} (target: ${target.join(",")}, branch: ${isProduction ? "N/A" : branch})`);

	// Check if env var exists
	const listResponse = await fetch(
		`https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env?${teamQuery}`,
		{
			headers: {
				Authorization: `Bearer ${VERCEL_TOKEN}`,
			},
		}
	);
	const { envs } = await listResponse.json();

	// For production, match by target only; for preview, also match gitBranch
	const existing = envs?.find((e: any) => {
		if (e.key !== key) return false;
		if (isProduction) {
			return e.target?.includes("production");
		} else {
			return e.target?.includes("preview") && e.gitBranch === branch;
		}
	});

	if (existing) {
		// Update existing
		console.log(`  Updating existing env var (id: ${existing.id})`);
		const response = await fetch(
			`https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env/${existing.id}?${teamQuery}`,
			{
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${VERCEL_TOKEN}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ value }),
			}
		);
		if (!response.ok) {
			const text = await response.text();
			console.error(`  Failed to update env var: ${response.status} ${text}`);
		}
	} else {
		// Create new
		console.log(`  Creating new env var`);
		const envBody: any = {
			key,
			value,
			type: "encrypted",
			target,
		};
		// Only set gitBranch for preview deployments
		if (!isProduction) {
			envBody.gitBranch = branch;
		}
		const response = await fetch(
			`https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?${teamQuery}`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${VERCEL_TOKEN}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(envBody),
			}
		);
		if (!response.ok) {
			const text = await response.text();
			console.error(`  Failed to create env var: ${response.status} ${text}`);
		}
	}
}

// Create or get Vercel protection bypass secret
async function getOrCreateVercelBypassSecret(): Promise<string | null> {
	const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : "";

	// First, check if a bypass secret already exists
	const getResponse = await fetch(
		`https://api.vercel.com/v1/projects/${VERCEL_PROJECT_ID}/protection-bypass${teamQuery}`,
		{
			headers: {
				Authorization: `Bearer ${VERCEL_TOKEN}`,
			},
		}
	);

	if (getResponse.ok) {
		const data = await getResponse.json();
		const bypasses = Object.entries(data.protectionBypass || {});
		if (bypasses.length > 0) {
			console.log("  Found existing bypass secret");
			return bypasses[0][0];
		}
	}

	// Create a new bypass secret (empty body auto-generates)
	console.log("  Creating Vercel bypass secret...");
	const response = await fetch(
		`https://api.vercel.com/v1/projects/${VERCEL_PROJECT_ID}/protection-bypass${teamQuery}`,
		{
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${VERCEL_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({}),
		}
	);

	if (!response.ok) {
		const text = await response.text();
		console.log(`  Could not create bypass secret: ${response.status} ${text}`);
		return null;
	}

	const result = await response.json();

	// Get the first bypass secret
	const bypasses = Object.entries(result.protectionBypass || {});
	if (bypasses.length > 0) {
		console.log("  Created bypass secret");
		return bypasses[0][0];
	}

	return null;
}

// Platform-specific bypass secret getter
async function getPlatformBypassSecret(): Promise<string | null> {
	switch (PLATFORM) {
		case "vercel":
			return await getOrCreateVercelBypassSecret();
		default:
			return null;
	}
}

// Platform-specific env var setter
async function setPlatformEnvVars(
	endpoint: string,
	namespace: string,
	secretToken: string,
	publishableToken: string,
	branch: string
): Promise<void> {
	switch (PLATFORM) {
		case "vercel":
			await setVercelEnvVar("RIVET_ENDPOINT", endpoint, branch);
			await setVercelEnvVar("RIVET_NAMESPACE", namespace, branch);
			await setVercelEnvVar("RIVET_RUNNER_TOKEN", secretToken, branch);
			await setVercelEnvVar("RIVET_PUBLISHABLE_TOKEN", publishableToken, branch);
			break;
		default:
			throw new Error(`Unsupported platform: ${PLATFORM}`);
	}
}

// Fetch available datacenters from Rivet Engine API
async function getDatacenters(accessToken: string): Promise<string[]> {
	const response = await rivetEngineFetch("/datacenters", accessToken);
	console.log("  /datacenters response:", JSON.stringify(response, null, 2));
	return response.datacenters.map((dc: any) => dc.name);
}

// Configure runner for all datacenters
async function configureRunners(
	accessToken: string,
	namespace: string,
	deploymentUrl: string,
	bypassSecret: string | null
): Promise<void> {
	// Get all available datacenters
	console.log("  Fetching available datacenters...");
	const datacenterNames = await getDatacenters(accessToken);
	console.log(`  Found ${datacenterNames.length} datacenters: ${datacenterNames.join(", ")}`);

	// Build headers with bypass secret if available
	const headers: Record<string, string> = {};
	if (bypassSecret) {
		headers["x-vercel-protection-bypass"] = bypassSecret;
	}

	// Build the serverless config with defaults, then apply any overrides
	const serverlessConfig: Record<string, any> = {
		url: `https://${deploymentUrl}/api/rivet`,
		headers,
		min_runners: 0,
		max_runners: 100000,
		slots_per_runner: 1,
		request_lifespan: 270,
		runners_margin: 0,
		// Apply any overrides from runner-config
		...RUNNER_CONFIG,
	};

	// Merge headers from RUNNER_CONFIG with bypass header
	if (RUNNER_CONFIG.headers) {
		serverlessConfig.headers = { ...headers, ...RUNNER_CONFIG.headers };
	}

	// Ensure URL is always set correctly (can't be overridden)
	serverlessConfig.url = `https://${deploymentUrl}/api/rivet`;

	console.log("  Runner config:", JSON.stringify(serverlessConfig, null, 2));

	// Build datacenters config for all regions
	const datacentersConfig: Record<string, any> = {};
	for (const dc of datacenterNames) {
		datacentersConfig[dc] = {
			serverless: serverlessConfig,
		};
	}

	// Configure runner for all datacenters at once
	const requestBody = { datacenters: datacentersConfig };
	console.log("  PUT /runner-configs/default body:", JSON.stringify(requestBody, null, 2));
	const response = await fetch(`${RIVET_ENGINE_ENDPOINT}/runner-configs/default?namespace=${namespace}`, {
		method: "PUT",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Failed to configure runners: ${response.status} ${text}`);
	}

	console.log(`  Configured runners for ${datacenterNames.length} datacenters`);
}

// Main flow
async function main() {
	console.log("=== Rivet Preview Namespace Action ===");
	console.log(`Platform: ${PLATFORM}`);
	console.log(`Mode: ${IS_PR ? `PR #${PR_NUMBER}` : `Production (${MAIN_BRANCH} branch)`}`);
	console.log(`Branch: ${BRANCH_NAME}`);
	console.log(`Main branch: ${MAIN_BRANCH}`);
	console.log(`Is main: ${IS_MAIN}`);
	console.log(`Repo: ${REPO_FULL_NAME}`);
	console.log(`Namespace: ${NAMESPACE_NAME}`);
	console.log(`Rivet Engine Endpoint: ${RIVET_ENGINE_ENDPOINT}`);
	if (Object.keys(RUNNER_CONFIG).length > 0) {
		console.log(`Runner config overrides: ${JSON.stringify(RUNNER_CONFIG)}`);
	}
	console.log("");

	const runLogsUrl = `https://github.com/${REPO_FULL_NAME}/actions/runs/${RUN_ID}`;
	let commentId = await findExistingComment();

	try {
		// Step 1: Detect platform project
		console.log(`Step 1: Detecting ${PLATFORM} project...`);
		await getPlatformProjectInfo();

		// Step 2: Creating namespace
		const intro = IS_PR
			? `This PR has a Rivet namespace connected to your ${PLATFORM} deployment. [Learn more](https://rivet.dev/docs)\n\n`
			: `Rivet production namespace connected to ${PLATFORM}. [Learn more](https://rivet.dev/docs)\n\n`;
		const tableHeader = `| Project | Namespace | Status | Actions |\n|:--------|:----------|:-------|:-------|\n`;
		commentId = await updateComment(
			commentId,
			intro + tableHeader + `| \`${PROJECT_NAME}\` | - | Creating... | - |`
		);

		// Get project/org info from token
		console.log("");
		console.log("Step 2: Inspecting Rivet token...");
		const { project, organization } = await rivetCloudFetch("/tokens/api/inspect");
		console.log(`  Project: ${project}`);
		console.log(`  Organization: ${organization}`);

		// Check if namespace exists, create if not
		let namespace: any;
		let engineNamespace: string;

		// Get display name (16 chars max per cloud API)
		console.log("");
		console.log("Step 3: Creating/finding namespace...");
		const title = await getDisplayName();
		const displayName = title.substring(0, 16);
		console.log(`  Display name: "${displayName}" (from: "${title}")`);

		// Namespace metadata
		const namespaceMetadata: Record<string, any> = {
			skipOnboarding: true,
			provider: PLATFORM,
		};
		if (PLATFORM === "vercel") {
			namespaceMetadata.vercelProject = VERCEL_PROJECT_NAME;
		}
		if (IS_PR) {
			namespaceMetadata.prNumber = PR_NUMBER;
		}
		if (IS_MAIN) {
			namespaceMetadata.isProduction = true;
		}
		console.log(`  Metadata: ${JSON.stringify(namespaceMetadata)}`);

		try {
			console.log(`  Listing existing namespaces...`);
			const { namespaces } = await rivetCloudFetch(`/projects/${project}/namespaces?org=${organization}&limit=100`);
			console.log(`  Found ${namespaces?.length || 0} namespaces`);
			// Match by namespace name pattern
			const existing = namespaces?.find((ns: any) => ns.name.startsWith(`${NAMESPACE_NAME}-`));

			if (existing) {
				// Reuse existing namespace - fetch full details
				const { namespace: fullNs } = await rivetCloudFetch(`/projects/${project}/namespaces/${existing.name}?org=${organization}`);
				namespace = fullNs;
				engineNamespace = namespace.access?.engineNamespaceName || namespace.name;
				console.log(`Reusing existing namespace ${namespace.name}`);
			} else {
				// Create new namespace
				const result = await rivetCloudFetch(`/projects/${project}/namespaces?org=${organization}`, {
					method: "POST",
					body: JSON.stringify({
						name: NAMESPACE_NAME,
						displayName,
						metadata: namespaceMetadata,
					}),
				});
				namespace = result.namespace;
				engineNamespace = namespace.access?.engineNamespaceName || namespace.name;
				console.log(`Created namespace ${namespace.name} (${displayName})`);
			}
		} catch (e: any) {
			console.log(`Error listing namespaces, trying to create: ${e.message}`);
			// If list fails, try to create
			const result = await rivetCloudFetch(`/projects/${project}/namespaces?org=${organization}`, {
				method: "POST",
				body: JSON.stringify({
					name: NAMESPACE_NAME,
					displayName,
					metadata: namespaceMetadata,
				}),
			});
			namespace = result.namespace;
			engineNamespace = namespace.access?.engineNamespaceName || namespace.name;
			console.log(`Created namespace ${namespace.name} (${displayName})`);
		}

		// Create tokens (always create fresh ones)
		console.log("");
		console.log("Step 4: Creating tokens...");
		const { token: secretToken } = await rivetCloudFetch(
			`/projects/${project}/namespaces/${namespace.name}/tokens/secret?org=${organization}`,
			{
				method: "POST",
				body: JSON.stringify({ name: `${NAMESPACE_NAME}-runner-token` }),
			}
		);

		const { token: publishableToken } = await rivetCloudFetch(
			`/projects/${project}/namespaces/${namespace.name}/tokens/publishable?org=${organization}`,
			{ method: "POST", body: JSON.stringify({}) }
		);

		const { token: accessToken } = await rivetCloudFetch(
			`/projects/${project}/namespaces/${namespace.name}/tokens/access?org=${organization}`,
			{ method: "POST", body: JSON.stringify({}) }
		);

		console.log("  Created: secret, publishable, and access tokens");

		// Step 5: Configure platform env vars
		console.log("");
		console.log(`Step 5: Setting ${PLATFORM} environment variables...`);
		const dashboardUrl = `https://dashboard.rivet.dev/orgs/${organization}/projects/${project}/ns/${namespace.name}?skipOnboarding=1`;
		commentId = await updateComment(
			commentId,
			intro + tableHeader + `| \`${PROJECT_NAME}\` | \`${namespace.name}\` | Configuring ${PLATFORM}... | <a href="${dashboardUrl}" target="_blank">Dashboard</a> |`
		);

		await setPlatformEnvVars(RIVET_ENGINE_ENDPOINT, engineNamespace, secretToken, publishableToken, BRANCH_NAME);

		console.log("  Done setting env vars");

		// Step 6: Wait for platform deployment and configure runner
		console.log("");
		console.log(`Step 6: Waiting for ${PLATFORM} deployment...`);
		commentId = await updateComment(
			commentId,
			intro + tableHeader + `| \`${PROJECT_NAME}\` | \`${namespace.name}\` | Waiting for ${PLATFORM}... | <a href="${dashboardUrl}" target="_blank">Dashboard</a> |`
		);

		const deploymentUrl = await getPlatformDeploymentUrl(BRANCH_NAME);
		console.log(`  Got ${PLATFORM} deployment URL: ${deploymentUrl}`);

		// Step 7: Get bypass secret for deployment protection
		console.log("");
		console.log("Step 7: Configuring deployment protection bypass...");
		const bypassSecret = await getPlatformBypassSecret();

		// Step 8: Configure runner for all regions
		console.log("");
		console.log("Step 8: Configuring Rivet runners...");
		commentId = await updateComment(
			commentId,
			intro + tableHeader + `| \`${PROJECT_NAME}\` | \`${namespace.name}\` | Configuring runners... | <a href="${dashboardUrl}" target="_blank">Dashboard</a> |`
		);

		await configureRunners(accessToken, engineNamespace, deploymentUrl, bypassSecret);

		console.log("  Runners configured");

		// Step 9: Success!
		console.log("");
		console.log("=== Success! ===");
		console.log(`  Namespace: ${namespace.name}`);
		console.log(`  Engine namespace: ${engineNamespace}`);
		console.log(`  ${PLATFORM} URL: ${deploymentUrl}`);
		console.log(`  Dashboard: ${dashboardUrl}`);
		await updateComment(
			commentId,
			intro + tableHeader + `| \`${PROJECT_NAME}\` | \`${namespace.name}\` | Ready | <a href="${dashboardUrl}" target="_blank">Dashboard</a> |`
		);
	} catch (error: any) {
		console.error("Error:", error);

		const errorIntro = `This PR has a Rivet namespace connected to your ${PLATFORM} deployment. [Learn more](https://rivet.dev/docs)\n\n`;
		const errorHeader = `| Project | Namespace | Status | Actions |\n|:--------|:----------|:-------|:-------|\n`;
		const projectName = PROJECT_NAME || "unknown";
		await updateComment(
			commentId,
			errorIntro + errorHeader + `| \`${projectName}\` | - | Failed | [Logs](${runLogsUrl}) |`
		);

		process.exit(1);
	}
}

main();
