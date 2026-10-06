// Creates (or resets the password of) your single TradeMax login.
// Usage: npm run create-user   (reads .env.local)
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.TRADEMAX_EMAIL;
const password = process.env.TRADEMAX_PASSWORD;

const missing = Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  TRADEMAX_EMAIL: email,
  TRADEMAX_PASSWORD: password,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) {
  console.error("Could not list users:", listError.message);
  process.exit(1);
}

const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  if (error) {
    console.error("Could not update user:", error.message);
    process.exit(1);
  }
  console.log(`Updated password for ${email}`);
} else {
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    console.error("Could not create user:", error.message);
    process.exit(1);
  }
  console.log(`Created user ${email}`);
}
