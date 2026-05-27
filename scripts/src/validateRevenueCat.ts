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

const PROJECT_NAME = "NeuroTick";
const ENTITLEMENT_IDENTIFIER = "pro";
const OFFERING_IDENTIFIER = "default";

// These must match what is created in App Store Connect and Google Play Console.
// App Store Connect: Product IDs = "com.neurotick.monthly", "com.neurotick.annual"
//   (Auto-Renewable Subscriptions, Subscription group: NeuroTick Pro)
// Google Play: Subscription IDs = "com.neurotick.monthly" (base plan "monthly"),
//              "com.neurotick.annual" (base plan "annual")
const EXPECTED_APP_STORE_PRODUCTS = [
  "com.neurotick.monthly",
  "com.neurotick.annual",
];
const EXPECTED_PLAY_STORE_PRODUCTS = [
  "com.neurotick.monthly:monthly",
  "com.neurotick.annual:annual",
];
const EXPECTED_TEST_PRODUCTS = [
  "neurotick_pro_monthly",
  "neurotick_pro_annual",
];

type Check = { label: string; ok: boolean; detail?: string };

function pass(label: string, detail?: string): Check {
  return { label, ok: true, detail };
}
function fail(label: string, detail?: string): Check {
  return { label, ok: false, detail };
}

async function validateRevenueCat() {
  const client = await getUncachableRevenueCatClient();
  const checks: Check[] = [];

  // ── Project ────────────────────────────────────────────────────────────────
  const { data: projectsData, error: projectsErr } = await listProjects({
    client,
    query: { limit: 20 },
  });
  if (projectsErr || !projectsData) {
    checks.push(fail("Project exists", "Failed to list projects"));
    printReport(checks);
    return;
  }
  const project = projectsData.items?.find((p) => p.name === PROJECT_NAME);
  if (!project) {
    checks.push(fail("Project exists", `No project named "${PROJECT_NAME}"`));
    printReport(checks);
    return;
  }
  checks.push(pass("Project exists", project.id));

  // ── Apps ───────────────────────────────────────────────────────────────────
  const { data: appsData, error: appsErr } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (appsErr || !appsData) {
    checks.push(fail("Apps listed", "Failed to list apps"));
    printReport(checks);
    return;
  }

  const testApp = appsData.items.find((a) => a.type === "test_store");
  const appStoreApp = appsData.items.find((a) => a.type === "app_store");
  const playStoreApp = appsData.items.find((a) => a.type === "play_store");

  checks.push(testApp ? pass("Test Store app exists", testApp.id) : fail("Test Store app exists"));
  checks.push(appStoreApp ? pass("App Store app exists", appStoreApp.id) : fail("App Store app exists"));
  checks.push(playStoreApp ? pass("Play Store app exists", playStoreApp.id) : fail("Play Store app exists"));

  // ── Products ───────────────────────────────────────────────────────────────
  const { data: productsData, error: productsErr } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  if (productsErr || !productsData) {
    checks.push(fail("Products listed", "Failed to list products"));
    printReport(checks);
    return;
  }
  const products = productsData.items ?? [];

  for (const id of EXPECTED_TEST_PRODUCTS) {
    const found = products.find(
      (p) => p.store_identifier === id && p.app_id === testApp?.id,
    );
    checks.push(found ? pass(`Test product "${id}"`, found.id) : fail(`Test product "${id}"`));
  }

  for (const id of EXPECTED_APP_STORE_PRODUCTS) {
    const found = products.find(
      (p) => p.store_identifier === id && p.app_id === appStoreApp?.id,
    );
    checks.push(
      found
        ? pass(`App Store product "${id}"`, found.id)
        : fail(
            `App Store product "${id}"`,
            "Create this product in App Store Connect, then re-run seed:revenuecat",
          ),
    );
  }

  for (const id of EXPECTED_PLAY_STORE_PRODUCTS) {
    const found = products.find(
      (p) => p.store_identifier === id && p.app_id === playStoreApp?.id,
    );
    const [subscriptionId, basePlanId] = id.split(":");
    checks.push(
      found
        ? pass(`Play Store product "${id}"`, found.id)
        : fail(
            `Play Store product "${id}"`,
            `Create subscription "${subscriptionId}" with base plan "${basePlanId}" in Google Play Console, then re-run seed:revenuecat`,
          ),
    );
  }

  // ── Entitlement ────────────────────────────────────────────────────────────
  const { data: entData, error: entErr } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  const entitlement = entData?.items?.find(
    (e) => e.lookup_key === ENTITLEMENT_IDENTIFIER,
  );
  if (entErr || !entitlement) {
    checks.push(fail(`Entitlement "${ENTITLEMENT_IDENTIFIER}" exists`));
  } else {
    checks.push(pass(`Entitlement "${ENTITLEMENT_IDENTIFIER}" exists`, entitlement.id));
  }

  // ── Offering ───────────────────────────────────────────────────────────────
  const { data: offData, error: offErr } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  const offering = offData?.items?.find(
    (o) => o.lookup_key === OFFERING_IDENTIFIER,
  );
  if (offErr || !offering) {
    checks.push(fail(`Offering "${OFFERING_IDENTIFIER}" exists`));
  } else {
    checks.push(pass(`Offering "${OFFERING_IDENTIFIER}" exists`, offering.id));
    checks.push(
      offering.is_current
        ? pass(`Offering "${OFFERING_IDENTIFIER}" is current`)
        : fail(`Offering "${OFFERING_IDENTIFIER}" is current`, "Run seed:revenuecat to fix"),
    );
  }

  // ── Packages & product linkage ────────────────────────────────────────────
  // For each package we verify:
  //   1. The package itself exists.
  //   2. The correct App Store product (com.neurotick.*) is linked.
  //   3. The correct Play Store product (com.neurotick.*:base_plan) is linked.
  //   4. The test-store product is linked (for Expo Go / sandbox).
  if (offering) {
    const { data: pkgData, error: pkgErr } = await listPackages({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      query: { limit: 20 },
    });
    const packages = pkgData?.items ?? [];
    if (pkgErr) {
      checks.push(fail("Packages listed", "Failed to list packages"));
    } else {
      const pkgLinkage: { key: string; appStoreId: string; playStoreId: string; testId: string }[] = [
        { key: "$rc_monthly", appStoreId: "com.neurotick.monthly", playStoreId: "com.neurotick.monthly:monthly", testId: "neurotick_pro_monthly" },
        { key: "$rc_annual",  appStoreId: "com.neurotick.annual",  playStoreId: "com.neurotick.annual:annual",   testId: "neurotick_pro_annual"  },
      ];

      for (const { key, appStoreId, playStoreId, testId } of pkgLinkage) {
        const pkg = packages.find((p) => p.lookup_key === key);
        if (!pkg) {
          checks.push(fail(`Package "${key}" exists`));
          continue;
        }
        checks.push(pass(`Package "${key}" exists`, pkg.id));

        const { data: pkgProducts, error: pkgProductsErr } = await getProductsFromPackage({
          client,
          path: { project_id: project.id, package_id: pkg.id },
        });
        if (pkgProductsErr || !pkgProducts) {
          checks.push(fail(`Package "${key}" products readable`));
          continue;
        }

        const linkedStoreIds = pkgProducts.items.map((i) => i.product?.store_identifier).filter(Boolean);

        checks.push(
          linkedStoreIds.includes(appStoreId)
            ? pass(`Package "${key}" → App Store "${appStoreId}"`)
            : fail(`Package "${key}" → App Store "${appStoreId}"`, "Run seed:revenuecat to fix"),
        );
        checks.push(
          linkedStoreIds.includes(playStoreId)
            ? pass(`Package "${key}" → Play Store "${playStoreId}"`)
            : fail(`Package "${key}" → Play Store "${playStoreId}"`, "Run seed:revenuecat to fix"),
        );
        checks.push(
          linkedStoreIds.includes(testId)
            ? pass(`Package "${key}" → Test store "${testId}"`)
            : fail(`Package "${key}" → Test store "${testId}"`, "Run seed:revenuecat to fix"),
        );
      }
    }
  }

  // ── Env vars ───────────────────────────────────────────────────────────────
  const requiredEnvVars = [
    "EXPO_PUBLIC_REVENUECAT_TEST_API_KEY",
    "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY",
    "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY",
  ];
  for (const key of requiredEnvVars) {
    const value = process.env[key];
    checks.push(
      value
        ? pass(`Env var ${key} set`, value.slice(0, 8) + "…")
        : fail(`Env var ${key} set`, "Run seed:revenuecat and set the printed keys as Replit secrets"),
    );
  }

  printReport(checks);
}

