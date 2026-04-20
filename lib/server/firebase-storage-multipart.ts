/**
 * Firebase Storage REST multipart upload (same wire format as the web SDK).
 */

function firstDownloadToken(data: Record<string, unknown>): string | undefined {
  const raw = data.downloadTokens;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  return raw.split(",")[0]?.trim() || undefined;
}

export interface FirebaseMultipartUploadResult {
  downloadUrl: string;
  storagePath: string;
}

export async function firebaseStorageMultipartUpload(opts: {
  bucket: string;
  idToken: string;
  storagePath: string;
  bytes: Buffer;
  contentType: string;
  appId?: string;
}): Promise<FirebaseMultipartUploadResult> {
  const { bucket, idToken, storagePath, bytes, contentType, appId } = opts;
  const enc = encodeURIComponent;
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${enc(bucket)}/o?name=${enc(storagePath)}`;

  const boundary = `kanon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const metaJson = JSON.stringify({ name: storagePath, contentType });
  const crlf = "\r\n";
  const prefix =
    `--${boundary}${crlf}` +
    `Content-Type: application/json; charset=utf-8${crlf}${crlf}` +
    metaJson +
    `${crlf}--${boundary}${crlf}` +
    `Content-Type: ${contentType}${crlf}${crlf}`;
  const suffix = `${crlf}--${boundary}--${crlf}`;
  const uploadBody = Buffer.concat([Buffer.from(prefix, "utf8"), bytes, Buffer.from(suffix, "utf8")]);

  const uploadHeaders: Record<string, string> = {
    Authorization: `Bearer ${idToken}`,
    "X-Goog-Upload-Protocol": "multipart",
    "Content-Type": `multipart/related; boundary=${boundary}`,
  };
  if (appId) uploadHeaders["X-Firebase-GMPID"] = appId;
  uploadHeaders["X-Firebase-Storage-Version"] = "webjs/12";

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: uploadHeaders,
    body: uploadBody,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => uploadRes.statusText);
    throw new Error(`Storage upload failed (${uploadRes.status}): ${errText}`);
  }

  const uploadData = (await uploadRes.json()) as Record<string, unknown>;
  let token = firstDownloadToken(uploadData);
  if (!token) {
    const metaUrl = `https://firebasestorage.googleapis.com/v0/b/${enc(bucket)}/o/${enc(storagePath)}`;
    const metaRes = await fetch(metaUrl, {
      headers: { Authorization: `Firebase ${idToken}` },
    });
    if (metaRes.ok) {
      token = firstDownloadToken((await metaRes.json()) as Record<string, unknown>);
    }
  }

  const baseObjectUrl = `https://firebasestorage.googleapis.com/v0/b/${enc(bucket)}/o/${enc(storagePath)}`;
  const downloadUrl = token
    ? `${baseObjectUrl}?alt=media&token=${encodeURIComponent(token)}`
    : baseObjectUrl;

  if (!token) {
    throw new Error(
      "Upload succeeded but no download token was returned. Without a token, browsers cannot read the file."
    );
  }

  return { downloadUrl, storagePath };
}
