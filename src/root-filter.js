/**
 * Usage: node src/root-filter.js [gh|li|vc]
 */

const fs = require("fs");

const isOffline = process.env.OFFLINE === "1";

const withOfflineCache = (fn, cacheFile) => {
  return async (...args) => {
    try {
      if (isOffline) {
        throw new Error("Offline mode");
      }
      const result = await fn(...args);
      try {
        // Save successful result to cache
        fs.writeFileSync(cacheFile, JSON.stringify(result));
      } catch (error) {
        // ignore
      }
      return result;
    } catch (error) {
      // If offline/error, try to load from cache
      if (fs.existsSync(cacheFile)) {
        const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        return cached;
      }
      return [];
    }
  };
};

const vercelFilter = withOfflineCache(
  require("./vercel-filter"),
  ".vercel-cache.json"
);
const githubFilter = withOfflineCache(
  require("./github-filter"),
  ".github-cache.json"
);
const linearFilter = withOfflineCache(
  require("./linear-filter"),
  ".linear-cache.json"
);

async function fetchRootFilter(sourceFilter) {
  try {
    const items = [];

    const [githubResult, linearResult, vercelResult] = await Promise.all([
      vercelFilter().catch((error) => {
        console.error(error);
        return [error.scriptFilterItem];
      }),
      githubFilter().catch((error) => {
        console.error(error);
        return [error.scriptFilterItem];
      }),
      linearFilter().catch((error) => {
        console.error(error);
        return [error.scriptFilterItem];
      }),
    ]);

    items.push(...vercelResult, ...githubResult, ...linearResult);

    return items
      .filter((item) => sourceFilter == null || item.source === sourceFilter)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (error) {
    error.scriptFilterItem = {
      title: "Unknown error",
      subtitle: error.message,
      icon: {
        path: "./src/fastview.png",
      },

      source: "root",
      date: new Date(),
    };
    throw error;
  }
}

module.exports = fetchRootFilter;

if (require.main === module) {
  const query = process.argv[2];
  const sourceFilter =
    query.match(/^(?<filter>gh|li|vc)\b/)?.groups?.filter ?? null;
  fetchRootFilter(sourceFilter)
    .then((items) => console.log(JSON.stringify({ items })))
    .catch(
      (error) =>
        console.error(error) ||
        console.log(
          JSON.stringify({
            items: [error.scriptFilterItem],
          })
        )
    );
}
