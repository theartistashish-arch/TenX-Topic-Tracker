import { getUncachableRevenueCatClient } from "./revenueCatClient";

import {
  Duration,
  EligibilityCriteria,
  listProjects,
  createProject,
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
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

const PROJECT_NAME = "NeuroTick";

// App Store Connect product IDs — these must match EXACTLY what is created in App Store Connect.
// In App Store Connect: create two Auto-Renewable Subscriptions with these Product IDs.
const APP_STORE_MONTHLY_IDENTIFIER = "com.neurotick.monthly";
const APP_STORE_ANNUAL_IDENTIFIER = "com.neurotick.annual";

// Google Play subscription product IDs.
// RevenueCat format: "{subscriptionId}:{basePlanId}"
// In Google Play Console: create subscriptions with IDs "com.neurotick.monthly" and
// "com.neurotick.annual", each with base plan IDs "monthly" and "annual" respectively.
const PLAY_STORE_MONTHLY_IDENTIFIER = "com.neurotick.monthly:monthly";
const PLAY_STORE_ANNUAL_IDENTIFIER = "com.neurotick.annual:annual";

// Test-store product IDs (Expo Go / web sandbox only — not tied to any real store).
const TEST_MONTHLY_IDENTIFIER = "neurotick_pro_monthly";
const TEST_ANNUAL_IDENTIFIER = "neurotick_pro_annual";

const APP_STORE_APP_NAME = "NeuroTick iOS";
const APP_STORE_BUNDLE_ID = "com.neurotick.app";
const PLAY_STORE_APP_NAME = "NeuroTick Android";
const PLAY_STORE_PACKAGE_NAME = "com.neurotick.app";

const ENTITLEMENT_IDENTIFIER = "pro";
const ENTITLEMENT_DISPLAY_NAME = "Pro Access";

const OFFERING_IDENTIFIER = "default";
const OFFERING_DISPLAY_NAME = "Default Offering";

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

interface RcApiError {
  type?: string;
  message?: string;
}

async function seedRevenueCat() {
  const client = await getUncachableRevenueCatClient();

  // ── Project ────────────────────────────────────────────────────────────────
  let project: Project;
  const { data: existingProjects, error: listProjectsError } =
    await listProjects({ client, query: { limit: 20 } });
  if (listProjectsError) throw new Error("Failed to list projects");

  const existingProject = existingProjects.items?.find(
    (p) => p.name === PROJECT_NAME,
  );
  if (existingProject) {
    console.log("Project already exists:", existingProject.id);
    project = existingProject;
  } else {
    const { data: newProject, error } = await createProject({
      client,
      body: { name: PROJECT_NAME },
    });
    if (error) throw new Error("Failed to create project");
    console.log("Created project:", newProject.id);
    project = newProject;
  }

  // ── Apps ───────────────────────────────────────────────────────────────────
  const { data: apps, error: listAppsError } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listAppsError || !apps || apps.items.length === 0) {
    throw new Error("No apps found");
  }

  let app: App | undefined = apps.items.find((a) => a.type === "test_store");
  let appStoreApp: App | undefined = apps.items.find(
    (a) => a.type === "app_store",
  );
  let playStoreApp: App | undefined = apps.items.find(
    (a) => a.type === "play_store",
  );

  if (!app) throw new Error("No test store app found");
  console.log("Test store app:", app.id);

  if (!appStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: APP_STORE_APP_NAME,
        type: "app_store",
        app_store: { bundle_id: APP_STORE_BUNDLE_ID },
      },
    });
    if (error) throw new Error("Failed to create App Store app");
    appStoreApp = newApp;
    console.log("Created App Store app:", appStoreApp.id);
  } else {
    console.log("App Store app found:", appStoreApp.id);
  }

  if (!playStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: PLAY_STORE_APP_NAME,
        type: "play_store",
        play_store: { package_name: PLAY_STORE_PACKAGE_NAME },
      },
    });
    if (error) throw new Error("Failed to create Play Store app");
    playStoreApp = newApp;
    console.log("Created Play Store app:", playStoreApp.id);
  } else {
    console.log("Play Store app found:", playStoreApp.id);
  }

  // ── Products ───────────────────────────────────────────────────────────────
  const { data: existingProducts, error: listProductsError } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  if (listProductsError) throw new Error("Failed to list products");

  const ensureProduct = async (
    targetApp: App,
    label: string,
    storeIdentifier: string,
    displayName: string,
    duration: import("@replit/revenuecat-sdk").Duration,
    isTestStore: boolean,
  ): Promise<Product> => {
    const existing = existingProducts.items?.find(
      (p) => p.store_identifier === storeIdentifier && p.app_id === targetApp.id,
    );
    if (existing) {
      console.log(`${label} product already exists:`, existing.id);
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
      path: { project_id: project.id },
      body,
    });
    if (error) {
      console.error(`Failed to create ${label} product:`, JSON.stringify(error, null, 2));
      throw new Error(`Failed to create ${label} product`);
    }
    console.log(`Created ${label} product:`, created.id);
    return created;
  };

  const [
    testMonthly,
    testAnnual,
    appStoreMonthly,
    appStoreAnnual,
    playMonthly,
    playAnnual,
  ] = await Promise.all([
    ensureProduct(app, "Test/Monthly", TEST_MONTHLY_IDENTIFIER, "NeuroTick Pro Monthly", Duration.P1M, true),
    ensureProduct(app, "Test/Annual", TEST_ANNUAL_IDENTIFIER, "NeuroTick Pro Annual", Duration.P1Y, true),
    ensureProduct(appStoreApp, "AppStore/Monthly", APP_STORE_MONTHLY_IDENTIFIER, "Monthly ₹29 (iOS)", Duration.P1M, false),
    ensureProduct(appStoreApp, "AppStore/Annual", APP_STORE_ANNUAL_IDENTIFIER, "Annual ₹249 (iOS)", Duration.P1Y, false),
    ensureProduct(playStoreApp, "Play/Monthly", PLAY_STORE_MONTHLY_IDENTIFIER, "Monthly ₹29 (Android)", Duration.P1M, false),
    ensureProduct(playStoreApp, "Play/Annual", PLAY_STORE_ANNUAL_IDENTIFIER, "Annual ₹249 (Android)", Duration.P1Y, false),
  ]);

  // Test store prices: ₹29/month → 290000 micros INR, ₹249/year → 2490000 micros INR
  const addTestPrices = async (productId: string, prices: { amount_micros: number; currency: string }[]) => {
    const { error } = await client.post<TestStorePricesResponse>({
      url: "/projects/{project_id}/products/{product_id}/test_store_prices",
      path: { project_id: project.id, product_id: productId },
      body: { prices },
    });
    if (error) {
      const rcErr = error as RcApiError;
      if (rcErr.type === "resource_already_exists") {
        console.log("Test store prices already exist for product:", productId);
      } else {
        console.error("Price error details:", JSON.stringify(error, null, 2));
        throw new Error("Failed to add test store prices for product: " + productId);
      }
    } else {
      console.log("Added test store prices for product:", productId);
    }
  };

  // Test store prices in USD (test store minimum is $0.99; real INR pricing ₹29/₹249
  // is configured in App Store Connect / Play Console for production)
  await addTestPrices(testMonthly.id, [{ amount_micros: 990000, currency: "USD" }]);
  await addTestPrices(testAnnual.id, [{ amount_micros: 1990000, currency: "USD" }]);

  // ── Entitlement ────────────────────────────────────────────────────────────
  let entitlement: Entitlement;
  const { data: existingEntitlements, error: listEntitlementsError } =
    await listEntitlements({ client, path: { project_id: project.id }, query: { limit: 20 } });
  if (listEntitlementsError) throw new Error("Failed to list entitlements");

  const existingEnt = existingEntitlements.items?.find(
    (e) => e.lookup_key === ENTITLEMENT_IDENTIFIER,
  );
  if (existingEnt) {
    console.log("Entitlement already exists:", existingEnt.id);
    entitlement = existingEnt;
  } else {
    const { data: newEnt, error } = await createEntitlement({
      client,
      path: { project_id: project.id },
      body: { lookup_key: ENTITLEMENT_IDENTIFIER, display_name: ENTITLEMENT_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create entitlement");
    console.log("Created entitlement:", newEnt.id);
    entitlement = newEnt;
  }

  const { error: attachEntErr } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: entitlement.id },
    body: {
      product_ids: [
        testMonthly.id, testAnnual.id,
        appStoreMonthly.id, appStoreAnnual.id,
        playMonthly.id, playAnnual.id,
      ],
    },
  });
  if (attachEntErr) {
    if ((attachEntErr as RcApiError).type === "unprocessable_entity_error") {
      console.log("Products already attached to entitlement");
    } else {
      throw new Error("Failed to attach products to entitlement");
    }
  } else {
    console.log("Attached products to entitlement");
  }

  // ── Offering ───────────────────────────────────────────────────────────────
  let offering: Offering;
  const { data: existingOfferings, error: listOfferingsError } =
    await listOfferings({ client, path: { project_id: project.id }, query: { limit: 20 } });
  if (listOfferingsError) throw new Error("Failed to list offerings");

  const existingOff = existingOfferings.items?.find(
    (o) => o.lookup_key === OFFERING_IDENTIFIER,
  );
  if (existingOff) {
    console.log("Offering already exists:", existingOff.id);
    offering = existingOff;
  } else {
    const { data: newOff, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: { lookup_key: OFFERING_IDENTIFIER, display_name: OFFERING_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create offering");
    console.log("Created offering:", newOff.id);
    offering = newOff;
  }

  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering as current");
    console.log("Set offering as current");
  }

  // ── Packages ───────────────────────────────────────────────────────────────
  const { data: existingPkgs, error: listPkgsError } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offering.id },
    query: { limit: 20 },
  });
  if (listPkgsError) throw new Error("Failed to list packages");

  const ensurePackage = async (
    lookupKey: string,
    displayName: string,
  ): Promise<Package> => {
    const existing = existingPkgs.items?.find((p) => p.lookup_key === lookupKey);
    if (existing) {
      console.log(`Package ${lookupKey} already exists:`, existing.id);
      return existing;
    }
    const { data: newPkg, error } = await createPackages({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { lookup_key: lookupKey, display_name: displayName },
    });
    if (error) throw new Error(`Failed to create package ${lookupKey}`);
    console.log(`Created package ${lookupKey}:`, newPkg.id);
    return newPkg;
  };

  const monthlyPkg = await ensurePackage("$rc_monthly", "Monthly ₹29");
  const annualPkg = await ensurePackage("$rc_annual", "Annual ₹249");

  // Migration-safe package attachment:
  // 1. Fetch existing products in the package.
  // 2. Detach any products that are NOT in the desired set (stale from prior runs).
  // 3. Attach desired products that are not yet present.
  const syncPkg = async (
    pkg: Package,
    desiredProducts: { product_id: string; eligibility_criteria: import("@replit/revenuecat-sdk").EligibilityCriteria }[],
  ) => {
    const { data: existing, error: fetchErr } = await getProductsFromPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
    });
    if (fetchErr) throw new Error(`Failed to fetch products for package ${pkg.lookup_key}`);

    const existingIds = new Set((existing?.items ?? []).map((p) => p.product?.id).filter(Boolean) as string[]);
    const desiredIds = new Set(desiredProducts.map((p) => p.product_id));

    // Detach stale products (present but not in desired set).
    const stale = [...existingIds].filter((id) => !desiredIds.has(id));
    if (stale.length > 0) {
      console.log(`Detaching ${stale.length} stale product(s) from ${pkg.lookup_key}:`, stale);
      const { error: detachErr } = await detachProductsFromPackage({
        client,
        path: { project_id: project.id, package_id: pkg.id },
        body: { product_ids: stale },
      });
      if (detachErr) throw new Error(`Failed to detach stale products from package ${pkg.lookup_key}`);
    }

    // Attach desired products that are not already present.
    const toAttach = desiredProducts.filter((p) => !existingIds.has(p.product_id));
    if (toAttach.length === 0) {
      console.log(`Package ${pkg.lookup_key}: all desired products already attached`);
      return;
    }
    const { error } = await attachProductsToPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      body: { products: toAttach },
    });
    if (error) {
      console.error(`Failed to attach products to package ${pkg.lookup_key}:`, JSON.stringify(error, null, 2));
      throw new Error(`Failed to attach products to package ${pkg.lookup_key}`);
    }
    console.log(`Attached ${toAttach.length} product(s) to package ${pkg.lookup_key}`);
  };

  await syncPkg(monthlyPkg, [
    { product_id: testMonthly.id, eligibility_criteria: EligibilityCriteria.ALL },
    { product_id: appStoreMonthly.id, eligibility_criteria: EligibilityCriteria.ALL },
    { product_id: playMonthly.id, eligibility_criteria: EligibilityCriteria.ALL },
  ]);
  await syncPkg(annualPkg, [
    { product_id: testAnnual.id, eligibility_criteria: EligibilityCriteria.ALL },
    { product_id: appStoreAnnual.id, eligibility_criteria: EligibilityCriteria.ALL },
    { product_id: playAnnual.id, eligibility_criteria: EligibilityCriteria.ALL },
  ]);

  // ── API Keys ───────────────────────────────────────────────────────────────
  const { data: testKeys, error: testKeysErr } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: app.id },
  });
  if (testKeysErr) throw new Error("Failed to list Test Store public API keys");

  const { data: appStoreKeys, error: appStoreKeysErr } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: appStoreApp.id },
  });
  if (appStoreKeysErr) throw new Error("Failed to list App Store public API keys");

  const { data: playStoreKeys, error: playStoreKeysErr } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: playStoreApp.id },
  });
  if (playStoreKeysErr) throw new Error("Failed to list Play Store public API keys");

  console.log("\n====================");
  console.log("RevenueCat setup complete!");
  console.log("Project ID:", project.id);
  console.log("Test Store App ID:", app.id);
  console.log("App Store App ID:", appStoreApp.id);
  console.log("Play Store App ID:", playStoreApp.id);
  console.log("Entitlement Identifier:", ENTITLEMENT_IDENTIFIER);
  console.log("Public API Keys - Test Store:", testKeys?.items.map((k) => k.key).join(", ") ?? "N/A");
  console.log("Public API Keys - App Store:", appStoreKeys?.items.map((k) => k.key).join(", ") ?? "N/A");
  console.log("Public API Keys - Play Store:", playStoreKeys?.items.map((k) => k.key).join(", ") ?? "N/A");
  console.log("====================\n");
  console.log("Store these as environment secrets:");
  console.log("  REVENUECAT_PROJECT_ID =", project.id);
  console.log("  REVENUECAT_TEST_STORE_APP_ID =", app.id);
  console.log("  REVENUECAT_APPLE_APP_STORE_APP_ID =", appStoreApp.id);
  console.log("  REVENUECAT_GOOGLE_PLAY_STORE_APP_ID =", playStoreApp.id);
  console.log("  EXPO_PUBLIC_REVENUECAT_TEST_API_KEY =", testKeys?.items[0]?.key ?? "N/A");
  console.log("  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY =", appStoreKeys?.items[0]?.key ?? "N/A");
  console.log("  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY =", playStoreKeys?.items[0]?.key ?? "N/A");
}

seedRevenueCat().catch(console.error);