function printReport(checks: Check[]) {
  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;

  console.log("\n══════════════════════════════════════════");
  console.log("  RevenueCat Validation Report");
  console.log("══════════════════════════════════════════");
  for (const c of checks) {
    const icon = c.ok ? "✅" : "❌";
    const detail = c.detail ? `  (${c.detail})` : "";
    console.log(`${icon}  ${c.label}${detail}`);
  }
  console.log("──────────────────────────────────────────");
  console.log(`Result: ${passed}/${total} checks passed`);
  if (passed < total) {
    console.log("\nNext steps for failing checks:");
    console.log("  1. Create missing App Store products in App Store Connect");
    console.log("     - Product IDs: com.neurotick.monthly, com.neurotick.annual");
    console.log("     - Type: Auto-Renewable Subscription");
    console.log("     - Subscription group: NeuroTick Pro");
    console.log("     - Prices: INR 29/month, INR 249/year");
    console.log("  2. Create missing Play Store subscriptions in Google Play Console");
    console.log("     - Subscription IDs: com.neurotick.monthly, com.neurotick.annual");
    console.log("     - Base plan IDs:    monthly, annual");
    console.log("     - Prices: INR 29/month, INR 249/year");
    console.log("  3. Re-run seed: pnpm --filter @workspace/scripts run seed:revenuecat");
    console.log("  4. Set missing Replit secrets printed by the seed script");
  } else {
    console.log("\nAll checks passed! RevenueCat is ready for sandbox testing.");
    console.log("Next: run a sandbox purchase on a physical device to confirm isPro = true.");
  }
  console.log("══════════════════════════════════════════\n");

  if (passed < total) {
    process.exitCode = 1;
  }
}

validateRevenueCat().catch((err) => {
  console.error("Validation failed:", err);
  process.exitCode = 1;
});
