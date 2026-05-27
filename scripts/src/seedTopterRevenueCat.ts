import { getUncachableRevenueCatClient } from "./revenueCatClient";
import {
  Duration,
  EligibilityCriteria,
  listApps,
  createApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  detachProductsFromPackage,
  getProductsFromPackage,
  type App,
  type Product,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

const PROJECT_ID = "proj985a48e9"; // Topter project

// Google Play subscription IDs (must match exactly what you create in Play Console)
// Format: "{subscriptionId}:{basePlanId}"
const PLAY_MONTHLY_IDENTIFIER = "com.topter.app.monthly:monthly";
const PLAY_ANNUAL_IDENTIFIER = "com.topter.app.annual:annual";

// Test store product IDs (used in Expo Go / sandbox testing)
const TEST_MONTHLY_IDENTIFIER = "topter_pro_monthly";
const TEST_ANNUAL_IDENTIFIER = "topter_pro_annual";

const PLAY_APP_NAME = "Topter Android";
const PLAY_PACKAGE_NAME = "com.topter.app";

const ENTITLEMENT_LOOKUP_KEY = "pro"; // must match REVENUECAT_ENTITLEMENT_IDENTIFIER in app code
const ENTITLEMENT_DISPLAY_NAME = "Pro Access";

const OFFERING_IDENTIFIER = "default";
const OFFERING_DISPLAY_NAME = "Default Offering";

interface RcApiError {
  type?: string;
  message?: string;
}

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

async function seedTopterRevenueCat() {
  const client = await getUncachableRevenueCatClient();

  console.log(`\n══════════════════════════════════════════`);
  console.log(`  Seeding Topter RevenueCat (${PROJECT_ID})`);
  console.log(`══════════════════════════════════════════\n`);

  // ── Apps ───────────────────────────────────────────────────────────────────
  const { data: appsData, error: appsErr } = await listApps({
    client,
    path: { project_id: PROJECT_ID },
    query: { limit: 20 },
  });
  if (appsErr || !appsData) throw new Error("Failed to list apps");

  const testApp = appsData.items.find((a) => a.type === "test_store");
  let playApp = appsData.items.find((a) => a.type === "play_store");

  if (!testApp) throw new Error("No test store app found in Topter project");
  console.log("✅ Test Store app:", testApp.id);

  if (!playApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: PROJECT_ID },
      body: {
        name: PLAY_APP_NAME,
        type: "play_store",
        play_store: { package_name: PLAY_PACKAGE_NAME },
      },
    });
    if (error) throw new Error("Failed to create Play Store app: " + JSON.stringify(error));
    playApp = newApp;
    console.log("✅ Created Play Store app:", playApp.id);
  } else {
    console.log("✅ Play Store app:", playApp.id);
  }

  // ── Products ───────────────────────────────────────────────────────────────
  const { data: existingProducts, error: listProductsError } = await listProducts({
    client,
    path: { project_id: PROJECT_ID },
    query: { limit: 100 },
  });
  if (listProductsError) throw new Error("Failed to list products");

  const ensureProduct = async (
    targetApp: App,
    label: string,
    storeIdentifier: string,
    displayName: string,
    duration: Duration,
    isTestStore: boolean,
  ): Promise<Product> => {
    const existing = existingProducts.items?.find(
      (p) => p.store_identifier === storeIdentifier && p.app_id === targetApp.id,
    );
    if (existing) {
      console.log(`✅ ${label} product exists: ${existing.id}`);
      return existing;
    }
    const body: CreateProductData["body"] = {
      store_identifier: storeIdentifier,
      app_id: targetApp.id,
      type: "subscription",
      display_name: displayName,
    };
    if (isTestStore) {
      body.subscription = { duration };
      body.title = displayName;
    }
    const { data: created, error } = await createProduct({
      client,
      path: { project_id: PROJECT_ID },
      body,
    });
    if (error) throw new Error(`Failed to create ${label} product: ` + JSON.stringify(error));
    console.log(`✅ Created ${label} product: ${created.id}`);
    return created;
  };

  const [testMonthly, testAnnual, playMonthly, playAnnual] = await Promise.all([
    ensureProduct(testApp, "Test/Monthly", TEST_MONTHLY_IDENTIFIER, "Topter Pro Monthly", Duration.P1M, true),
    ensureProduct(testApp, "Test/Annual", TEST_ANNUAL_IDENTIFIER, "Topter Pro Annual", Duration.P1Y, true),
    ensureProduct(playApp, "Play/Monthly", PLAY_MONTHLY_IDENTIFIER, "Monthly ₹29 (Android)", Duration.P1M, false),
    ensureProduct(playApp, "Play/Annual", PLAY_ANNUAL_IDENTIFIER, "Annual ₹249 (Android)", Duration.P1Y, false),
  ]);

  // Add test store prices (USD minimum $0.99; real INR pricing is set in Play Console)
  const addTestPrices = async (productId: string, prices: { amount_micros: number; currency: string }[]) => {
    const { error } = await client.post<TestStorePricesResponse>({
      url: "/projects/{project_id}/products/{product_id}/test_store_prices",
      path: { project_id: PROJECT_ID, product_id: productId },
      body: { prices },
    });
    if (error) {
      const rcErr = error as RcApiError;
      if (rcErr.type === "resource_already_exists") {
        console.log("✅ Test store prices already exist for:", productId);
      } else {
        console.error("Price error:", JSON.stringify(error, null, 2));
        throw new Error("Failed to add test store prices for: " + productId);
      }
    } else {
      console.log("✅ Added test store prices for:", productId);
    }
  };

  await addTestPrices(testMonthly.id, [{ amount_micros: 990000, currency: "USD" }]);
  await addTestPrices(testAnnual.id, [{ amount_micros: 4990000, currency: "USD" }]);

  // ── Entitlement ────────────────────────────────────────────────────────────
  const { data: existingEntitlements, error: listEntErr } = await listEntitlements({
    client,
    path: { project_id: PROJECT_ID },
    query: { limit: 20 },
  });
  if (listEntErr) throw new Error("Failed to list entitlements");

  let entitlement: Entitlement;
  const existingEnt = existingEntitlements.items?.find(
    (e) => e.lookup_key === ENTITLEMENT_LOOKUP_KEY,
  );
  if (existingEnt) {
    console.log(`✅ Entitlement "${ENTITLEMENT_LOOKUP_KEY}" exists: ${existingEnt.id}`);
    entitlement = existingEnt;
  } else {
    const { data: newEnt, error } = await createEntitlement({
      client,
      path: { project_id: PROJECT_ID },
      body: { lookup_key: ENTITLEMENT_LOOKUP_KEY, display_name: ENTITLEMENT_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create entitlement: " + JSON.stringify(error));
    console.log(`✅ Created entitlement "${ENTITLEMENT_LOOKUP_KEY}": ${newEnt.id}`);
    entitlement = newEnt;
  }

  const { error: attachEntErr } = await attachProductsToEntitlement({
    client,
    path: { project_id: PROJECT_ID, entitlement_id: entitlement.id },
    body: {
      product_ids: [testMonthly.id, testAnnual.id, playMonthly.id, playAnnual.id],
    },
  });
  if (attachEntErr) {
    const rcErr = attachEntErr as RcApiError;
    if (rcErr.type === "unprocessable_entity_error") {
      console.log("✅ Products already attached to entitlement");
    } else {
      throw new Error("Failed to attach products to entitlement: " + JSON.stringify(attachEntErr));
    }
  } else {
    console.log("✅ Attached products to entitlement");
  }

  // ── Offering ───────────────────────────────────────────────────────────────
  const { data: existingOfferings, error: listOffErr } = await listOfferings({
    client,
    path: { project_id: PROJECT_ID },
    query: { limit: 20 },
  });
  if (listOffErr) throw new Error("Failed to list offerings");

  let offering: Offering;
  const existingOff = existingOfferings.items?.find(
    (o) => o.lookup_key === OFFERING_IDENTIFIER,
  );
  if (existingOff) {
    console.log(`✅ Offering "${OFFERING_IDENTIFIER}" exists: ${existingOff.id}`);
    offering = existingOff;
  } else {
    const { data: newOff, error } = await createOffering({
      client,
      path: { project_id: PROJECT_ID },
      body: { lookup_key: OFFERING_IDENTIFIER, display_name: OFFERING_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create offering: " + JSON.stringify(error));
    console.log(`✅ Created offering: ${newOff.id}`);
    offering = newOff;
  }

  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: PROJECT_ID, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering as current");
    console.log("✅ Set offering as current");
  } else {
    console.log("✅ Offering is already current");
  }

  // ── Packages ───────────────────────────────────────────────────────────────
  const { data: existingPkgs, error: listPkgsErr } = await listPackages({
    client,
    path: { project_id: PROJECT_ID, offering_id: offering.id },
    query: { limit: 20 },
  });
  if (listPkgsErr) throw new Error("Failed to list packages");

  const ensurePackage = async (lookupKey: string, displayName: string): Promise<Package> => {
    const existing = existingPkgs.items?.find((p) => p.lookup_key === lookupKey);
    if (existing) {
      console.log(`✅ Package "${lookupKey}" exists: ${existing.id}`);
      return existing;
    }
    const { data: newPkg, error } = await createPackages({
      client,
      path: { project_id: PROJECT_ID, offering_id: offering.id },
      body: { lookup_key: lookupKey, display_name: displayName },
    });
    if (error) throw new Error(`Failed to create package ${lookupKey}: ` + JSON.stringify(error));
    console.log(`✅ Created package "${lookupKey}": ${newPkg.id}`);
    return newPkg;
  };

  const monthlyPkg = await ensurePackage("$rc_monthly", "Monthly");
  const annualPkg = await ensurePackage("$rc_annual", "Annual");

  const syncPkg = async (
    pkg: Package,
    desiredProducts: { product_id: string; eligibility_criteria: EligibilityCriteria }[],
  ) => {
    const { data: existing, error: fetchErr } = await getProductsFromPackage({
      client,
      path: { project_id: PROJECT_ID, package_id: pkg.id },
    });
    if (fetchErr) throw new Error(`Failed to fetch products for package ${pkg.lookup_key}`);

    const existingIds = new Set(
      (existing?.items ?? []).map((p) => p.product?.id).filter(Boolean) as string[],
    );
    const desiredIds = new Set(desiredProducts.map((p) => p.product_id));

    // Detach stale products
    const stale = [...existingIds].filter((id) => !desiredIds.has(id));
    if (stale.length > 0) {
      console.log(`Detaching ${stale.length} stale product(s) from ${pkg.lookup_key}`);
      const { error: detachErr } = await detachProductsFromPackage({
        client,
        path: { project_id: PROJECT_ID, package_id: pkg.id },
        body: { product_ids: stale },
      });
      if (detachErr) throw new Error(`Failed to detach stale products from ${pkg.lookup_key}`);
    }

    // Attach desired products not already present
    const toAttach = desiredProducts.filter((p) => !existingIds.has(p.product_id));
    if (toAttach.length === 0) {
      console.log(`✅ Package "${pkg.lookup_key}" already has all desired products`);
      return;
    }
    const { error } = await attachProductsToPackage({
      client,
      path: { project_id: PROJECT_ID, package_id: pkg.id },
      body: { products: toAttach },
    });
    if (error) throw new Error(`Failed to attach products to ${pkg.lookup_key}: ` + JSON.stringify(error));
    console.log(`✅ Attached ${toAttach.length} product(s) to "${pkg.lookup_key}"`);
  };

  await syncPkg(monthlyPkg, [
    { product_id: testMonthly.id, eligibility_criteria: EligibilityCriteria.ALL },
    { product_id: playMonthly.id, eligibility_criteria: EligibilityCriteria.ALL },
  ]);
  await syncPkg(annualPkg, [
    { product_id: testAnnual.id, eligibility_criteria: EligibilityCriteria.ALL },
    { product_id: playAnnual.id, eligibility_criteria: EligibilityCriteria.ALL },
  ]);

  // ── API Keys ───────────────────────────────────────────────────────────────
  const { data: testKeys } = await listAppPublicApiKeys({
    client,
    path: { project_id: PROJECT_ID, app_id: testApp.id },
  });
  const { data: playKeys } = await listAppPublicApiKeys({
    client,
    path: { project_id: PROJECT_ID, app_id: playApp.id },
  });

  console.log("\n══════════════════════════════════════════");
  console.log("  ✅ Topter RevenueCat Setup Complete!");
  console.log("══════════════════════════════════════════\n");
  console.log("Update these Replit secrets with the values below:\n");
  console.log(`  REVENUECAT_PROJECT_ID          = ${PROJECT_ID}`);
  console.log(`  REVENUECAT_TEST_STORE_APP_ID   = ${testApp.id}`);
  console.log(`  REVENUECAT_GOOGLE_PLAY_STORE_APP_ID = ${playApp.id}`);
  console.log(`  EXPO_PUBLIC_REVENUECAT_TEST_API_KEY = ${testKeys?.items[0]?.key ?? "N/A"}`);
  console.log(`  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY = ${playKeys?.items[0]?.key ?? "N/A"}`);
  console.log(`\nPlay Store products to create in Google Play Console:`);
  console.log(`  Subscription ID: com.topter.app.monthly  Base Plan ID: monthly`);
  console.log(`  Subscription ID: com.topter.app.annual   Base Plan ID: annual`);
  console.log(`  Prices: ₹29/month, ₹249/year`);
  console.log("\n══════════════════════════════════════════\n");
}

seedTopterRevenueCat().catch((err) => {
  console.error("Seed failed:", err);
  process.exitCode = 1;
});
