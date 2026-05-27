import express, { Router, type IRouter } from "express";

const router: IRouter = Router();

// Serve icon images directly
const iconDir = process.cwd() + "/artifacts/tenx/assets/images/icon-options";
router.use(express.static(iconDir));

// Alias the icon files
try {
  const files = require("fs").readdirSync(iconDir);
  files.forEach((f: string) => {
    router.get("/" + f, (_req, res) => res.sendFile(iconDir + "/" + f));
  });
} catch { /* ignore if dir missing */ }

router.get("/delete-account", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Delete Account — Topter</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #333; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .brand { color: #4f46e5; font-weight: 700; }
    p { margin: 12px 0; }
    .steps { background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .steps ol { margin: 0; padding-left: 20px; }
    .steps li { margin: 10px 0; }
    .warning { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 14px; margin: 20px 0; color: #856404; }
    .contact { margin-top: 32px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
    a { color: #4f46e5; }
  </style>
</head>
<body>
  <h1><span class="brand">Topter</span> — Delete Account</h1>

  <div class="warning" style="background:#ffeaea;border-color:#ffb3b3;color:#721c24;">
    <strong>Fastest way — Email us:</strong><br>
    Send an email from your registered address to <a href="mailto:toptersupport@gmail.com">toptersupport@gmail.com</a> with the subject <strong>"Delete my account"</strong>. We will permanently remove your account and all data within 7 days.
  </div>

  <p>You can also delete your account directly inside the <strong>Topter mobile app</strong>:</p>

  <div class="steps">
    <ol>
      <li>Make sure you are <strong>signed in</strong> to the app.</li>
      <li>Go to <strong>Settings</strong> from the Home screen menu.</li>
      <li>Scroll to the <strong>Account</strong> section.</li>
      <li>Tap <strong>Delete account</strong>.</li>
      <li>Confirm. Your account and all data will be permanently removed immediately.</li>
    </ol>
  </div>

  <div class="warning">
    <strong>What gets deleted:</strong><br>
    Profile (name, email, city, school, exam goal), all topics and study history, settings, and app preferences. This cannot be undone.
  </div>

  <div class="contact">
    <strong>Need help?</strong><br>
    Email <a href="mailto:toptersupport@gmail.com">toptersupport@gmail.com</a> from your registered email address and we will process your request within 7 days.
  </div>
</body>
</html>`);
});

// Serve icon preview gallery at /icon-preview
router.get("/icon-preview", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Topter App Icon Options</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #333; background: #f5f7fa; }
    h1 { font-size: 28px; margin-bottom: 8px; text-align: center; }
    .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
    .option { background: white; border-radius: 16px; padding: 24px; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .option-header { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
    .badge { background: #4f46e5; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
    .name { font-size: 18px; font-weight: 600; }
    .img-wrap { text-align: center; margin: 16px 0; }
    .img-wrap img { max-width: 280px; border-radius: 16px; border: 2px solid #eee; }
    .desc { color: #555; }
    .note { text-align: center; margin-top: 30px; color: #888; font-size: 14px; }
  </style>
</head>
<body>
  <h1>Topter App Icon Options</h1>
  <p class="subtitle">Pick one. All are AI-generated and 100% original.</p>

  <div class="option">
    <div class="option-header">
      <span class="badge">Option 1</span>
      <span class="name">Book Shield</span>
    </div>
    <div class="img-wrap">
      <img src="/api/icon-option-1.png" alt="Book Shield">
    </div>
    <p class="desc">A book inside a shield, indigo-to-teal gradient. Suggests secure learning and protected knowledge. Matches your app's dark blue theme.</p>
  </div>

  <div class="option">
    <div class="option-header">
      <span class="badge">Option 2</span>
      <span class="name">Puzzle T</span>
    </div>
    <div class="img-wrap">
      <img src="/api/icon-option-2.png" alt="Puzzle T">
    </div>
    <p class="desc">A geometric letter T made from interlocking learning blocks. Keeps your brand initial but makes it unique and original.</p>
  </div>

  <div class="option">
    <div class="option-header">
      <span class="badge">Option 3</span>
      <span class="name">Brain Lightbulb</span>
    </div>
    <div class="img-wrap">
      <img src="/api/icon-option-3.png" alt="Brain Lightbulb">
    </div>
    <p class="desc">A lightbulb with a brain inside, gold-to-indigo gradient. Suggests bright ideas, exam intelligence, and knowledge.</p>
  </div>

  <p class="note">Tell me "Option 1", "Option 2", or "Option 3" and I'll make it your app icon.</p>
</body>
</html>`);
});

export default router;
