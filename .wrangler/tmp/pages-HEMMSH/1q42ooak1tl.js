// <define:__ROUTES__>
var define_ROUTES_default = { version: 1, include: ["/api/*", "/_blob/*"], exclude: [] };

// ../.npm/_npx/02ac24ddaff53628/node_modules/wrangler/templates/pages-dev-pipeline.ts
import worker from "/home/claude/year-group-hub/.wrangler/tmp/pages-HEMMSH/functionsWorker-0.34139602251792933.mjs";
import { isRoutingRuleMatch } from "/home/claude/.npm/_npx/02ac24ddaff53628/node_modules/wrangler/templates/pages-dev-util.ts";
export * from "/home/claude/year-group-hub/.wrangler/tmp/pages-HEMMSH/functionsWorker-0.34139602251792933.mjs";
var routes = define_ROUTES_default;
var pages_dev_pipeline_default = {
  fetch(request, env, context) {
    const { pathname } = new URL(request.url);
    for (const exclude of routes.exclude) {
      if (isRoutingRuleMatch(pathname, exclude)) {
        return env.ASSETS.fetch(request);
      }
    }
    for (const include of routes.include) {
      if (isRoutingRuleMatch(pathname, include)) {
        if (worker.fetch === void 0) {
          throw new TypeError("Entry point missing `fetch` handler");
        }
        return worker.fetch(request, env, context);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  pages_dev_pipeline_default as default
};
//# sourceMappingURL=1q42ooak1tl.js.map
