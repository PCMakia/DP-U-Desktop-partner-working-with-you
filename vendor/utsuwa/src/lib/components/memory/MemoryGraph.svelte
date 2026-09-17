<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { OWNER_PERSON_KEY } from '$lib/alice-yue/memory/keys';
	import {
		buildMentionLinks,
		identityColor,
		mergeOverviewClusters,
		mergePersonFacts,
		toIdentityNodes,
		unionMentionLinks,
		type IdentityCluster,
		type MentionLink,
		type PersonOverview,
		type StoredFact
	} from '$lib/alice-yue/memory/overview';
	import { getFacts } from '$lib/services/storage/memory';
	import type { FactCategory } from '$lib/types/memory';
	import {
		buildGraph,
		filterGraph,
		getConnectedNodes,
		getFactsForPersonGraph,
		categoryColors,
		type GraphData,
		type GraphNode,
		type GraphFilters
	} from '$lib/services/memory-graph';

	type GraphView = 'overview' | 'person';
	type ForceNode = IdentityCluster | GraphNode;

	let container: HTMLDivElement;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let graph: any = null;
	let view = $state<GraphView>('overview');
	let activePerson = $state<IdentityCluster | null>(null);
	let overviewNodes = $state<IdentityCluster[]>([]);
	let overviewLinks = $state<MentionLink[]>([]);
	let graphData = $state<GraphData>({ nodes: [], links: [] });
	let fullGraphData = $state<GraphData>({ nodes: [], links: [] });
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selectedNode = $state<ForceNode | null>(null);
	let hoveredNode = $state<ForceNode | null>(null);
	let isDarkMode = $state(true);

	let showUser = $state(true);
	let showRelationship = $state(true);
	let showSharedExperience = $state(true);
	const similarityThreshold = 0.5;

	function checkDarkMode() {
		if (browser) {
			isDarkMode = document.documentElement.classList.contains('dark');
		}
	}

	function buildFilters(): GraphFilters {
		return {
			categories: new Set<FactCategory>(
				[
					showUser && 'user',
					showRelationship && 'relationship',
					showSharedExperience && 'shared_experience'
				].filter(Boolean) as FactCategory[]
			),
			minSimilarity: similarityThreshold
		};
	}

	function isIdentity(node: ForceNode | null): node is IdentityCluster {
		return !!node && 'kind' in node && node.kind === 'identity';
	}

	function isFact(node: ForceNode | null): node is GraphNode {
		return !!node && (!('kind' in node) || node.kind === 'fact') && 'category' in node;
	}

	function nodeColor(node: ForceNode): string {
		if (isIdentity(node)) return identityColor(node);
		if (isFact(node)) return categoryColors[node.category];
		return '#94a3b8';
	}

	$effect(() => {
		const _u = showUser;
		const _r = showRelationship;
		const _s = showSharedExperience;
		if (view !== 'person' || fullGraphData.nodes.length === 0) return;
		graphData = filterGraph(fullGraphData, buildFilters());
		queueMicrotask(() => {
			updateGraphData();
		});
	});

	function currentGraphPayload() {
		if (view === 'overview') {
			return {
				nodes: overviewNodes.map((node) => ({ ...node })),
				links: overviewLinks.map((link) => ({ ...link }))
			};
		}
		return {
			nodes: graphData.nodes.map((node) => ({ ...node })),
			links: graphData.links.map((link) => ({ ...link }))
		};
	}

	function updateGraphData() {
		if (!graph) return;
		graph.graphData(currentGraphPayload());
		applyStyles();
	}

	function applyStyles() {
		if (!graph) return;
		checkDarkMode();

		const selectedId = selectedNode?.id;
		const connectedToSelected =
			selectedNode && view === 'person' && isFact(selectedNode)
				? getConnectedNodes(graphData, selectedNode.id)
				: selectedNode && view === 'overview'
					? new Set(
							overviewLinks
								.filter((link) => link.source === selectedId || link.target === selectedId)
								.flatMap((link) => [link.source, link.target])
						)
					: null;

		const baseLinkColor = isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)';
		const highlightLinkColor = isDarkMode ? 'rgba(1, 178, 255, 0.8)' : 'rgba(0, 153, 221, 0.8)';
		const dimmedLinkColor = isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
		const dimmedNodeColor = isDarkMode ? '#333' : '#ddd';

		graph
			.nodeColor((node: ForceNode) => {
				if (selectedNode) {
					if (node.id === selectedNode.id) return nodeColor(node);
					if (connectedToSelected?.has(node.id as never)) return nodeColor(node);
					return dimmedNodeColor;
				}
				return nodeColor(node);
			})
			.nodeVal((node: ForceNode) => {
				if (isIdentity(node)) {
					return Math.max(3, 2 + Math.log2(1 + node.factCount + node.turnCount) * 2);
				}
				return 1;
			})
			.linkColor((link: { source: ForceNode | string | number; target: ForceNode | string | number }) => {
				if (!selectedNode) return baseLinkColor;
				const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
				const targetId = typeof link.target === 'object' ? link.target.id : link.target;
				if (sourceId === selectedNode.id || targetId === selectedNode.id) return highlightLinkColor;
				return dimmedLinkColor;
			})
			.linkWidth((link: { source: ForceNode | string | number; target: ForceNode | string | number }) => {
				if (!selectedNode) return view === 'overview' ? 1.5 : 1;
				const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
				const targetId = typeof link.target === 'object' ? link.target.id : link.target;
				if (sourceId === selectedNode.id || targetId === selectedNode.id) return 2.5;
				return 0.5;
			})
			.linkDirectionalParticleColor(() => (isDarkMode ? '#00b2ff' : '#0099dd'));
	}

	function handleNodeClick(node: ForceNode) {
		if (view === 'overview' && isIdentity(node)) {
			void drillIntoPerson(node);
			return;
		}
		if (selectedNode?.id === node.id) {
			selectedNode = null;
		} else {
			selectedNode = node;
		}
		applyStyles();
	}

	function handleBackgroundClick() {
		selectedNode = null;
		applyStyles();
	}

	function resetView() {
		if (graph) {
			graph.zoomToFit(400, 50);
			selectedNode = null;
			applyStyles();
		}
	}

	function destroyGraph() {
		if (graph) {
			graph._destructor?.();
			graph = null;
		}
		if (container) container.replaceChildren();
	}

	async function ensureForceGraph() {
		const ForceGraph = (await import('force-graph')).default;
		if (destroyed) return null;
		checkDarkMode();
		destroyGraph();
		graph = new ForceGraph(container)
			.backgroundColor('transparent')
			.nodeRelSize(view === 'overview' ? 4 : 1)
			.nodeVal(1)
			.nodeId('id')
			.nodeLabel((node: ForceNode) => (isIdentity(node) ? node.displayName : node.content))
			.linkSource('source')
			.linkTarget('target')
			.linkDirectionalParticles(view === 'overview' ? 1 : 2)
			.linkDirectionalParticleSpeed(0.005)
			.linkDirectionalParticleWidth(1.5)
			.d3AlphaDecay(0.02)
			.d3VelocityDecay(0.3)
			.warmupTicks(0)
			.cooldownTicks(Infinity)
			.onNodeClick((node) => handleNodeClick(node as ForceNode))
			.onNodeHover((node) => {
				hoveredNode = (node as ForceNode) || null;
				container.style.cursor = node ? 'pointer' : 'grab';
			})
			.onBackgroundClick(() => handleBackgroundClick());
		return graph;
	}

	async function loadDiskOverview(): Promise<{ persons: PersonOverview[]; links: MentionLink[] }> {
		try {
			const res = await fetch('/api/alice-memory');
			if (!res.ok) return { persons: [], links: [] };
			const body = await res.json();
			return { persons: body.persons || [], links: body.links || [] };
		} catch {
			return { persons: [], links: [] };
		}
	}

	async function loadDiskFacts(memoryKey: string): Promise<StoredFact[]> {
		try {
			const res = await fetch(`/api/alice-memory?memoryKey=${encodeURIComponent(memoryKey)}`);
			if (!res.ok) return [];
			const body = await res.json();
			return body.facts || [];
		} catch {
			return [];
		}
	}

	async function showOverview() {
		if (!browser) return;
		view = 'overview';
		activePerson = null;
		selectedNode = null;
		hoveredNode = null;
		loading = true;
		error = null;
		try {
			const [disk, idbFacts] = await Promise.all([loadDiskOverview(), getFacts()]);
			const persons = mergeOverviewClusters(disk.persons, idbFacts);
			const idbLinks = buildMentionLinks(
				persons.map((person) => ({
					memoryKey: person.memoryKey,
					displayName: person.displayName,
					corpus: idbFacts
						.filter((fact) => (fact.memoryKey || OWNER_PERSON_KEY) === person.memoryKey)
						.map((fact) => fact.content)
						.join('\n')
				}))
			);
			overviewNodes = toIdentityNodes(persons);
			overviewLinks = unionMentionLinks(disk.links, idbLinks);
			if (overviewNodes.length === 0) {
				error = 'No identities yet. Chat in Utsuwa or Discord to grow this map.';
				loading = false;
				return;
			}
			await ensureForceGraph();
			if (destroyed) return;
			updateGraphData();
			setTimeout(() => graph?.zoomToFit(400, 50), 500);
			loading = false;
		} catch (e) {
			console.error('Failed to initialize identity graph:', e);
			error = 'Failed to load identity overview';
			loading = false;
		}
	}

	async function drillIntoPerson(person: IdentityCluster) {
		if (!browser) return;
		view = 'person';
		activePerson = person;
		selectedNode = null;
		hoveredNode = null;
		loading = true;
		error = null;
		try {
			const [idbFacts, diskFacts] = await Promise.all([
				getFactsForPersonGraph(person.memoryKey),
				loadDiskFacts(person.memoryKey)
			]);
			const facts = mergePersonFacts(idbFacts, diskFacts);
			if (facts.length === 0) {
				fullGraphData = { nodes: [], links: [] };
				graphData = { nodes: [], links: [] };
				error = `No facts stored for ${person.displayName} yet.`;
				await ensureForceGraph();
				if (!destroyed) updateGraphData();
				loading = false;
				return;
			}
			fullGraphData = buildGraph(facts, 0);
			graphData = filterGraph(fullGraphData, buildFilters());
			await ensureForceGraph();
			if (destroyed) return;
			updateGraphData();
			setTimeout(() => graph?.zoomToFit(400, 50), 500);
			loading = false;
		} catch (e) {
			console.error('Failed to initialize person graph:', e);
			error = 'Failed to load this cluster';
			loading = false;
		}
	}

	let destroyed = false;

	onMount(() => {
		void showOverview();
	});

	onDestroy(() => {
		destroyed = true;
		destroyGraph();
	});

	$effect(() => {
		if (!browser) return;
		const handleResize = () => {
			if (graph && container) {
				graph.width(container.clientWidth).height(container.clientHeight);
			}
		};
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	$effect(() => {
		if (!browser) return;
		const observer = new MutationObserver(() => {
			const wasDark = isDarkMode;
			checkDarkMode();
			if (wasDark !== isDarkMode && graph) applyStyles();
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class']
		});
		return () => observer.disconnect();
	});

	function identityLabel(person: IdentityCluster): string {
		if (person.isOwner) return 'owner';
		if (person.recognized) return 'known';
		return 'unrecognized';
	}
</script>

<div class="memory-graph">
	<div class="controls">
		{#if view === 'person'}
			<button class="reset-btn" onclick={() => void showOverview()}>All identities</button>
			<div class="filter-group">
				<span class="filter-label">{activePerson?.displayName || 'Facts'}</span>
				<div class="category-toggles">
					<label class="category-toggle" style="--cat-color: {categoryColors.user}">
						<input type="checkbox" bind:checked={showUser} />
						<span class="toggle-dot"></span>
						<span>User</span>
					</label>
					<label class="category-toggle" style="--cat-color: {categoryColors.relationship}">
						<input type="checkbox" bind:checked={showRelationship} />
						<span class="toggle-dot"></span>
						<span>Relationship</span>
					</label>
					<label class="category-toggle" style="--cat-color: {categoryColors.shared_experience}">
						<input type="checkbox" bind:checked={showSharedExperience} />
						<span class="toggle-dot"></span>
						<span>Shared</span>
					</label>
				</div>
			</div>
		{:else}
			<div class="filter-group">
				<span class="filter-label">Identities</span>
				<div class="legend">
					<span><i style="background:#fbbf24"></i>Owner</span>
					<span><i style="background:#00b2ff"></i>Known</span>
					<span><i style="background:#94a3b8"></i>Unrecognized</span>
				</div>
				<p class="hint">Click a person to open their facts. Lines are mentions only.</p>
			</div>
		{/if}

		<button class="reset-btn" onclick={resetView}>Reset View</button>
	</div>

	<div class="graph-container" bind:this={container}>
		{#if loading}
			<div class="loading">
				<div class="spinner"></div>
				<span>Loading memories...</span>
			</div>
		{/if}

		{#if error}
			<div class="error-message">
				<span>{error}</span>
			</div>
		{/if}
	</div>

	{#if hoveredNode}
		<div class="tooltip">
			{#if isIdentity(hoveredNode)}
				<div class="tooltip-category" style="color: {identityColor(hoveredNode)}">
					{identityLabel(hoveredNode)}
				</div>
				<div class="tooltip-content">{hoveredNode.displayName}</div>
				<div class="tooltip-meta">
					{hoveredNode.memoryKey} · {hoveredNode.factCount} facts · {hoveredNode.turnCount} turns
				</div>
			{:else if isFact(hoveredNode)}
				<div class="tooltip-category" style="color: {categoryColors[hoveredNode.category]}">
					{hoveredNode.category.replace('_', ' ')}
				</div>
				<div class="tooltip-content">{hoveredNode.content}</div>
				<div class="tooltip-meta">
					Importance: {hoveredNode.importance} · Referenced: {hoveredNode.referenceCount}x
				</div>
			{/if}
		</div>
	{/if}

	{#if selectedNode && isFact(selectedNode)}
		<div class="selected-detail">
			<div class="detail-header">
				<span class="detail-category" style="background: {categoryColors[selectedNode.category]}">
					{selectedNode.category.replace('_', ' ')}
				</span>
				<button class="close-btn" onclick={() => (selectedNode = null)}>×</button>
			</div>
			<div class="detail-content">{selectedNode.content}</div>
			<div class="detail-meta">
				<div>Importance: {selectedNode.importance}</div>
				<div>Referenced: {selectedNode.referenceCount}x</div>
				<div>Created: {new Date(selectedNode.createdAt).toLocaleDateString()}</div>
			</div>
		</div>
	{/if}

	<div class="stats">
		{#if view === 'overview'}
			{overviewNodes.length} identities · {overviewLinks.length} mentions
		{:else}
			{graphData.nodes.length} memories · {graphData.links.length} connections
			{#if activePerson}
				· {activePerson.displayName}
			{/if}
		{/if}
	</div>
</div>

<style>
	.memory-graph {
		position: relative;
		width: 100%;
		height: 100%;
		background: var(--bg-page);
		overflow: hidden;
	}

	.controls {
		position: absolute;
		top: 1rem;
		left: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		background: var(--bg-primary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: 1rem;
		z-index: 10;
		min-width: 200px;
		max-width: 260px;
		box-shadow: var(--shadow-md);
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.filter-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.category-toggles {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.category-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.category-toggle input {
		display: none;
	}

	.toggle-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--bg-tertiary);
		border: 2px solid var(--cat-color);
		transition: all 0.15s;
	}

	.category-toggle input:checked + .toggle-dot {
		background: var(--cat-color);
	}

	.legend {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.8125rem;
		color: var(--text-secondary);
	}

	.legend span {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.legend i {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		display: inline-block;
	}

	.hint {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--text-tertiary);
	}

	.reset-btn {
		padding: 0.5rem 0.75rem;
		background: var(--bg-tertiary);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		font-size: 0.8125rem;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}

	.reset-btn:hover {
		background: color-mix(in srgb, var(--bg-tertiary), var(--text-primary) 8%);
		color: var(--text-primary);
	}

	.reset-btn:active {
		background: color-mix(in srgb, var(--bg-tertiary), var(--text-primary) 8%);
	}

	.graph-container {
		width: 100%;
		height: 100%;
	}

	.loading,
	.error-message {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		color: var(--text-secondary);
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--border-light);
		border-top-color: #00b2ff;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.tooltip {
		position: fixed;
		bottom: 5rem;
		left: 50%;
		transform: translateX(-50%);
		background: var(--bg-primary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: 0.75rem 1rem;
		max-width: 400px;
		z-index: 20;
		pointer-events: none;
		box-shadow: var(--shadow-lg);
	}

	.tooltip-category {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.25rem;
	}

	.tooltip-content {
		font-size: 0.875rem;
		color: var(--text-primary);
		line-height: 1.4;
		margin-bottom: 0.5rem;
	}

	.tooltip-meta {
		font-size: 0.75rem;
		color: var(--text-tertiary);
	}

	.selected-detail {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: var(--bg-primary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: 1rem;
		max-width: 300px;
		z-index: 10;
		box-shadow: var(--shadow-lg);
	}

	.detail-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.detail-category {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		color: #fff;
	}

	.close-btn {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: 50%;
		color: var(--text-secondary);
		font-size: 1rem;
		cursor: pointer;
		transition: background 0.15s, color 0.15s, transform 0.15s;
	}

	.close-btn:hover {
		background: var(--bg-secondary);
		color: var(--text-primary);
	}

	.close-btn:active {
		transform: scale(0.95);
	}

	.detail-content {
		font-size: 0.875rem;
		color: var(--text-primary);
		line-height: 1.5;
		margin-bottom: 0.75rem;
	}

	.detail-meta {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--text-tertiary);
	}

	.stats {
		position: absolute;
		bottom: 1rem;
		left: 1rem;
		font-size: 0.75rem;
		color: var(--text-tertiary);
		background: var(--bg-primary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.75rem;
		box-shadow: var(--shadow-sm);
	}
</style>
