import { n as queryOptions, r as useQuery } from "./initial-BUIQ08st.js";
import { an as listMcpApiKeys, at as queryKeys, on as listMcpServers } from "./initial-BOT0Y-sv.js";
//#region src/lib/queries/mcp.ts
var flattenServers = (servers) => {
	const result = [];
	for (const server of servers) {
		if (!server.enabled || server.authStatus !== "connected") continue;
		for (const tool of server.tools) result.push({
			id: tool.displayName,
			name: tool.name,
			displayName: tool.displayName,
			description: tool.description,
			server: {
				id: server.id,
				name: server.name,
				slug: server.slug
			}
		});
	}
	return result;
};
var mcpServersQueryOptions = () => queryOptions({
	queryKey: queryKeys.mcp.servers,
	queryFn: () => listMcpServers().then((r) => r.servers),
	staleTime: 5 * 6e4
});
var mcpKeysQueryOptions = () => queryOptions({
	queryKey: queryKeys.mcp.keys,
	queryFn: () => listMcpApiKeys().then((r) => r.keys),
	staleTime: 5 * 6e4
});
var useMentionableTools = () => useQuery({
	...mcpServersQueryOptions(),
	select: flattenServers
});
var useMcpKeysQuery = () => useQuery(mcpKeysQueryOptions());
//#endregion
export { useMentionableTools as n, useMcpKeysQuery as t };

//# sourceMappingURL=mcp-Dq1M87f2.js.map