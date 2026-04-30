import { createElement } from "react";
import { NextResponse } from "next/server";
import { render } from "@react-email/render";
import { Resend } from "resend";
import SignInLinkEmail from "@/emails/sign-in-link";
import { getEmailAssetOrigin, resolveContinueOrigin } from "@/lib/app-origin";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

const REGISTRATION_OPEN = process.env.NEXT_PUBLIC_REGISTRATION_OPEN !== "false";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function emailHasWhitelistEntryAdmin(normalizedEmail: string): Promise<boolean> {
  const snap = await getAdminDb().collection("whitelist").doc(normalizedEmail).get();
  return snap.exists;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = typeof body === "object" && body && "email" in body ? (body as { email: unknown }).email : null;
  if (typeof email !== "string" || !isValidEmail(email.trim())) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const clientOrigin =
    typeof body === "object" && body && "origin" in body ? (body as { origin: unknown }).origin : null;

  const normalized = email.trim().toLowerCase();

  if (!process.env.RESEND_API_KEY?.trim() || !process.env.RESEND_FROM?.trim()) {
    return NextResponse.json(
      { error: "Transactional email is not configured (RESEND_API_KEY / RESEND_FROM)." },
      { status: 503 },
    );
  }

  let auth;
  try {
    auth = getAdminAuth();
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Server auth is not configured (FIREBASE_SERVICE_ACCOUNT_JSON).";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  let inWhitelist: boolean;
  try {
    inWhitelist = await emailHasWhitelistEntryAdmin(normalized);
  } catch {
    return NextResponse.json({ error: "Could not verify access. Try again later." }, { status: 500 });
  }

  if (!inWhitelist && !REGISTRATION_OPEN) {
    return NextResponse.json({ error: "Registration is currently closed." }, { status: 403 });
  }

  const isNewUser = !inWhitelist;
  const continueUrl = `${resolveContinueOrigin(clientOrigin)}/login`;

  let signInUrl: string;
  try {
    signInUrl = await auth.generateSignInWithEmailLink(normalized, {
      url: continueUrl,
      handleCodeInApp: true,
    });
  } catch (e) {
    console.error("generateSignInWithEmailLink failed:", e);
    return NextResponse.json({ error: "Could not create sign-in link. Try again later." }, { status: 500 });
  }

  const assetOrigin = getEmailAssetOrigin();
  if (assetOrigin.startsWith("http://localhost") || assetOrigin.startsWith("http://127.")) {
    console.warn(
      "[send-magic-link] Email images/fonts use a non-public URL. Set EMAIL_ASSET_ORIGIN (e.g. https://your-deployed-domain) so inboxes can load assets.",
    );
  }
  const html = await render(
    createElement(SignInLinkEmail, {
      signInUrl,
      recipientEmail: normalized,
      isNewUser,
      assetOrigin,
    }),
  );

  const subject = isNewUser ? "Confirm your email — Kanon" : "Your sign-in link — Kanon";

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM,
    to: normalized,
    subject,
    html,
  });

  if (error) {
    console.error("Resend error:", error);
    return NextResponse.json({ error: "Could not send email. Try again later." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
