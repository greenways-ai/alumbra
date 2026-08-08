import { loadShowcases } from "./lib/showcase.mjs";

try {
  const showcases = await loadShowcases();
  const demos = showcases.reduce((total, showcase) => total + showcase.demos.length, 0);
  console.log(`Validated ${showcases.length} Alumbra package Showcases and ${demos} complete demo projects.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
