#!/usr/bin/env node
/**
 * Generate VAPID keys for MINERVOT Web Push.
 * Prints env var names only as assignment templates — never commits secrets.
 *
 * Usage: node scripts/generate-vapid-keys.mjs
 */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("# Add these to Vercel / .env.local (do not commit private key)");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("VAPID_SUBJECT=mailto:ops@your-domain.example");
