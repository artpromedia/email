filepath = '/opt/oonrumail/app/services/ai-assistant/main.go'

with open(filepath, 'r') as f:
    content = f.read()

# Check what imports are already there
import_additions = []
for pkg in ['smartreply', 'autoreply', 'summarization', 'draft', 'priority']:
    full_import = f'"github.com/oonrumail/ai-assistant/{pkg}"'
    if full_import not in content:
        import_additions.append(pkg)

# Add missing imports
if import_additions:
    # Find the last import in the import block
    import_insert = '"github.com/oonrumail/ai-assistant/embedding"'
    new_imports = import_insert
    for pkg in import_additions:
        new_imports += f'\n\t"github.com/oonrumail/ai-assistant/{pkg}"'
    content = content.replace(import_insert, new_imports)
    print(f"Added imports: {import_additions}")

# Add service initializations before the handler creation
handler_line = '\t// Initialize HTTP handler\n\thandler := handlers.NewHandler(providerRouter, analysisSvc, embeddingSvc, rateLimiter, logger)'

new_services = """\t// Initialize smart reply service
\tsmartReplySvc := smartreply.NewService(providerRouter, redisClient, smartreply.ServiceConfig{
\t\tCacheTTL: cfg.Cache.SmartReplyTTL,
\t}, logger)
\tlogger.Info().Msg("Initialized smart reply service")

\t// Initialize auto-reply service
\tautoreplySvc := autoreply.NewService(providerRouter, redisClient, autoreply.ServiceConfig{
\t\tDefaultCooldownMinutes: 60,
\t\tMaxRepliesPerDay:       10,
\t}, logger)
\tlogger.Info().Msg("Initialized auto-reply service")

\t// Initialize summarization service
\tsummarizationSvc := summarization.NewService(providerRouter, redisClient, summarization.ServiceConfig{
\t\tCacheTTL:      cfg.Cache.AnalysisTTL,
\t\tTLDRThreshold: 500,
\t}, logger)
\tlogger.Info().Msg("Initialized summarization service")

\t// Initialize draft service
\tdraftSvc := draft.NewService(providerRouter, redisClient, draft.ServiceConfig{
\t\tMaxSuggestionLength: 2000,
\t}, logger)
\tlogger.Info().Msg("Initialized draft service")

\t// Initialize priority service
\tprioritySvc := priority.NewService(providerRouter, redisClient, priority.ServiceConfig{
\t\tCacheTTL: cfg.Cache.AnalysisTTL,
\t}, logger)
\tlogger.Info().Msg("Initialized priority service")

\t// Initialize HTTP handler
\thandler := handlers.NewHandler(providerRouter, analysisSvc, embeddingSvc, smartReplySvc, autoreplySvc, summarizationSvc, draftSvc, prioritySvc, rateLimiter, logger)"""

content = content.replace(handler_line, new_services)

with open(filepath, 'w') as f:
    f.write(content)

print("Updated main.go with all service initializations")
