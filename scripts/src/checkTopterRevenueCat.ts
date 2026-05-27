import { getUncachableRevenueCatClient } from "./revenueCatClient";
import {
  listProjects,
  listApps,
  listProducts,
  listEntitlements,
  listOfferings,
  listPackages,
  getProductsFromPackage,
} from "@replit/revenuecat-sdk";

async function checkTopterRevenueCat() {
  const client = await getUncachableRevenueCatClient();

  console.log("\n══════════════════════════════════════════");
  console.log("  Topter RevenueCat Status Check");
  console.log("══════════════════════════════════════════\n");

  // List all projects
  const { data: projectsData, error: projectsErr } = await listProjects({
    client,
    query: { limit: 20 },
  });
  if (projectsErr || !projectsData) {
    console.error("❌ Failed to list projects:", projectsErr);
    return;
  }

  console.log("Projects found:");
  for (const p of projectsData.items ?? []) {
    const isCurrent = p.id === process.env.REVENUECAT_PROJECT_ID;
    console.log(`  ${isCurrent ? "→" : " "} [${p.id}] ${p.name}`);
  }

  const project = projectsData.items?.find(
    (p) => p.id === process.env.REVENUECAT_PROJECT_ID
  );
  if (!project) {
    console.error(`\n❌ No project matching REVENUECAT_PROJECT_ID (${process.env.REVENUECAT_PROJECT_ID})`);
    return;
  }
  console.log(`\n✅ Using project: "${project.name}" (${project.id})`);

  // List apps
  const { data: appsData, error: appsErr } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (appsErr || !appsData) {
    console.error("❌ Failed to list apps");
    return;
  }

  console.log("\nApps:");
  for (const a of appsData.items ?? []) {
    console.log(`  [${a.type}] ${a.name} (${a.id})`);
  }

  const testApp = appsData.items.find((a) => a.type === "test_store");
  const playApp = appsData.items.find((a) => a.type === "play_store");

  // List products
  const { data: productsData } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });

  console.log(`\nProducts (${productsData?.items?.length ?? 0} total):`);
  for (const p of productsData?.items ?? []) {
    const store = p.app_id === testApp?.id ? "TEST" : p.app_id === playApp?.id ? "PLAY" : "OTHER";
    console.log(`  [${store}] ${p.store_identifier} → ${p.display_name} (${p.id})`);
  }

  // List entitlements
  const { data: entData } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  console.log(`\nEntitlements (${entData?.items?.length ?? 0} total):`);
  for (const e of entData?.items ?? []) {
    console.log(`  [${e.lookup_key}] ${e.display_name} (${e.id})`);
  }

  // List offerings
  const { data: offData } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  console.log(`\nOfferings (${offData?.items?.length ?? 0} total):`);
  for (const o of offData?.items ?? []) {
    const current = o.is_current ? " [CURRENT]" : "";
    console.log(`  [${o.lookup_key}]${current} ${o.display_name} (${o.id})`);

    // List packages in this offering
    const { data: pkgData } = await listPackages({
      client,
      path: { project_id: project.id, offering_id: o.id },
      query: { limit: 20 },
    });
    for (const pkg of pkgData?.items ?? []) {
      console.log(`    Package: [${pkg.lookup_key}] ${pkg.display_name} (${pkg.id})`);
      const { data: pkgProducts } = await getProductsFromPackage({
        client,
        path: { project_id: project.id, package_id: pkg.id },
      });
      for (const pp of pkgProducts?.items ?? []) {
        console.log(`      → ${pp.product?.store_identifier} (${pp.product?.id})`);
      }
    }
  }

  console.log("\n══════════════════════════════════════════\n");
}

checkTopterRevenueCat().catch((err) => {
  console.error("Check failed:", err);
  process.exitCode = 1;
});
