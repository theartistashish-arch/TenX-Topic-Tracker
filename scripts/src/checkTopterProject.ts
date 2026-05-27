import { getUncachableRevenueCatClient } from "./revenueCatClient";
import {
  listApps,
  listProducts,
  listEntitlements,
  listOfferings,
  listPackages,
  getProductsFromPackage,
  listAppPublicApiKeys,
} from "@replit/revenuecat-sdk";

const TOPTER_PROJECT_ID = "proj985a48e9";

async function checkTopterProject() {
  const client = await getUncachableRevenueCatClient();

  console.log(`\n══════════════════════════════════════════`);
  console.log(`  Topter Project (${TOPTER_PROJECT_ID}) Full Status`);
  console.log(`══════════════════════════════════════════\n`);

  // Apps
  const { data: appsData, error: appsErr } = await listApps({
    client,
    path: { project_id: TOPTER_PROJECT_ID },
    query: { limit: 20 },
  });
  if (appsErr || !appsData) {
    console.error("❌ Failed to list apps:", appsErr);
    return;
  }

  console.log("Apps:");
  for (const a of appsData.items ?? []) {
    console.log(`  [${a.type}] ${a.name} (${a.id})`);
  }

  const testApp = appsData.items.find((a) => a.type === "test_store");
  const playApp = appsData.items.find((a) => a.type === "play_store");
  const iosApp = appsData.items.find((a) => a.type === "app_store");

  // List API keys for each app
  for (const app of appsData.items ?? []) {
    const { data: keys } = await listAppPublicApiKeys({
      client,
      path: { project_id: TOPTER_PROJECT_ID, app_id: app.id },
    });
    const keyList = keys?.items?.map((k) => k.key).join(", ") ?? "none";
    console.log(`  API keys for ${app.name}: ${keyList}`);
  }

  // Products
  const { data: productsData } = await listProducts({
    client,
    path: { project_id: TOPTER_PROJECT_ID },
    query: { limit: 100 },
  });

  console.log(`\nProducts (${productsData?.items?.length ?? 0} total):`);
  for (const p of productsData?.items ?? []) {
    const store = p.app_id === testApp?.id ? "TEST" : p.app_id === playApp?.id ? "PLAY" : p.app_id === iosApp?.id ? "IOS" : "?";
    console.log(`  [${store}] ${p.store_identifier} → ${p.display_name} (${p.id})`);
  }

  // Entitlements
  const { data: entData } = await listEntitlements({
    client,
    path: { project_id: TOPTER_PROJECT_ID },
    query: { limit: 20 },
  });
  console.log(`\nEntitlements (${entData?.items?.length ?? 0} total):`);
  for (const e of entData?.items ?? []) {
    console.log(`  [${e.lookup_key}] ${e.display_name} (${e.id})`);
  }

  // Offerings
  const { data: offData } = await listOfferings({
    client,
    path: { project_id: TOPTER_PROJECT_ID },
    query: { limit: 20 },
  });
  console.log(`\nOfferings (${offData?.items?.length ?? 0} total):`);
  for (const o of offData?.items ?? []) {
    const current = o.is_current ? " [CURRENT]" : "";
    console.log(`  [${o.lookup_key}]${current} ${o.display_name} (${o.id})`);

    const { data: pkgData } = await listPackages({
      client,
      path: { project_id: TOPTER_PROJECT_ID, offering_id: o.id },
      query: { limit: 20 },
    });
    for (const pkg of pkgData?.items ?? []) {
      console.log(`    Package: [${pkg.lookup_key}] ${pkg.display_name} (${pkg.id})`);
      const { data: pkgProducts } = await getProductsFromPackage({
        client,
        path: { project_id: TOPTER_PROJECT_ID, package_id: pkg.id },
      });
      for (const pp of pkgProducts?.items ?? []) {
        console.log(`      → ${pp.product?.store_identifier}`);
      }
    }
  }

  console.log("\n══════════════════════════════════════════\n");
}

checkTopterProject().catch((err) => {
  console.error("Check failed:", err);
  process.exitCode = 1;
});
