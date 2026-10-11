# Fleet Pulse — démo MCP Apps

Un tableau de bord live de monitoring de flotte de serveurs, construit comme
[MCP App](https://github.com/modelcontextprotocol/ext-apps). Conçu pour
démontrer ce qu'un serveur MCP peut faire au-delà de renvoyer du texte : une
UI interactive riche, vivante, qui dialogue dans les deux sens avec le modèle.

## Ce que ça démontre

| Capacité | Où dans le code |
|---|---|
| **Tool + Resource** : un outil `_meta.ui.resourceUri` lié à une ressource HTML | `server.ts` — `open-fleet-dashboard` |
| **Polling live** sans jamais repasser par le modèle | `server.ts` — `poll-fleet-metrics` (`visibility: ["app"]`, caché du LLM) + `src/mcp-app.tsx` (boucle `setInterval`) |
| **Outil app-only** invisible pour le LLM | même outil, `_meta.ui.visibility: ["app"]` |
| **Contexte silencieux** (`updateModelContext`) — informe le modèle sans déclencher de réponse | bouton "Share this view with AI" dans `DetailPanel` |
| **Message actif** (`sendMessage`) — pousse un message utilisateur et déclenche un tour du modèle | bouton "Ask AI to investigate" |
| **Theming automatique** (clair/sombre, polices, variables CSS de l'hôte) | `applyDocumentTheme` / `applyHostStyleVariables` dans `mcp-app.tsx` |
| **Fullscreen** à la demande | `app.requestDisplayMode` sur le bouton "Fullscreen" |
| **Tool input pilotant l'UI** (`region` spotlight) | paramètre `region` de `open-fleet-dashboard`, visuellement mis en évidence dans la grille |

Les métriques sont 100% simulées côté serveur par des fonctions pures du
temps (`Date.now()`) — pas d'état mutable partagé, donc ça reste cohérent
même en mode HTTP stateless (un `McpServer` par requête). Chaque serveur a
sa propre fenêtre d'« incident » programmée, pour que la démo reste vivante
sans setup supplémentaire.

## Lancer la démo

```bash
npm install
npm run dev     # build client en watch + serveur MCP sur http://localhost:3001/mcp
```

### Tester avec le host de référence

```bash
git clone --depth 1 https://github.com/modelcontextprotocol/ext-apps.git /tmp/mcp-ext-apps
cd /tmp/mcp-ext-apps/examples/basic-host
npm install && npm run build
SERVERS='["http://localhost:3001/mcp"]' npx tsx serve.ts
# ouvrir http://localhost:8080, choisir "Fleet Pulse" → "open-fleet-dashboard" → Call Tool
```

### Tester avec Claude Desktop / un vrai host MCP Apps

Ajoutez le serveur comme un serveur MCP HTTP classique pointant sur
`http://localhost:3001/mcp`, puis demandez "ouvre le dashboard Fleet Pulse".

## Script de démo suggéré

1. Demander au modèle d'ouvrir le dashboard — montrer que l'UI apparaît
   instantanément avec des données qui bougent déjà.
2. Laisser tourner quelques secondes : les sparklines se dessinent, les
   gauges oscillent — **sans aucun tour de conversation supplémentaire**.
   C'est le point clé : l'app a sa propre boucle de vie.
3. Cliquer sur un serveur en alerte (ou attendre un incident simulé) →
   ouvrir le détail.
4. Cliquer "Share this view with AI (silent)" → montrer dans les devtools /
   logs de l'hôte que le contexte a été mis à jour sans interrompre la
   conversation.
5. Cliquer "Ask AI to investigate" → le modèle reçoit un message *comme si
   l'utilisateur l'avait tapé* et répond dans la conversation — point de
   bascule du public : l'UI n'est pas un simple canal de sortie.
6. Basculer le thème clair/sombre de l'hôte → l'app suit automatiquement.
